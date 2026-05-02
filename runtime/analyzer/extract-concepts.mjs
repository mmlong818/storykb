import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.mjs";
import { createQueue } from "./queue.mjs";
import { callClaude } from "./claude-runner.mjs";
import { startStage, tick, endStage, recordError } from "./progress.mjs";

const BATCH_SIZE = 5;
const CHUNK_TEXT_CAP = 1500;

const SYSTEM_INSTRUCTION = `你是编剧理论概念抽取助手。给定若干段中文/英文编剧书内容片段，识别其中真正被讨论、定义、举例的核心编剧/叙事概念。

要求：
1. 只抽取文本中确实出现并被讨论的概念，不要凭空补全。
2. 概念是名词或术语（如"三幕结构"、"激励事件"、"人物弧线"），不是整句论断。
3. 给出中文标准名 name_zh + 英文对照 name_en（若文中没有英文，根据编剧领域常识补全；若该概念无英文对应，留空字符串）。
4. type 取值之一：理论原则 / 结构概念 / 角色概念 / 场景技巧 / 流程方法 / 题材类型 / 类型公式 / 其他。
5. mention 是原文里能体现该概念的引用片段，≤80字。
6. 一段可识别 0-5 个概念。普通叙述、案例描述、举例文本不算概念。

输出必须是合法 JSON，没有任何 markdown 包裹或解释文字。

格式：
{"extractions":[{"chunkId":"...","concepts":[{"name_zh":"","name_en":"","type":"","mention":""}]}]}`;

export async function extractConcepts(options = {}) {
  const limit = options.limit;
  const dryRun = options.dryRun;
  const chunks = loadAllChunks();
  const ready = chunks.filter((c) => (c.meaningfulChars ?? 0) >= 50);
  const sliced = limit ? ready.slice(0, limit) : ready;
  console.log(`[extract] candidates=${ready.length}/${chunks.length} target=${sliced.length}`);

  const batches = [];
  for (let i = 0; i < sliced.length; i += BATCH_SIZE) {
    batches.push(sliced.slice(i, i + BATCH_SIZE));
  }

  const queue = createQueue("concepts");
  queue.recoverInFlight();
  for (const batch of batches) {
    queue.enqueue({ payload: { chunkIds: batch.map((c) => c.id) } });
  }

  const pending = queue.listPending();
  console.log(`[extract] queue pending=${pending.length}, batches=${batches.length}`);
  if (dryRun) return { pending: pending.length };

  startStage("extract-concepts", pending.length);
  const mentionsPath = path.join(paths.queue, "concepts", "mentions.jsonl");
  fs.mkdirSync(path.dirname(mentionsPath), { recursive: true });
  const mentionsStream = fs.openSync(mentionsPath, "a");

  let costSum = 0;
  let i = 0;
  for (const task of pending) {
    i += 1;
    queue.claim(task);
    try {
      const batchChunks = task.payload.chunkIds
        .map((id) => chunks.find((c) => c.id === id))
        .filter(Boolean);
      const result = await runOneBatch(batchChunks);
      const mentions = postprocess(result.parsed, batchChunks);
      for (const row of mentions) {
        fs.writeSync(mentionsStream, JSON.stringify(row) + "\n");
      }
      queue.complete(task, { count: mentions.length, costUsd: result.meta?.costUsd });
      costSum += result.meta?.costUsd || 0;
      tick(`#${i} chunks=${batchChunks.length} concepts=${mentions.reduce((s, r) => s + r.concepts.length, 0)} $=${costSum.toFixed(2)}`);
    } catch (error) {
      recordError(`batch ${task.id}`, error);
      queue.fail(task, error);
      tick(`#${i} ERR`);
    }
  }
  fs.closeSync(mentionsStream);
  endStage();

  const stats = queue.stats();
  console.log("[extract]", JSON.stringify({ ...stats, totalCostUsd: Number(costSum.toFixed(2)) }));
  return stats;
}

async function runOneBatch(batchChunks) {
  const inputPayload = batchChunks.map((c) => ({
    chunkId: c.id,
    sourceTitle: shortenSource(c.sourceId, c.heading),
    text: c.text.slice(0, CHUNK_TEXT_CAP),
  }));
  const prompt = `${SYSTEM_INSTRUCTION}\n\n输入：\n${JSON.stringify(inputPayload, null, 2)}`;
  return callClaude(prompt, { timeoutMs: 240_000 });
}

function postprocess(parsed, batchChunks) {
  if (!parsed || !Array.isArray(parsed.extractions)) return [];
  const validIds = new Set(batchChunks.map((c) => c.id));
  return parsed.extractions
    .filter((e) => validIds.has(e.chunkId) && Array.isArray(e.concepts))
    .map((e) => {
      const chunk = batchChunks.find((c) => c.id === e.chunkId);
      return {
        chunkId: e.chunkId,
        sourceId: chunk?.sourceId,
        concepts: e.concepts
          .filter((c) => c && typeof c.name_zh === "string" && c.name_zh.trim())
          .map((c) => ({
            name_zh: c.name_zh.trim(),
            name_en: typeof c.name_en === "string" ? c.name_en.trim() : "",
            type: typeof c.type === "string" ? c.type.trim() : "其他",
            mention: typeof c.mention === "string" ? c.mention.trim().slice(0, 200) : "",
          }))
          .slice(0, 5),
      };
    })
    .filter((row) => row.concepts.length > 0);
}

function loadAllChunks() {
  const out = [];
  if (!fs.existsSync(paths.chunks)) return out;
  for (const file of fs.readdirSync(paths.chunks)) {
    if (!file.endsWith(".jsonl")) continue;
    const lines = fs.readFileSync(path.join(paths.chunks, file), "utf8").split("\n").filter(Boolean);
    for (const line of lines) out.push(JSON.parse(line));
  }
  return out;
}

const sourceTitleCache = new Map();
function shortenSource(sourceId, heading) {
  if (!sourceTitleCache.has(sourceId)) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(paths.sources, sourceId, "meta.json"), "utf8"));
      sourceTitleCache.set(sourceId, meta.originalName?.replace(/\.[^.]+$/, "") || sourceId.slice(0, 8));
    } catch {
      sourceTitleCache.set(sourceId, sourceId.slice(0, 8));
    }
  }
  const title = sourceTitleCache.get(sourceId);
  return heading ? `${title} — ${heading}` : title;
}
