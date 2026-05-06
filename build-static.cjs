#!/usr/bin/env node
// 生成 wiki-bundle.json，用于 GitHub Pages 静态部署
const fs = require("node:fs");
const path = require("node:path");

const wikiDir = path.resolve(__dirname, "database/nodes/wiki");
const outPath = path.resolve(__dirname, "wiki-bundle.json");

const idx = JSON.parse(fs.readFileSync(path.join(wikiDir, "_concept_index.json"), "utf8"));

const seen = new Set();
const raw = idx.concepts.filter((c) => {
  if (seen.has(c.conceptId)) return false;
  seen.add(c.conceptId);
  return fs.existsSync(path.join(wikiDir, `${c.conceptId}.json`));
}).sort((a, b) => (b.evidence?.length || 0) - (a.evidence?.length || 0));

const concepts = raw.map((c) => ({
  conceptId: c.conceptId,
  canonical_zh: c.canonical_zh,
  canonical_en: c.canonical_en,
  aliases: c.aliases || [],
  types: c.types || [],
  related_concepts: c.related_concepts || [],
  evidenceCount: c.evidence?.length || 0,
  sourceCount: new Set((c.evidence || []).map((e) => e.sourceId)).size,
}));

const entries = {};
for (const c of raw) {
  try {
    entries[c.conceptId] = JSON.parse(
      fs.readFileSync(path.join(wikiDir, `${c.conceptId}.json`), "utf8")
    );
  } catch {}
}

fs.writeFileSync(outPath, JSON.stringify({ concepts, entries }), "utf8");

const sizeKb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`✓ wiki-bundle.json 生成完毕`);
console.log(`  概念数：${concepts.length}，条目数：${Object.keys(entries).length}，大小：${sizeKb} KB`);
