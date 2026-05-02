import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, "..", "..");
export const databaseRoot = path.join(projectRoot, "database");

export const paths = {
  database: databaseRoot,
  sources: path.join(databaseRoot, "sources"),
  chunks: path.join(databaseRoot, "chunks"),
  nodes: path.join(databaseRoot, "nodes"),
  templates: path.join(databaseRoot, "templates"),
  indexes: path.join(databaseRoot, "indexes"),
  queue: path.join(databaseRoot, "queue"),
  manifest: path.join(databaseRoot, "manifest.json"),
  kbJson: path.join(databaseRoot, "kb.json"),
  kbJs: path.join(databaseRoot, "kb.js"),
  duplicates: path.join(databaseRoot, "indexes", "duplicates.json"),
  progress: path.join(databaseRoot, "queue", "progress.json"),
  ingestLog: path.join(databaseRoot, "queue", "ingest.jsonl"),
};

export function ensureDirs() {
  for (const dir of [paths.sources, paths.chunks, paths.nodes, paths.templates, paths.indexes, paths.queue]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function sourceDir(sourceId) {
  return path.join(paths.sources, sourceId);
}

export function sourceFile(sourceId, name) {
  return path.join(sourceDir(sourceId), name);
}
