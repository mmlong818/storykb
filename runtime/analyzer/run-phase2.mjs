#!/usr/bin/env node
import { extractConcepts } from "./extract-concepts.mjs";
import { consolidateConcepts } from "./consolidate-concepts.mjs";
import { synthesizeWiki } from "./synthesize-wiki.mjs";

const argv = process.argv.slice(2);
const flags = {};
for (const arg of argv) {
  if (arg.startsWith("--")) {
    const [k, v] = arg.slice(2).split("=");
    flags[k] = v ?? true;
  }
}

const stages = (flags.stages || "extract,consolidate,wiki").split(",").map((s) => s.trim()).filter(Boolean);
console.log("[phase2] stages:", stages, "flags:", flags);

async function main() {
  if (stages.includes("extract")) {
    await extractConcepts({ limit: flags.extractLimit ? Number(flags.extractLimit) : undefined, retryFailed: !!flags.retryFailed });
  }
  if (stages.includes("consolidate")) {
    await consolidateConcepts({ skipClustering: !!flags.skipClustering });
  }
  if (stages.includes("wiki")) {
    await synthesizeWiki({ limit: flags.wikiLimit ? Number(flags.wikiLimit) : undefined, minEvidence: flags.minEvidence ? Number(flags.minEvidence) : 2, retryFailed: !!flags.retryFailed });
  }
}

main().catch((error) => {
  console.error("[phase2] fatal", error);
  process.exit(1);
});
