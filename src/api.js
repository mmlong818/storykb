// 双模式：本地服务器 或 GitHub Pages 静态包
// 非 localhost 时自动切换为静态模式，从 wiki-bundle.json 加载全部数据

const isStatic = typeof window !== "undefined" &&
  window.location.hostname !== "127.0.0.1" &&
  window.location.hostname !== "localhost";

let _bundle = null;

async function loadBundle() {
  if (_bundle) return _bundle;
  const res = await fetch("./wiki-bundle.json");
  if (!res.ok) throw new Error(`加载数据包失败 (${res.status})`);
  _bundle = await res.json();
  return _bundle;
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

export async function fetchWikiList() {
  if (isStatic) {
    const b = await loadBundle();
    return b.concepts || [];
  }
  const data = await getJson("/api/wiki");
  return data.concepts || [];
}

export async function fetchWikiEntry(conceptId) {
  if (isStatic) {
    const b = await loadBundle();
    return b.entries?.[conceptId] || null;
  }
  const data = await getJson(`/api/wiki/${encodeURIComponent(conceptId)}`);
  return data.entry;
}

export async function fetchSourceMeta(sourceId) {
  if (isStatic) return null;
  try {
    const data = await getJson(`/api/sources/${encodeURIComponent(sourceId)}/meta`);
    return data.meta;
  } catch {
    return null;
  }
}

export async function fetchSourceText(sourceId, start, end) {
  if (isStatic) return null;
  const params = new URLSearchParams();
  if (start != null) params.set("start", String(start));
  if (end != null) params.set("end", String(end));
  const data = await getJson(`/api/sources/${encodeURIComponent(sourceId)}/text?${params.toString()}`);
  return data;
}

export async function fetchProgress() {
  if (isStatic) return null;
  try {
    const data = await getJson("/api/progress");
    return data.progress;
  } catch {
    return null;
  }
}

export { isStatic };
