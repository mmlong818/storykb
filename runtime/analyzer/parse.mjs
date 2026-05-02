import fs from "node:fs";
import path from "node:path";
import { paths, sourceDir, sourceFile } from "./paths.mjs";
import { parseTextFile } from "./parsers/text.mjs";
import { parseDocx } from "./parsers/docx.mjs";
import { parsePdf } from "./parsers/pdf.mjs";
import { startStage, tick, endStage, recordError } from "./progress.mjs";

export async function parseAll() {
  const sourceIds = listPendingSources();
  startStage("parse", sourceIds.length);
  const results = [];
  for (const sourceId of sourceIds) {
    try {
      const meta = readMeta(sourceId);
      tick(meta.originalName);
      const parsed = await parseOne(sourceId, meta);
      if (parsed) results.push({ sourceId, ...parsed });
    } catch (error) {
      recordError(sourceId, error);
    }
  }
  endStage();
  return results;
}

function listPendingSources() {
  if (!fs.existsSync(paths.sources)) return [];
  const ids = fs.readdirSync(paths.sources, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  return ids.filter((id) => {
    const metaPath = sourceFile(id, "meta.json");
    if (!fs.existsSync(metaPath)) return false;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    if (meta.status !== "needs_parse") return false;
    if (fs.existsSync(sourceFile(id, "raw.txt"))) return false;
    return true;
  });
}

function readMeta(sourceId) {
  return JSON.parse(fs.readFileSync(sourceFile(sourceId, "meta.json"), "utf8"));
}

function writeMeta(sourceId, meta) {
  fs.writeFileSync(sourceFile(sourceId, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
}

async function parseOne(sourceId, meta) {
  const rawPath = sourceFile(sourceId, `raw${meta.ext}`);
  if (!fs.existsSync(rawPath)) {
    writeMeta(sourceId, { ...meta, status: "missing_raw" });
    return null;
  }
  const parser = meta.parseHint || extToParser(meta.ext);
  let result;
  if (parser === "pdf") result = await parsePdf(rawPath);
  else if (parser === "docx") result = await parseDocx(rawPath);
  else result = await parseTextFile(rawPath);

  fs.writeFileSync(sourceFile(sourceId, "raw.txt"), result.text, "utf8");
  fs.writeFileSync(sourceFile(sourceId, "structure.json"), JSON.stringify({
    sourceId,
    parser: result.parser,
    structure: result.structure,
    pages: result.pages,
    charLength: result.text.length,
    warnings: result.warnings || [],
  }, null, 2), "utf8");

  writeMeta(sourceId, {
    ...meta,
    status: "parsed",
    parsedAt: new Date().toISOString(),
    parser: result.parser,
    charLength: result.text.length,
    pageCount: result.pages?.count || null,
    headingCount: result.structure?.headings?.length || 0,
  });
  return { charLength: result.text.length, headings: result.structure?.headings?.length || 0 };
}

function extToParser(ext) {
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  return "text";
}
