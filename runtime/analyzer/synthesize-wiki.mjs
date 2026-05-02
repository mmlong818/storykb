import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.mjs";
import { createQueue } from "./queue.mjs";
import { callClaude } from "./claude-runner.mjs";
import { startStage, tick, endStage, recordError } from "./progress.mjs";

const MAX_EVIDENCE = 8;
const MAX_EVIDENCE_CHARS = 1200;

const SYSTEM_INSTRUCTION = `你是百科条目合成助手。给你一个编剧领域的概念，以及若干来自不同书籍的原文证据片段，请合成一篇结构化的中文 wiki 条目。

写作要求：
1. 全部基于提供的证据，不要编造未在证据中出现的细节、案例、人名、出版年份。
2. 不同来源对同一概念可能侧重不同——在"来源观点对照"段落呈现这种差异，不要硬调和。
3. 用流畅的中文写作。每个 section 不超过 800 字。
4. 没有相关证据的 section 留空字符串，不要编造内容填充。
5. JSON 合法性关键约束：字符串值内部禁止出现半角双引号。需要表达引号语义时，必须用中文全角「」或『』或单引号。例如：打破「戏剧不能讲述史诗式故事」的观念，而不是用半角双引号包裹。

输出必须是合法 JSON，无任何包裹文字。

格式：
{
  "definition": "一段定义，说明该概念是什么、解决什么问题",
  "origins": "概念的起源、提出者、流派背景（仅当证据提及）",
  "components": "构成要素或子部件",
  "mechanism": "运作机制、内在逻辑",
  "applications": "应用场景、使用方法",
  "examples": "证据中提到的经典案例（必须可在证据中找到出处）",
  "diagnostics": "诊断要点、可执行的检查问题",
  "pitfalls": "常见误区、失败模式",
  "source_perspectives": [
    {"sourceTitle": "...", "view": "该来源对此概念的核心立场或独特角度，≤200字"}
  ],
  "related_concepts": ["相关概念1", "相关概念2"]
}`;

export async function synthesizeWiki(options = {}) {
  const indexPath = path.join(paths.nodes, "wiki", "_concept_index.json");
  if (!fs.existsSync(indexPath)) {
    throw new Error(`concept index missing: run consolidate first`);
  }
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const minEvidence = options.minEvidence ?? 2;
  const limit = options.limit;
  const targets = index.concepts
    .filter((c) => c.evidence.length >= minEvidence)
    .slice(0, limit ?? Infinity);
  console.log(`[wiki] synthesizing ${targets.length} concepts (min evidence=${minEvidence})`);

  const queue = createQueue("wiki");
  queue.recoverInFlight();
  for (const concept of targets) {
    queue.enqueue({ payload: { conceptId: concept.conceptId } });
  }
  const pending = queue.listPending();
  console.log(`[wiki] queue pending=${pending.length}`);

  startStage("synthesize-wiki", pending.length);
  const wikiDir = path.join(paths.nodes, "wiki");
  fs.mkdirSync(wikiDir, { recursive: true });

  let costSum = 0;
  let i = 0;
  for (const task of pending) {
    i += 1;
    const concept = index.concepts.find((c) => c.conceptId === task.payload.conceptId);
    if (!concept) {
      queue.fail(task, new Error("concept not in index"));
      continue;
    }
    queue.claim(task);
    try {
      const result = await synthesizeOne(concept);
      const wikiPath = path.join(wikiDir, `${concept.conceptId}.json`);
      fs.writeFileSync(wikiPath, JSON.stringify(result.entry, null, 2), "utf8");
      queue.complete(task, { sections: Object.keys(result.entry.sections).length, costUsd: result.costUsd });
      costSum += result.costUsd || 0;
      tick(`#${i} ${concept.canonical_zh.slice(0, 16)} $=${costSum.toFixed(2)}`);
    } catch (error) {
      recordError(`wiki ${concept.conceptId}`, error);
      queue.fail(task, error);
      tick(`#${i} ERR`);
    }
  }
  endStage();
  console.log("[wiki]", JSON.stringify({ ...queue.stats(), totalCostUsd: Number(costSum.toFixed(2)) }));
}

async function synthesizeOne(concept) {
  const evidence = await loadEvidence(concept);
  const inputPayload = {
    canonical_zh: concept.canonical_zh,
    canonical_en: concept.canonical_en,
    aliases: concept.aliases,
    types: concept.types,
    evidence: evidence.map((e) => ({
      sourceTitle: e.sourceTitle,
      heading: e.heading,
      text: e.text.slice(0, MAX_EVIDENCE_CHARS),
    })),
  };
  const prompt = `${SYSTEM_INSTRUCTION}\n\n输入：\n${JSON.stringify(inputPayload, null, 2)}`;
  const result = await callClaude(prompt, { timeoutMs: 300_000 });
  if (!result.parsed || typeof result.parsed !== "object") {
    const debugPath = path.join(paths.queue, "wiki", "raw_failed", `${concept.conceptId}.txt`);
    fs.mkdirSync(path.dirname(debugPath), { recursive: true });
    fs.writeFileSync(debugPath, result.raw || "(empty)", "utf8");
    throw new Error(`wiki parse failed; raw saved to ${debugPath}`);
  }
  const sections = result.parsed;
  const entry = {
    conceptId: concept.conceptId,
    canonical_zh: concept.canonical_zh,
    canonical_en: concept.canonical_en,
    aliases: concept.aliases,
    types: concept.types,
    sections: {
      definition: sections.definition || "",
      origins: sections.origins || "",
      components: sections.components || "",
      mechanism: sections.mechanism || "",
      applications: sections.applications || "",
      examples: sections.examples || "",
      diagnostics: sections.diagnostics || "",
      pitfalls: sections.pitfalls || "",
    },
    source_perspectives: Array.isArray(sections.source_perspectives) ? sections.source_perspectives.slice(0, 12) : [],
    related_concepts: Array.isArray(sections.related_concepts) ? sections.related_concepts.slice(0, 20) : [],
    evidence: evidence.map((e) => ({
      sourceId: e.sourceId,
      chunkId: e.chunkId,
      sourceTitle: e.sourceTitle,
      heading: e.heading,
      charStart: e.charStart,
      charEnd: e.charEnd,
    })),
    generatedAt: new Date().toISOString(),
  };
  return { entry, costUsd: result.meta?.costUsd || 0 };
}

const sourceTitleCache = new Map();
function getSourceTitle(sourceId) {
  if (!sourceTitleCache.has(sourceId)) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(paths.sources, sourceId, "meta.json"), "utf8"));
      sourceTitleCache.set(sourceId, (meta.originalName || sourceId.slice(0, 8)).replace(/\.[^.]+$/, ""));
    } catch {
      sourceTitleCache.set(sourceId, sourceId.slice(0, 8));
    }
  }
  return sourceTitleCache.get(sourceId);
}

const chunkCache = new Map();
function getChunk(sourceId, chunkId) {
  if (!chunkCache.has(sourceId)) {
    const file = path.join(paths.chunks, `${sourceId}.jsonl`);
    if (!fs.existsSync(file)) return null;
    const map = new Map();
    for (const line of fs.readFileSync(file, "utf8").split("\n").filter(Boolean)) {
      const c = JSON.parse(line);
      map.set(c.id, c);
    }
    chunkCache.set(sourceId, map);
  }
  return chunkCache.get(sourceId).get(chunkId);
}

async function loadEvidence(concept) {
  const out = [];
  const sortedEvidence = [...concept.evidence].slice(0, MAX_EVIDENCE * 2);
  const seenSources = new Set();
  for (const ev of sortedEvidence) {
    if (out.length >= MAX_EVIDENCE) break;
    const chunk = getChunk(ev.sourceId, ev.chunkId);
    if (!chunk) continue;
    const sourceTitle = getSourceTitle(ev.sourceId);
    if (seenSources.has(ev.sourceId) && out.length >= MAX_EVIDENCE / 2) continue;
    seenSources.add(ev.sourceId);
    out.push({
      sourceId: ev.sourceId,
      chunkId: ev.chunkId,
      sourceTitle,
      heading: chunk.heading,
      text: chunk.text,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
    });
  }
  return out;
}
