import fs from "node:fs";
import path from "node:path";
import { paths, sourceFile } from "./paths.mjs";
import { startStage, tick, endStage, recordError } from "./progress.mjs";

const TARGET_MIN = 600;
const TARGET_MAX = 1800;
const HARD_MAX = 2400;
const MIN_MEANINGFUL_CHARS = 30;

function meaningfulCharCount(text) {
  return (text.match(/[\p{Letter}\p{Number}]/gu) || []).length;
}

export async function chunkAll() {
  const sourceIds = listSourcesNeedingChunking();
  startStage("chunk", sourceIds.length);
  const totals = { sources: 0, chunks: 0 };
  for (const sourceId of sourceIds) {
    try {
      const result = chunkOne(sourceId);
      tick(`${sourceId.slice(0, 8)} chunks=${result.chunkCount}`);
      totals.sources += 1;
      totals.chunks += result.chunkCount;
    } catch (error) {
      recordError(sourceId, error);
    }
  }
  endStage();
  console.log("[chunk]", JSON.stringify(totals));
  return totals;
}

function listSourcesNeedingChunking() {
  if (!fs.existsSync(paths.sources)) return [];
  const ids = fs.readdirSync(paths.sources, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  return ids.filter((id) => {
    const metaPath = sourceFile(id, "meta.json");
    if (!fs.existsSync(metaPath)) return false;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    if (meta.status !== "parsed" && meta.status !== "chunked") return false;
    const out = path.join(paths.chunks, `${id}.jsonl`);
    if (fs.existsSync(out) && meta.status === "chunked") return false;
    return true;
  });
}

function chunkOne(sourceId) {
  const text = fs.readFileSync(sourceFile(sourceId, "raw.txt"), "utf8");
  const structure = JSON.parse(fs.readFileSync(sourceFile(sourceId, "structure.json"), "utf8"));
  const headings = structure.structure?.headings || [];

  const segments = headings.length ? splitByHeadings(text, headings) : [{ heading: null, charStart: 0, charEnd: text.length }];
  const chunks = [];
  let droppedLowSignal = 0;
  for (const seg of segments) {
    const segText = text.slice(seg.charStart, seg.charEnd);
    const subChunks = splitLongSegment(segText, seg.charStart);
    for (const sc of subChunks) {
      const meaningful = meaningfulCharCount(sc.text);
      if (meaningful < MIN_MEANINGFUL_CHARS) {
        droppedLowSignal += 1;
        continue;
      }
      chunks.push({
        id: `${sourceId.slice(0, 12)}-${chunks.length.toString().padStart(5, "0")}`,
        sourceId,
        heading: seg.heading,
        headingPath: seg.headingPath || null,
        charStart: sc.charStart,
        charEnd: sc.charEnd,
        text: sc.text,
        charLength: sc.text.length,
        meaningfulChars: meaningful,
      });
    }
  }

  const out = path.join(paths.chunks, `${sourceId}.jsonl`);
  fs.writeFileSync(out, chunks.map((c) => JSON.stringify(c)).join("\n") + "\n", "utf8");

  const metaPath = sourceFile(sourceId, "meta.json");
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  fs.writeFileSync(metaPath, JSON.stringify({
    ...meta,
    status: "chunked",
    chunkedAt: new Date().toISOString(),
    chunkCount: chunks.length,
    droppedLowSignal,
  }, null, 2), "utf8");

  return { chunkCount: chunks.length, droppedLowSignal };
}

function splitByHeadings(text, headings) {
  const sorted = [...headings].sort((a, b) => a.charStart - b.charStart);
  const segments = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const start = sorted[i].charStart;
    const end = sorted[i + 1]?.charStart ?? text.length;
    segments.push({
      heading: sorted[i].text,
      headingLevel: sorted[i].level,
      charStart: start,
      charEnd: end,
    });
  }
  if (sorted[0]?.charStart > 0) {
    segments.unshift({ heading: null, charStart: 0, charEnd: sorted[0].charStart });
  }
  return segments.filter((seg) => seg.charEnd > seg.charStart);
}

function splitLongSegment(text, baseOffset) {
  if (text.length <= TARGET_MAX) {
    return [{ text, charStart: baseOffset, charEnd: baseOffset + text.length }];
  }
  const out = [];
  const paragraphs = text.split(/\n{2,}/);
  let buffer = "";
  let bufferStart = 0;
  let cursor = 0;
  for (const para of paragraphs) {
    const paraStart = cursor;
    const paraEnd = cursor + para.length;
    if (!buffer) bufferStart = paraStart;
    const candidate = buffer ? `${buffer}\n\n${para}` : para;
    if (candidate.length >= TARGET_MIN && candidate.length <= TARGET_MAX) {
      out.push({ text: candidate, charStart: baseOffset + bufferStart, charEnd: baseOffset + paraEnd });
      buffer = "";
    } else if (candidate.length > HARD_MAX) {
      if (buffer) {
        out.push({ text: buffer, charStart: baseOffset + bufferStart, charEnd: baseOffset + paraStart - 2 });
      }
      const sliced = sliceByLength(para, paraStart);
      for (const piece of sliced) {
        out.push({ text: piece.text, charStart: baseOffset + piece.charStart, charEnd: baseOffset + piece.charEnd });
      }
      buffer = "";
    } else {
      buffer = candidate;
    }
    cursor = paraEnd + 2;
  }
  if (buffer) {
    out.push({ text: buffer, charStart: baseOffset + bufferStart, charEnd: baseOffset + bufferStart + buffer.length });
  }
  return out.filter((c) => c.text.trim().length > 0);
}

function sliceByLength(text, baseOffset) {
  const out = [];
  for (let i = 0; i < text.length; i += TARGET_MAX) {
    const slice = text.slice(i, i + TARGET_MAX);
    out.push({ text: slice, charStart: baseOffset + i, charEnd: baseOffset + i + slice.length });
  }
  return out;
}
