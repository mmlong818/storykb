#!/usr/bin/env node
import { reviewWiki } from "./review-wiki.mjs";

const argv = process.argv.slice(2);
const flags = {};
for (const arg of argv) {
  if (arg.startsWith("--")) {
    const [k, v] = arg.slice(2).split("=");
    flags[k] = v ?? true;
  }
}

console.log("[review] flags:", flags);

reviewWiki({
  limit: flags.limit ? Number(flags.limit) : undefined,
  watch: flags.watch !== undefined ? flags.watch !== "false" : true,
}).catch((error) => {
  console.error("[review] fatal", error);
  process.exit(1);
});
