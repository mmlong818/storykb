async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

export async function fetchWikiList() {
  const data = await getJson("/api/wiki");
  return data.concepts || [];
}

export async function fetchWikiEntry(conceptId) {
  const data = await getJson(`/api/wiki/${encodeURIComponent(conceptId)}`);
  return data.entry;
}

export async function fetchSourceMeta(sourceId) {
  try {
    const data = await getJson(`/api/sources/${encodeURIComponent(sourceId)}/meta`);
    return data.meta;
  } catch {
    return null;
  }
}

export async function fetchSourceText(sourceId, start, end) {
  const params = new URLSearchParams();
  if (start != null) params.set("start", String(start));
  if (end != null) params.set("end", String(end));
  const data = await getJson(`/api/sources/${encodeURIComponent(sourceId)}/text?${params.toString()}`);
  return data;
}

export async function fetchProgress() {
  try {
    const data = await getJson("/api/progress");
    return data.progress;
  } catch {
    return null;
  }
}
