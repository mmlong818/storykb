import fs from "node:fs";
import path from "node:path";
import { paths, ensureDirs, sourceDir, sourceFile } from "./paths.mjs";
import { hashFile } from "./hash.mjs";
import { startStage, tick, endStage, recordError } from "./progress.mjs";

const SUPPORTED_EXT = new Set([".pdf", ".docx", ".txt", ".md", ".markdown", ".html", ".htm"]);
const REGISTER_ONLY = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".xlsx", ".xls", ".pptx", ".ppt", ".doc", ".epub", ".mobi"]);

export async function scanInputs(inputDirs) {
  const files = [];
  for (const dir of inputDirs) {
    if (!fs.existsSync(dir)) {
      console.warn(`[ingest] skip missing dir: ${dir}`);
      continue;
    }
    walk(dir, files);
  }
  return files;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      const supported = SUPPORTED_EXT.has(ext);
      const registerOnly = REGISTER_ONLY.has(ext);
      if (supported || registerOnly) {
        out.push({ path: full, ext, supported, registerOnly });
      }
    }
  }
}

export async function ingest(inputDirs) {
  ensureDirs();
  const files = await scanInputs(inputDirs);
  startStage("ingest", files.length);

  const log = [];
  for (const file of files) {
    try {
      const sha = await hashFile(file.path);
      const dir = sourceDir(sha);
      const rawPath = sourceFile(sha, `raw${file.ext}`);
      const metaPath = sourceFile(sha, "meta.json");
      const alreadyDone = fs.existsSync(metaPath);

      if (!alreadyDone) {
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(file.path, rawPath);
        const stat = fs.statSync(file.path);
        const meta = {
          sourceId: sha,
          originalPath: file.path,
          originalName: path.basename(file.path),
          ext: file.ext,
          size: stat.size,
          ingestedAt: new Date().toISOString(),
          status: file.supported ? "needs_parse" : "register_only",
          parseHint: file.supported ? extToParser(file.ext) : null,
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
      }
      log.push({ sourceId: sha, original: file.path, ext: file.ext, supported: file.supported, alreadyDone });
      tick(path.basename(file.path));
    } catch (error) {
      recordError(file.path, error);
      tick(`ERR ${path.basename(file.path)}`);
    }
  }
  endStage();

  fs.writeFileSync(paths.ingestLog, log.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  const summary = {
    totalScanned: files.length,
    newlyIngested: log.filter((row) => !row.alreadyDone).length,
    alreadyOnDisk: log.filter((row) => row.alreadyDone).length,
    supported: log.filter((row) => row.supported).length,
    registerOnly: log.filter((row) => !row.supported).length,
  };
  console.log("[ingest]", JSON.stringify(summary));
  return { files, log, summary };
}

function extToParser(ext) {
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  return "text";
}
