import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_RETRIES = 1;
const RATE_LIMIT_RETRIES = 6;
const RATE_LIMIT_DELAYS_MS = [60_000, 90_000, 120_000, 180_000, 240_000, 300_000];
const MIN_CALL_INTERVAL_MS = 90_000; // ~1 call/min, well under rate limits
let lastCallTime = 0;

// Use --output-format text: Claude returns plain text, no outer JSON wrapper to parse.
// This avoids all JSON-escaping bugs in the outer envelope.
const BASE_ARGS = [
  "-p",
  "--output-format", "text",
  "--no-session-persistence",
  "--exclude-dynamic-system-prompt-sections",
];

function isRateLimit(error) {
  return /429|rate.?limit|too many requests/i.test(String(error?.message || error));
}

export async function callClaude(prompt, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const extraArgs = options.extraArgs || [];
  const now = Date.now();
  const wait = MIN_CALL_INTERVAL_MS - (now - lastCallTime);
  if (wait > 0) await sleep(wait);
  lastCallTime = Date.now();
  let lastError;
  let rateLimitAttempt = 0;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await spawnOnce(prompt, timeoutMs, extraArgs);
    } catch (error) {
      lastError = error;
      if (isRateLimit(error) && rateLimitAttempt < RATE_LIMIT_RETRIES) {
        const delayMs = RATE_LIMIT_DELAYS_MS[rateLimitAttempt];
        console.error(`[claude] 429 rate limit — waiting ${delayMs / 1000}s (attempt ${rateLimitAttempt + 1}/${RATE_LIMIT_RETRIES})`);
        await sleep(delayMs);
        rateLimitAttempt += 1;
        attempt -= 1;
      } else if (attempt < retries) {
        await sleep(2000 * (attempt + 1));
      }
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

      // With --output-format text, stderr carries errors; check exit code
      if (code !== 0) {
        const errMsg = stderr.trim() || stdout.trim();
        if (/429|rate.?limit|too many/i.test(errMsg)) {
          reject(new Error(`claude api_error: 429`));
        } else {
          reject(new Error(`claude exited ${code}: ${errMsg.slice(0, 200)}`));
        }
        return;
      }

      // stdout is Claude's raw text response
      const raw = stdout;
      const parsed = parseFirstJson(raw);
      resolve({
        raw,
        parsed,
        meta: { costUsd: 0 }, // cost not available in text mode
      });
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
