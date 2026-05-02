const fs = require("node:fs");
const path = require("node:path");
const { contextBridge } = require("electron");

const rootArg = process.argv.find((arg) => arg.startsWith("--story-kb-root="));
const clientRoot = rootArg ? rootArg.replace("--story-kb-root=", "") : path.resolve(__dirname, "..", "..");
const databasePath = path.join(clientRoot, "database", "kb.json");
const manifestPath = path.join(clientRoot, "database", "manifest.json");

function ensureDatabaseDir() {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
}

function loadDatabase() {
  try {
    if (!fs.existsSync(databasePath)) return null;
    return JSON.parse(fs.readFileSync(databasePath, "utf8"));
  } catch (error) {
    console.error("Failed to load Story KB database:", error);
    return null;
  }
}

function saveDatabase(database) {
  try {
    ensureDatabaseDir();
    const payload = {
      schemaVersion: database.schemaVersion || 1,
      generatedAt: database.generatedAt || new Date().toISOString(),
      library: Array.isArray(database.library) ? database.library : [],
      nodes: Array.isArray(database.nodes) ? database.nodes : [],
      edges: Array.isArray(database.edges) ? database.edges : [],
    };
    fs.writeFileSync(databasePath, JSON.stringify(payload, null, 2), "utf8");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          schemaVersion: payload.schemaVersion,
          generatedAt: payload.generatedAt,
          sourceCount: payload.library.length,
          nodeCount: payload.nodes.length,
          edgeCount: payload.edges.length,
          layout: ["kb.json", "kb.js", "sources/", "indexes/"],
        },
        null,
        2
      ),
      "utf8"
    );
    return { ok: true, path: databasePath };
  } catch (error) {
    console.error("Failed to save Story KB database:", error);
    return { ok: false, error: String(error) };
  }
}

contextBridge.exposeInMainWorld("storyKb", {
  databasePath,
  loadDatabase,
  saveDatabase,
});
