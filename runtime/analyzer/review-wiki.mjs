import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.mjs";
import { callClaude } from "./claude-runner.mjs";

const POLL_INTERVAL_MS = 30_000;
const EXTRA_DELAY_MS = 30_000; // callClaude already waits 90s; add 30s = ~120s per review call
const MAX_EVIDENCE_CHARS = 1500;

const SYSTEM_INSTRUCTION = `你是编剧知识库质量审核员。给你一条已合成的wiki条目及其原始证据，对条目内容进行准确性核查。

审核要点：
1. 幻觉：条目中出现了证据里没有提及的案例、作者、年份、人名、书名？
2. 遗漏：证据中有明确且重要的信息，条目未体现？
3. 误译：证据原文含义与条目中文表述有出入或曲解？
4. 矛盾：各章节之间相互冲突？
5. 语言：混入了韩文（가-힣）或日文假名（ぁ-ヿ）？

输出规则：
- 必须是合法 JSON，无任何包裹文字
- 字符串值内部禁止半角双引号，用「」代替
- 如无问题，issues 为空数组，corrections 为空对象

格式：
{
  "verdict": "pass 或 issues_found",
  "score": 整数1-10（10=完全准确，1=严重问题），
  "issues": [
    {
      "section": "definition|origins|components|mechanism|applications|examples|diagnostics|pitfalls",
      "type": "hallucination|missing|mistranslation|inconsistency|language",
      "severity": "high|medium|low",
      "description": "具体描述，引用原文作证据",
      "suggestion": "建议修改方向"
    }
  ],
  "corrections": {
    "section_name": "仅对 high severity 问题提供修正后的完整文字"
  }
}`;

export async function reviewWiki(options = {}) {
  const wikiDir = path.join(paths.nodes, "wiki");
  const reviewDir = path.join(paths.nodes, "wiki_reviews");
  fs.mkdirSync(reviewDir, { recursive: true });

  const limit = options.limit;
  const watchMode = options.watch ?? true;

  console.log(`[review] start watchMode=${watchMode} limit=${limit ?? "∞"}`);

  let reviewed = 0;
  let totalIssues = 0;
  let costSum = 0;

  async function processNewEntries() {
    const wikiFiles = fs.readdirSync(wikiDir)
      .filter(f => f.endsWith(".json") && !f.startsWith("_"));

    let targets = wikiFiles.filter(f => {
      return !fs.existsSync(path.join(reviewDir, f));
    });

    if (limit !== undefined) {
      targets = targets.slice(0, limit - reviewed);
    }

    for (const file of targets) {
      const wikiPath = path.join(wikiDir, file);
      const reviewPath = path.join(reviewDir, file);

      let entry;
      try {
        entry = JSON.parse(fs.readFileSync(wikiPath, "utf8"));
      } catch (e) {
        console.error(`[review] read error ${file}: ${e.message}`);
        continue;
      }

      await sleep(EXTRA_DELAY_MS);

      try {
        const result = await reviewOne(entry);
        fs.writeFileSync(reviewPath, JSON.stringify(result, null, 2), "utf8");

        // Apply high-severity corrections back to wiki entry
        const highCorrections = Object.entries(result.corrections || {})
          .filter(([sec]) => {
            const issue = result.issues.find(i => i.section === sec && i.severity === "high");
            return !!issue;
          });

        if (highCorrections.length > 0) {
          const updated = JSON.parse(fs.readFileSync(wikiPath, "utf8"));
          for (const [sec, text] of highCorrections) {
            if (updated.sections && sec in updated.sections) {
              updated.sections[sec] = text;
            }
          }
          updated.lastReviewedAt = new Date().toISOString();
          fs.writeFileSync(wikiPath, JSON.stringify(updated, null, 2), "utf8");
        }

        reviewed += 1;
        totalIssues += result.issues.length;
        costSum += result.costUsd;
        const issueStr = result.issues.length > 0 ? ` issues=${result.issues.length}` : " ok";
        console.log(`[review] #${reviewed} ${entry.canonical_zh.slice(0, 14)} score=${result.score}${issueStr} $=${costSum.toFixed(2)}`);
      } catch (error) {
        console.error(`[review] error ${entry.conceptId}: ${error.message}`);
      }
    }

    return targets.length;
  }

  if (watchMode) {
    while (true) {
      const found = await processNewEntries();
      if (found === 0) {
        console.log(`[review] idle, reviewed=${reviewed} issues=${totalIssues}, polling in ${POLL_INTERVAL_MS / 1000}s`);
      }
      await sleep(POLL_INTERVAL_MS);
    }
  } else {
    await processNewEntries();
    console.log(`[review] done reviewed=${reviewed} issues=${totalIssues} cost=$${costSum.toFixed(2)}`);
  }
}

async function reviewOne(entry) {
  const evidence = loadEvidence(entry);
  const inputPayload = {
    canonical_zh: entry.canonical_zh,
    canonical_en: entry.canonical_en,
    types: entry.types,
    sections: entry.sections,
    source_perspectives: entry.source_perspectives,
    evidence: evidence,
  };

  const prompt = `${SYSTEM_INSTRUCTION}\n\n待审核条目：\n${JSON.stringify(inputPayload, null, 2)}`;
  const result = await callClaude(prompt, { timeoutMs: 180_000 });

  if (!result.parsed || typeof result.parsed !== "object") {
    throw new Error("review parse failed");
  }

  const parsed = result.parsed;
  return {
    conceptId: entry.conceptId,
    canonical_zh: entry.canonical_zh,
    reviewedAt: new Date().toISOString(),
    verdict: parsed.verdict || "pass",
    score: typeof parsed.score === "number" ? parsed.score : 10,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    corrections: parsed.corrections && typeof parsed.corrections === "object" ? parsed.corrections : {},
    costUsd: result.meta?.costUsd || 0,
  };
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

function loadEvidence(entry) {
  const out = [];
  for (const ev of (entry.evidence || []).slice(0, 6)) {
    const chunk = getChunk(ev.sourceId, ev.chunkId);
    if (!chunk) continue;
    out.push({
      sourceTitle: ev.sourceTitle,
      heading: chunk.heading || null,
      text: chunk.text.slice(0, MAX_EVIDENCE_CHARS),
    });
  }
  return out;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
