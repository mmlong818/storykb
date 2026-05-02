import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_RETRIES = 1;

const BASE_ARGS = [
  "-p",
  "--output-format", "json",
  "--no-session-persistence",
  "--exclude-dynamic-system-prompt-sections",
];

export async function callClaude(prompt, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const extraArgs = options.extraArgs || [];
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await spawnOnce(prompt, timeoutMs, extraArgs);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(2000 * (attempt + 1));
    }
  }
  throw lastError;
}

function spawnOnce(prompt, timeoutMs, extraArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", [...BASE_ARGS, ...extraArgs], {
      shell: true,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on("data", (chunk) => { stdoutChunks.push(chunk); });
    child.stderr.on("data", (chunk) => { stderrChunks.push(chunk); });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      try {
        const meta = parseFirstJson(stdout);
        if (!meta) {
          reject(new Error(`no json in stdout (code=${code}). head=${stdout.slice(0, 300)} err=${stderr.slice(-300)}`));
          return;
        }
        if (meta.is_error) {
          reject(new Error(`claude api_error: ${meta.api_error_status || meta.result || "unknown"}`));
          return;
        }
        const result = String(meta.result ?? "");
        const parsed = parseFirstJson(result);
        resolve({
          raw: result,
          parsed,
          meta: {
            durationMs: meta.duration_ms,
            usage: meta.usage,
            sessionId: meta.session_id,
            costUsd: meta.total_cost_usd,
            stopReason: meta.stop_reason,
          },
        });
      } catch (error) {
        reject(new Error(`parse error: ${error.message}`));
      }
    });

    child.stdin.write(prompt, "utf8");
    child.stdin.end();
  });
}

export function parseFirstJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf("{");
  const arrStart = body.indexOf("[");
  const useArray = arrStart >= 0 && (start < 0 || arrStart < start);
  const open = useArray ? "[" : "{";
  const close = useArray ? "]" : "}";
  const begin = useArray ? arrStart : start;
  if (begin < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = begin; i < body.length; i += 1) {
    const ch = body[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        const slice = body.slice(begin, i + 1);
        try { return JSON.parse(slice); } catch { return null; }
      }
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
