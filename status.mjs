#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const queueDir = path.join(root, "database", "queue");
const progressFile = path.join(queueDir, "progress.json");

function countLines(file) {
  if (!fs.existsSync(file)) return 0;
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).length;
}

function countDir(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length;
}

function bar(done, total, width = 30) {
  const pct = total > 0 ? done / total : 0;
  const filled = Math.round(pct * width);
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "] " + Math.round(pct * 100) + "%";
}

// Progress
if (fs.existsSync(progressFile)) {
  const p = JSON.parse(fs.readFileSync(progressFile, "utf8"));
  const now = new Date();
  const upd = new Date(p.updatedAt);
  const start = new Date(p.startedAt);
  const staleSec = Math.round((now - upd) / 1000);
  const elapsedH = (now - start) / 3_600_000;
  const rate = p.done / Math.max(elapsedH, 0.01);
  const eta = (p.total - p.done) / Math.max(rate, 0.01);
  const alive = staleSec < 300 ? "运行中" : `上次更新 ${staleSec}s 前（可能已停止）`;

  console.log(`\n=== StoryKB 管线进度 [${alive}] ===`);
  console.log(`阶段: ${p.stage}`);
  console.log(bar(p.done, p.total) + `  ${p.done}/${p.total} 批`);
  console.log(`耗时: ${elapsedH.toFixed(1)}h  速率: ${Math.round(rate)} 批/h  预计剩余: ${eta.toFixed(1)}h`);
  if (p.errors?.length) console.log(`错误: ${p.errors.length} 条`);
  if (p.current) console.log(`当前: ${p.current}`);
} else {
  console.log("\n=== StoryKB 管线进度 ===");
  console.log("(尚未开始)");
}

// Queue details
const stages = [
  { name: "概念提取 (concepts)", dir: "concepts" },
  { name: "Wiki 合成  (wiki)",    dir: "wiki" },
];

console.log("\n--- 队列详情 ---");
for (const s of stages) {
  const base = path.join(queueDir, s.dir);
  if (!fs.existsSync(base)) { console.log(`${s.name}: 未开始`); continue; }
  const pending   = countLines(path.join(base, "pending.jsonl"));
  const completed = countLines(path.join(base, "completed.jsonl"));
  const failed    = countLines(path.join(base, "failed.jsonl"));
  const inflight  = countDir(path.join(base, "in_flight"));
  console.log(`${s.name}: 完成=${completed} 失败=${failed} 运行中=${inflight} 待处理=${pending}`);
}

// Wiki output
const wikiDir = path.join(root, "database", "nodes", "wiki");
const reviewDir = path.join(root, "database", "nodes", "wiki_reviews");
if (fs.existsSync(wikiDir)) {
  const wikis = fs.readdirSync(wikiDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  console.log(`\nWiki 条目已生成: ${wikis.length} 个`);
  if (fs.existsSync(reviewDir)) {
    const reviews = fs.readdirSync(reviewDir).filter((f) => f.endsWith(".json"));
    const pending = wikis.length - reviews.length;
    // summarize scores and issues
    let issueCount = 0;
    let scoreSum = 0;
    let highCount = 0;
    for (const f of reviews) {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(reviewDir, f), "utf8"));
        scoreSum += r.score || 10;
        issueCount += (r.issues || []).length;
        highCount += (r.issues || []).filter((i) => i.severity === "high").length;
      } catch { /* ignore */ }
    }
    const avgScore = reviews.length > 0 ? (scoreSum / reviews.length).toFixed(1) : "-";
    console.log(`Wiki 审核进度: ${reviews.length}/${wikis.length} 已审 待审=${pending} 平均分=${avgScore} issues=${issueCount}(high=${highCount})`);
  }
}

// Ingest state
const ingestFile = path.join(queueDir, "ingest.jsonl");
if (fs.existsSync(ingestFile)) {
  const lines = fs.readFileSync(ingestFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const done = lines.filter((l) => l.alreadyDone).length;
  const ocr = lines.filter((l) => !l.supported).length;
  const total = lines.length;
  console.log(`\n文档入库: 共 ${total} 个  已处理 ${done}  需OCR跳过 ${ocr}  可用 ${total - ocr}`);
}

console.log("");
