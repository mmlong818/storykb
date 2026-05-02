import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.mjs";
import { hashString } from "./hash.mjs";
import { callClaude } from "./claude-runner.mjs";

const MIN_EVIDENCE_FOR_WIKI = 2;

const NORMALIZATION_INSTRUCTION = `你是编剧概念归并助手。给你一组候选概念名称（中英对照），它们由多个来源、多次抽取产生，可能存在表述差异。

任务：将其中指代同一概念的项归并为一个规范条目。
- 同一概念可能有：完全相同的中文名、相同英文名、子概念关系、近义表述、术语缩写、繁简差异。
- 不同概念即使相邻领域也保持独立，不要硬合并。

输出必须是合法 JSON，不带任何包裹文字。

格式：
{"clusters":[{"canonical_zh":"...","canonical_en":"...","aliases":["...","..."],"member_keys":["key1","key2",...]}]}

其中 member_keys 是输入项的 key 字段。canonical_zh/en 选最规范、最常见的表达。aliases 列出真正不同的别名（去重后）。`;

export async function consolidateConcepts(options = {}) {
  const mentionsPath = path.join(paths.queue, "concepts", "mentions.jsonl");
  if (!fs.existsSync(mentionsPath)) {
    throw new Error(`mentions file missing: ${mentionsPath}`);
  }

  const mentions = readMentions(mentionsPath);
  console.log(`[consolidate] mentions: ${mentions.length} chunks, ${mentions.reduce((s, m) => s + m.concepts.length, 0)} concepts`);

  const candidates = collectCandidates(mentions);
  console.log(`[consolidate] unique (zh,en) keys: ${candidates.size}`);

  const clusters = await clusterCandidates([...candidates.values()], options);
  console.log(`[consolidate] clusters: ${clusters.length}`);

  const conceptIndex = buildConceptIndex(clusters, candidates, mentions);
  const wikiCandidates = conceptIndex.filter((c) => c.evidence.length >= MIN_EVIDENCE_FOR_WIKI);
  console.log(`[consolidate] wiki candidates (≥${MIN_EVIDENCE_FOR_WIKI} evidence): ${wikiCandidates.length}`);

  const indexPath = path.join(paths.nodes, "wiki", "_concept_index.json");
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalCandidates: candidates.size,
    clusterCount: clusters.length,
    wikiCandidateCount: wikiCandidates.length,
    concepts: conceptIndex,
  }, null, 2), "utf8");
  console.log(`[consolidate] wrote ${indexPath}`);
  return { conceptCount: conceptIndex.length, wikiCandidates: wikiCandidates.length };
}

function readMentions(filePath) {
  return fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function collectCandidates(mentions) {
  const map = new Map();
  for (const row of mentions) {
    for (const c of row.concepts) {
      const key = makeKey(c.name_zh, c.name_en);
      if (!map.has(key)) {
        map.set(key, {
          key,
          name_zh: c.name_zh,
          name_en: c.name_en || "",
          types: new Set(),
          mentionCount: 0,
          chunks: [],
        });
      }
      const entry = map.get(key);
      entry.types.add(c.type);
      entry.mentionCount += 1;
      entry.chunks.push({ chunkId: row.chunkId, sourceId: row.sourceId, mention: c.mention });
    }
  }
  return map;
}

function makeKey(zh, en) {
  const a = (zh || "").trim().toLowerCase();
  const b = (en || "").trim().toLowerCase();
  return `${a}||${b}`;
}

async function clusterCandidates(candidates, options) {
  if (options.skipClustering) {
    return candidates.map((c) => ({ canonical_zh: c.name_zh, canonical_en: c.name_en, aliases: [], member_keys: [c.key] }));
  }
  const sorted = [...candidates].sort((a, b) => b.mentionCount - a.mentionCount);
  const batchSize = 60;
  const clusters = [];
  for (let i = 0; i < sorted.length; i += batchSize) {
    const batch = sorted.slice(i, i + batchSize);
    const inputItems = batch.map((c) => ({
      key: c.key,
      name_zh: c.name_zh,
      name_en: c.name_en,
      mention_count: c.mentionCount,
      sample_types: [...c.types].slice(0, 2),
    }));
    const prompt = `${NORMALIZATION_INSTRUCTION}\n\n输入：\n${JSON.stringify(inputItems, null, 2)}`;
    process.stdout.write(`[consolidate] clustering batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(sorted.length / batchSize)} (size=${batch.length})...`);
    try {
      const result = await callClaude(prompt, { timeoutMs: 240_000 });
      const parsed = result.parsed;
      if (parsed && Array.isArray(parsed.clusters)) {
        clusters.push(...parsed.clusters);
        console.log(` → ${parsed.clusters.length} clusters, $${result.meta?.costUsd?.toFixed(2)}`);
      } else {
        console.log(" → no clusters parsed; falling back to identity");
        for (const c of batch) clusters.push({ canonical_zh: c.name_zh, canonical_en: c.name_en, aliases: [], member_keys: [c.key] });
      }
    } catch (error) {
      console.log(` → error ${error.message}; falling back`);
      for (const c of batch) clusters.push({ canonical_zh: c.name_zh, canonical_en: c.name_en, aliases: [], member_keys: [c.key] });
    }
  }
  return clusters;
}

function buildConceptIndex(clusters, candidates, mentions) {
  const out = [];
  const seenKeys = new Set();
  for (const cluster of clusters) {
    const evidenceMap = new Map();
    const aliases = new Set(cluster.aliases || []);
    const types = new Set();
    let totalMentions = 0;
    for (const key of cluster.member_keys || []) {
      const cand = candidates.get(key);
      if (!cand) continue;
      seenKeys.add(key);
      if (cand.name_zh !== cluster.canonical_zh) aliases.add(cand.name_zh);
      if (cand.name_en && cand.name_en !== cluster.canonical_en) aliases.add(cand.name_en);
      cand.types.forEach((t) => types.add(t));
      totalMentions += cand.mentionCount;
      for (const ev of cand.chunks) {
        const eKey = `${ev.sourceId}::${ev.chunkId}`;
        if (!evidenceMap.has(eKey)) evidenceMap.set(eKey, ev);
      }
    }
    const conceptId = makeConceptId(cluster.canonical_zh, cluster.canonical_en);
    out.push({
      conceptId,
      canonical_zh: cluster.canonical_zh,
      canonical_en: cluster.canonical_en || "",
      aliases: [...aliases].filter(Boolean),
      types: [...types],
      mentionCount: totalMentions,
      evidence: [...evidenceMap.values()],
    });
  }
  for (const [key, cand] of candidates) {
    if (seenKeys.has(key)) continue;
    out.push({
      conceptId: makeConceptId(cand.name_zh, cand.name_en),
      canonical_zh: cand.name_zh,
      canonical_en: cand.name_en,
      aliases: [],
      types: [...cand.types],
      mentionCount: cand.mentionCount,
      evidence: cand.chunks,
    });
  }
  out.sort((a, b) => b.evidence.length - a.evidence.length);
  return out;
}

function makeConceptId(zh, en) {
  const seed = `${zh}|${en}`.toLowerCase();
  return hashString(seed).slice(0, 12);
}
