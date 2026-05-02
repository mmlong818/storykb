#!/usr/bin/env node
import fs from "node:fs";
import { paths, ensureDirs } from "./paths.mjs";
import { ingest } from "./ingest.mjs";
import { parseAll } from "./parse.mjs";
import { chunkAll } from "./chunk.mjs";
import { dedupe } from "./dedupe.mjs";

const argv = process.argv.slice(2);

function parseArgs(args) {
  const inputs = [];
  const flags = {};
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      flags[key] = value ?? true;
    } else {
      inputs.push(arg);
    }
  }
  return { inputs, flags };
}

async function main() {
  ensureDirs();
  const { inputs, flags } = parseArgs(argv);
  const stages = (flags.stages || "ingest,parse,chunk,dedupe").split(",").map((s) => s.trim()).filter(Boolean);

  if (stages.includes("ingest") && inputs.length === 0) {
    console.error("Usage: node runtime/analyzer/run.mjs <inputDir> [<inputDir>...] [--stages=ingest,parse,chunk,dedupe]");
    process.exit(1);
  }

  const startedAt = Date.now();
  console.log(`[run] stages=${stages.join("+")} inputs=${inputs.length} startedAt=${new Date().toISOString()}`);

  if (stages.includes("ingest")) await ingest(inputs);
  if (stages.includes("parse")) await parseAll();
  if (stages.includes("chunk")) await chunkAll();
  if (stages.includes("dedupe")) await dedupe();

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[run] done in ${elapsed}s. progress: ${paths.progress}`);
}

main().catch((error) => {
  console.error("[run] fatal", error);
  process.exit(1);
});
