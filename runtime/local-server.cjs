const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const clientRoot = path.resolve(__dirname, "..");
const databasePath = path.join(clientRoot, "database", "kb.json");
const manifestPath = path.join(clientRoot, "database", "manifest.json");
const port = Number(process.env.STORY_KB_PORT || process.argv.find((arg) => arg.startsWith("--port="))?.replace("--port=", "") || 5178);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 80 * 1024 * 1024) {
        reject(new Error("请求内容过大"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function ensureDatabaseDir() {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
}

function readDatabase() {
  if (!fs.existsSync(databasePath)) {
    return { schemaVersion: 1, generatedAt: new Date().toISOString(), library: [], nodes: [], edges: [] };
  }
  return JSON.parse(fs.readFileSync(databasePath, "utf8"));
}

function normalizeDatabase(database) {
  return {
    schemaVersion: database.schemaVersion || 1,
    generatedAt: database.generatedAt || new Date().toISOString(),
    library: Array.isArray(database.library) ? database.library : [],
    nodes: Array.isArray(database.nodes) ? database.nodes : [],
    edges: Array.isArray(database.edges) ? database.edges : [],
  };
}

function writeDatabase(database) {
  ensureDatabaseDir();
  const payload = normalizeDatabase(database);
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
  return payload;
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(clientRoot, requestedPath);
  if (!filePath.startsWith(clientRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "no-cache",
  });
  fs.createReadStream(filePath).pipe(res);
}

const wikiDir = path.join(clientRoot, "database", "nodes", "wiki");
const sourcesDir = path.join(clientRoot, "database", "sources");
const progressPath = path.join(clientRoot, "database", "queue", "progress.json");

function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
}

function listWiki() {
  if (!fs.existsSync(wikiDir)) return [];
  const indexPath = path.join(wikiDir, "_concept_index.json");
  const index = readJsonSafe(indexPath);
  if (!index?.concepts) return [];
  const existing = new Set(fs.readdirSync(wikiDir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).map((f) => f.replace(".json", "")));
  const seen = new Set();
  return index.concepts
    .filter((c) => existing.has(c.conceptId) && !seen.has(c.conceptId) && seen.add(c.conceptId))
    .map((c) => ({
      conceptId: c.conceptId,
      canonical_zh: c.canonical_zh,
      canonical_en: c.canonical_en,
      aliases: c.aliases || [],
      types: c.types || [],
      related_concepts: c.related_concepts || [],
      evidenceCount: c.evidence?.length || 0,
      sourceCount: new Set((c.evidence || []).map((e) => e.sourceId)).size,
    }))
    .sort((a, b) => a.canonical_zh.localeCompare(b.canonical_zh, "zh-Hans-CN", { sensitivity: "base" }));
}

function readWiki(conceptId) {
  const safeId = String(conceptId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) return null;
  return readJsonSafe(path.join(wikiDir, `${safeId}.json`));
}

function readSourceMeta(sourceId) {
  const safeId = String(sourceId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) return null;
  return readJsonSafe(path.join(sourcesDir, safeId, "meta.json"));
}

function readSourceText(sourceId, charStart, charEnd) {
  const safeId = String(sourceId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) return null;
  const rawPath = path.join(sourcesDir, safeId, "raw.txt");
  if (!fs.existsSync(rawPath)) return null;
  const text = fs.readFileSync(rawPath, "utf8");
  const start = Number(charStart);
  const end = Number(charEnd);
  if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start) {
    const padBefore = Math.max(0, start - 400);
    const padAfter = Math.min(text.length, end + 400);
    return {
      total: text.length,
      windowStart: padBefore,
      windowEnd: padAfter,
      before: text.slice(padBefore, start),
      highlight: text.slice(start, end),
      after: text.slice(end, padAfter),
    };
  }
  return { total: text.length, full: text.slice(0, 100_000) };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const p = url.pathname;
    if (p === "/api/kb" && req.method === "GET") {
      sendJson(res, 200, { ok: true, path: databasePath, database: readDatabase() });
      return;
    }
    if (p === "/api/kb" && req.method === "POST") {
      const body = await readBody(req);
      const database = normalizeDatabase(JSON.parse(body || "{}"));
      const saved = writeDatabase(database);
      sendJson(res, 200, { ok: true, path: databasePath, counts: { sources: saved.library.length, nodes: saved.nodes.length, edges: saved.edges.length } });
      return;
    }
    if (p === "/api/wiki" && req.method === "GET") {
      sendJson(res, 200, { ok: true, concepts: listWiki() });
      return;
    }
    if (p === "/api/wiki/export.ndjson" && req.method === "GET") {
      if (!fs.existsSync(wikiDir)) { sendJson(res, 404, { ok: false, error: "no wiki" }); return; }
      const files = fs.readdirSync(wikiDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="storykb-wiki.ndjson"`,
        "Cache-Control": "no-store",
      });
      for (const f of files) {
        try {
          const entry = JSON.parse(fs.readFileSync(path.join(wikiDir, f), "utf8"));
          res.write(JSON.stringify(entry) + "\n");
        } catch { /* skip malformed */ }
      }
      res.end();
      return;
    }
    const wikiMatch = p.match(/^\/api\/wiki\/([a-f0-9]+)$/);
    if (wikiMatch && req.method === "GET") {
      const entry = readWiki(wikiMatch[1]);
      if (!entry) { sendJson(res, 404, { ok: false, error: "not found" }); return; }
      sendJson(res, 200, { ok: true, entry });
      return;
    }
    const sourceMatch = p.match(/^\/api\/sources\/([a-f0-9]+)\/meta$/);
    if (sourceMatch && req.method === "GET") {
      const meta = readSourceMeta(sourceMatch[1]);
      if (!meta) { sendJson(res, 404, { ok: false, error: "not found" }); return; }
      sendJson(res, 200, { ok: true, meta });
      return;
    }
    const textMatch = p.match(/^\/api\/sources\/([a-f0-9]+)\/text$/);
    if (textMatch && req.method === "GET") {
      const result = readSourceText(textMatch[1], url.searchParams.get("start"), url.searchParams.get("end"));
      if (!result) { sendJson(res, 404, { ok: false, error: "not found" }); return; }
      sendJson(res, 200, { ok: true, ...result });
      return;
    }
    if (p === "/api/progress" && req.method === "GET") {
      sendJson(res, 200, { ok: true, progress: readJsonSafe(progressPath) });
      return;
    }
    serveStatic(req, res, decodeURIComponent(p));
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error.message || error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Story KB 本地数据库服务已启动：http://127.0.0.1:${port}/`);
  console.log(`数据库：${databasePath}`);
});
