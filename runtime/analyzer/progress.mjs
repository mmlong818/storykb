import fs from "node:fs";
import { paths, ensureDirs } from "./paths.mjs";

const state = { stage: "", total: 0, done: 0, current: "", startedAt: null, errors: [] };
let lastFlush = 0;

export function startStage(stage, total) {
  state.stage = stage;
  state.total = total;
  state.done = 0;
  state.current = "";
  state.startedAt = Date.now();
  state.errors = [];
  ensureDirs();
  flush(true);
  printLine();
}

export function tick(currentLabel = "") {
  state.done += 1;
  state.current = currentLabel;
  const now = Date.now();
  if (now - lastFlush > 250) {
    flush();
    lastFlush = now;
  }
  printLine();
}

export function recordError(label, error) {
  state.errors.push({ label, error: String(error?.message || error), at: new Date().toISOString() });
  flush(true);
}

export function endStage() {
  flush(true);
  process.stdout.write("\n");
}

function printLine() {
  if (!process.stdout.isTTY) return;
  const pct = state.total ? Math.floor((state.done / state.total) * 100) : 0;
  const bar = renderBar(pct);
  const elapsed = ((Date.now() - state.startedAt) / 1000).toFixed(1);
  const truncated = String(state.current).slice(0, 50);
  process.stdout.write(`\r[${state.stage}] ${bar} ${state.done}/${state.total} (${pct}%) ${elapsed}s ${truncated}`.padEnd(120));
}

function renderBar(pct) {
  const width = 24;
  const filled = Math.round((pct / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function flush(force = false) {
  if (!force && Date.now() - lastFlush < 250) return;
  fs.writeFileSync(paths.progress, JSON.stringify({
    ...state,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
  lastFlush = Date.now();
}
