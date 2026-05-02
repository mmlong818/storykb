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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/api/kb" && req.method === "GET") {
      sendJson(res, 200, { ok: true, path: databasePath, database: readDatabase() });
      return;
    }
    if (url.pathname === "/api/kb" && req.method === "POST") {
      const body = await readBody(req);
      const database = normalizeDatabase(JSON.parse(body || "{}"));
      const saved = writeDatabase(database);
      sendJson(res, 200, { ok: true, path: databasePath, counts: { sources: saved.library.length, nodes: saved.nodes.length, edges: saved.edges.length } });
      return;
    }
    serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error.message || error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Story KB 本地数据库服务已启动：http://127.0.0.1:${port}/`);
  console.log(`数据库：${databasePath}`);
});
