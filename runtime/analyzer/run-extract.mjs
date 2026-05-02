#!/usr/bin/env node
import { extractConcepts } from "./extract-concepts.mjs";

const argv = process.argv.slice(2);
const flags = {};
for (const arg of argv) {
  if (arg.startsWith("--")) {
    const [k, v] = arg.slice(2).split("=");
    flags[k] = v ?? true;
  }
}

const options = {
  limit: flags.limit ? Number(flags.limit) : undefined,
  dryRun: !!flags.dry,
};

console.log("[extract] options:", options);
extractConcepts(options).catch((error) => {
  console.error("[extract] fatal", error);
  process.exit(1);
});
