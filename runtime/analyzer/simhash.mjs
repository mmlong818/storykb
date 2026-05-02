import crypto from "node:crypto";

export function simhash64(text) {
  const tokens = tokenize(text);
  if (!tokens.length) return 0n;
  const v = new Array(64).fill(0);
  for (const tok of tokens) {
    const h = hash64(tok);
    for (let i = 0; i < 64; i += 1) {
      const bit = (h >> BigInt(i)) & 1n;
      v[i] += bit === 1n ? 1 : -1;
    }
  }
  let out = 0n;
  for (let i = 0; i < 64; i += 1) {
    if (v[i] > 0) out |= 1n << BigInt(i);
  }
  return out;
}

export function hammingDistance(a, b) {
  let x = a ^ b;
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

export function toHex(value) {
  return value.toString(16).padStart(16, "0");
}

export function fromHex(hex) {
  return BigInt(`0x${hex}`);
}

function tokenize(text) {
  const cleaned = text.replace(/\s+/g, "").toLowerCase();
  if (!cleaned) return [];
  const tokens = [];
  const cjkPattern = /[一-鿿぀-ヿ가-힯]/;
  const isCjk = cjkPattern.test(cleaned);
  if (isCjk) {
    for (let i = 0; i < cleaned.length - 1; i += 1) {
      tokens.push(cleaned.slice(i, i + 2));
    }
  } else {
    const words = cleaned.match(/[a-z0-9]+/g) || [];
    tokens.push(...words);
  }
  return tokens;
}

function hash64(token) {
  const buf = crypto.createHash("md5").update(token).digest();
  let h = 0n;
  for (let i = 0; i < 8; i += 1) h = (h << 8n) | BigInt(buf[i]);
  return h;
}
