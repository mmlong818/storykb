import { writeFile } from "node:fs/promises";
import { analyzeStructuredSource } from "../src/storyEngine.js";
import { localImportedSources } from "../src/localImportedSources.js";
import { seedSources } from "../src/seedSources.js";

function buildDatabase(sources, mode) {
  const library = [];
  const nodes = [];
  const edges = [];
  for (const seed of sources) {
    const analysis = analyzeStructuredSource(seed);
    library.push({
      ...analysis.source,
      sourceGroup: seed.sourceGroup || mode,
      originalTitle: seed.title,
    });
    nodes.push(...analysis.nodes.map((node) => ({ ...node, sourceGroup: seed.sourceGroup || mode })));
    edges.push(...analysis.edges.map((edge) => ({ ...edge, sourceGroup: seed.sourceGroup || mode })));
  }
  return {
    schemaVersion: 1,
    buildMode: mode,
    generatedAt: new Date().toISOString(),
    library,
    nodes,
    edges,
  };
}

const localSeeds = localImportedSources.map((source) => ({ ...source, sourceGroup: "local_user_documents" }));
const externalSeeds = seedSources.map((source) => ({ ...source, sourceGroup: "curated_external_reference" }));
const localOnly = buildDatabase(localSeeds, "local_user_documents");
const finalDatabase = buildDatabase([...localSeeds, ...externalSeeds], "local_then_external_rebuilt");

await writeFile(new URL("./kb.local-only.json", import.meta.url), JSON.stringify(localOnly, null, 2), "utf8");
await writeFile(new URL("./kb.json", import.meta.url), JSON.stringify(finalDatabase, null, 2), "utf8");
await writeFile(
  new URL("./kb.js", import.meta.url),
  `export const initialKnowledgeBase = ${JSON.stringify(finalDatabase, null, 2)};\n`,
  "utf8"
);
await writeFile(
  new URL("./manifest.json", import.meta.url),
  JSON.stringify(
    {
      schemaVersion: 1,
      buildMode: finalDatabase.buildMode,
      generatedAt: finalDatabase.generatedAt,
      localOnly: {
        sourceCount: localOnly.library.length,
        nodeCount: localOnly.nodes.length,
        edgeCount: localOnly.edges.length,
      },
      final: {
        sourceCount: finalDatabase.library.length,
        nodeCount: finalDatabase.nodes.length,
        edgeCount: finalDatabase.edges.length,
      },
      layout: ["kb.json", "kb.js", "kb.local-only.json", "sources/", "indexes/"],
    },
    null,
    2
  ),
  "utf8"
);

console.log(
  JSON.stringify(
    {
      localOnly: {
        sources: localOnly.library.length,
        nodes: localOnly.nodes.length,
        edges: localOnly.edges.length,
      },
      final: {
        sources: finalDatabase.library.length,
        nodes: finalDatabase.nodes.length,
        edges: finalDatabase.edges.length,
      },
    },
    null,
    2
  )
);
