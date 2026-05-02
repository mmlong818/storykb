import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.mjs";
import { simhash64, hammingDistance, toHex } from "./simhash.mjs";
import { startStage, tick, endStage, recordError } from "./progress.mjs";

const DUPLICATE_THRESHOLD = 3;

export async function dedupe() {
  if (!fs.existsSync(paths.chunks)) {
    console.log("[dedupe] no chunks directory; skipping");
    return { exact: 0, near: 0, total: 0 };
  }
  const files = fs.readdirSync(paths.chunks).filter((name) => name.endsWith(".jsonl"));
  startStage("dedupe", files.length);

  const fingerprints = [];
  for (const file of files) {
    try {
      const lines = fs.readFileSync(path.join(paths.chunks, file), "utf8").split("\n").filter(Boolean);
      const updated = [];
      for (const line of lines) {
        const chunk = JSON.parse(line);
        if (!chunk.simhash) {
          chunk.simhash = toHex(simhash64(chunk.text));
        }
        fingerprints.push({ chunkId: chunk.id, sourceId: chunk.sourceId, hash: BigInt(`0x${chunk.simhash}`) });
        updated.push(JSON.stringify(chunk));
      }
      fs.writeFileSync(path.join(paths.chunks, file), updated.join("\n") + "\n", "utf8");
      tick(file);
    } catch (error) {
      recordError(file, error);
    }
  }
  endStage();

  const buckets = new Map();
  for (const fp of fingerprints) {
    const key = fp.hash.toString(16).padStart(16, "0");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ chunkId: fp.chunkId, sourceId: fp.sourceId });
  }

  const exactGroups = [...buckets.entries()]
    .filter(([_, members]) => members.length > 1)
    .map(([hash, members]) => ({ hash, members }));

  const nearPairs = findNearDuplicates(fingerprints);

  const result = {
    generatedAt: new Date().toISOString(),
    threshold: DUPLICATE_THRESHOLD,
    totalChunks: fingerprints.length,
    exactGroups,
    nearPairs,
    summary: {
      totalChunks: fingerprints.length,
      exactDuplicateGroups: exactGroups.length,
      exactDuplicateChunks: exactGroups.reduce((sum, g) => sum + g.members.length - 1, 0),
      nearDuplicatePairs: nearPairs.length,
    },
  };
  fs.mkdirSync(path.dirname(paths.duplicates), { recursive: true });
  fs.writeFileSync(paths.duplicates, JSON.stringify(result, null, 2), "utf8");
  console.log("[dedupe]", JSON.stringify(result.summary));
  return result.summary;
}

function findNearDuplicates(fingerprints) {
  const out = [];
  const sorted = [...fingerprints].sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
  const window = 64;
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < Math.min(sorted.length, i + window); j += 1) {
      const dist = hammingDistance(sorted[i].hash, sorted[j].hash);
      if (dist > 0 && dist <= DUPLICATE_THRESHOLD) {
        out.push({
          a: sorted[i].chunkId,
          b: sorted[j].chunkId,
          aSource: sorted[i].sourceId,
          bSource: sorted[j].sourceId,
          distance: dist,
        });
      }
    }
  }
  return out;
}
