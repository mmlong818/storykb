import { fetchWikiList, fetchWikiEntry, fetchSourceMeta, fetchSourceText, fetchProgress, isStatic } from "./api.js";
import { renderConceptEntry, entryToMarkdown, findConceptByName } from "./views/concept-entry.js";
import { renderLeftPanel } from "./views/left-panel.js";
import { renderRightPanel } from "./views/right-panel.js";
import { renderSourceViewer } from "./views/source-viewer.js";
import { renderProgressPanel } from "./views/progress-panel.js";
import { html, raw, debounce } from "./util.js";

const STORAGE_KEY = "story-kb-wiki-v2";

const state = {
  concepts: [],
  conceptsById: new Map(),
  query: "",
  openTabs: [],       // array of conceptId strings
  activeTabId: null,
  entriesCache: {},   // conceptId -> full entry object
  showCode: false,
  sourceView: null,
  progress: null,
  loading: true,
  error: null,
};

function saveSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    openTabs: state.openTabs,
    activeTabId: state.activeTabId,
  }));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function bootstrap() {
  const session = loadSession();
  await refreshConcepts();

  const validTabs = (session.openTabs || []).filter((id) => state.conceptsById.has(id));
  if (validTabs.length > 0) {
    state.openTabs = validTabs;
    const active = validTabs.includes(session.activeTabId) ? session.activeTabId : validTabs[0];
    await openTab(active, false);
  } else {
    state.loading = false;
    render();
  }

  if (!isStatic) {
    pollProgress();
    setInterval(pollProgress, 5000);
  }
}

async function refreshConcepts() {
  try {
    const concepts = await fetchWikiList();
    state.concepts = concepts;
    state.conceptsById = new Map(concepts.map((c) => [c.conceptId, c]));
    state.loading = false;
    state.error = null;
  } catch (error) {
    state.error = String(error.message || error);
    state.loading = false;
  }
}

async function openTab(conceptId, save = true) {
  if (!state.openTabs.includes(conceptId)) {
    state.openTabs = [...state.openTabs, conceptId];
  }
  state.activeTabId = conceptId;
  state.showCode = false;
  if (save) saveSession();
  render();

  if (!state.entriesCache[conceptId]) {
    try {
      state.entriesCache[conceptId] = await fetchWikiEntry(conceptId);
    } catch (error) {
      state.error = `加载条目失败: ${error.message}`;
    }
    render();
  }
}

function closeTab(conceptId) {
  state.openTabs = state.openTabs.filter((id) => id !== conceptId);
  delete state.entriesCache[conceptId];
  if (state.activeTabId === conceptId) {
    state.activeTabId = state.openTabs[state.openTabs.length - 1] || null;
    state.showCode = false;
  }
  saveSession();
  render();
}

async function openSource(sourceId, charStart, charEnd) {
  state.sourceView = { sourceId, loading: true };
  render();
  try {
    const [meta, text] = await Promise.all([
      fetchSourceMeta(sourceId),
      fetchSourceText(sourceId, charStart, charEnd),
    ]);
    state.sourceView = { sourceId, meta, text, loading: false };
  } catch (error) {
    state.sourceView = { sourceId, loading: false, error: String(error.message || error) };
  }
  render();
}

function closeSource() {
  state.sourceView = null;
  render();
}

async function pollProgress() {
  const previous = state.progress?.done;
  state.progress = await fetchProgress();
  if (state.progress?.done !== previous && state.progress?.stage === "synthesize-wiki") {
    await refreshConcepts();
  }
  renderProgressOnly();
}

function renderProgressOnly() {
  const slot = document.getElementById("progressSlot");
  if (slot) slot.innerHTML = renderProgressPanel(state.progress);
}

function activeEntry() {
  return state.activeTabId ? state.entriesCache[state.activeTabId] || null : null;
}

function render() {
  const root = document.getElementById("app");
  if (!root) return;

  if (state.loading) {
    root.innerHTML = `<div class="bootstrap"><p>加载中…</p></div>`;
    return;
  }
  if (state.error && !state.concepts.length) {
    root.innerHTML = `<div class="bootstrap error"><p>${state.error}</p><p>请确认本地服务已启动。</p></div>`;
    return;
  }
  if (!state.concepts.length) {
    root.innerHTML = `<div class="bootstrap"><h2>暂无概念条目</h2><p>分析管线还未生成 wiki，进度面板会在底部显示。</p><div id="progressSlot">${renderProgressPanel(state.progress)}</div></div>`;
    return;
  }

  const entry = activeEntry();
  root.innerHTML = html`
    <div class="shell">
      ${raw(renderLeftPanel(state))}
      <main class="entryArea">
        ${raw(renderConceptEntry(entry, state.conceptsById, state.showCode))}
      </main>
      ${raw(renderRightPanel(state.concepts, state.query, state.activeTabId))}
    </div>
    <div id="progressSlot" class="progressSlot">${raw(renderProgressPanel(state.progress))}</div>
    ${raw(renderSourceViewer(state))}
  `;
  bindEvents();
}

const debouncedQuery = debounce((value) => {
  state.query = value;
  render();
}, 120);

function bindEvents() {
  // Search
  const search = document.getElementById("conceptSearch");
  if (search) {
    search.addEventListener("input", (e) => debouncedQuery(e.target.value));
    if (state.query && document.activeElement !== search) search.value = state.query;
  }

  // Left panel: switch active tab
  for (const el of document.querySelectorAll(".tabCard[data-concept-id]")) {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-close-tab]")) return;
      openTab(el.dataset.conceptId);
    });
  }

  // Left panel: close tab
  for (const btn of document.querySelectorAll("[data-close-tab]")) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(btn.dataset.closeTab);
    });
  }

  // Right panel: open concept
  for (const btn of document.querySelectorAll(".dirItem[data-concept-id]")) {
    btn.addEventListener("click", () => openTab(btn.dataset.conceptId));
  }

  // Entry: related concept chips
  for (const btn of document.querySelectorAll(".relatedChip[data-concept-id]")) {
    btn.addEventListener("click", () => openTab(btn.dataset.conceptId));
  }

  // Entry header: toggle raw code
  for (const btn of document.querySelectorAll("[data-action='toggle-code']")) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.showCode = !state.showCode;
      render();
    });
  }

  // Download single entry as JSON
  for (const btn of document.querySelectorAll("[data-action='download-json']")) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const entry = activeEntry();
      if (!entry) return;
      downloadBlob(JSON.stringify(entry, null, 2), `${entry.canonical_zh}.json`, "application/json");
    });
  }

  // Download single entry as Markdown
  for (const btn of document.querySelectorAll("[data-action='download-md']")) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const entry = activeEntry();
      if (!entry) return;
      downloadBlob(entryToMarkdown(entry), `${entry.canonical_zh}.md`, "text/markdown");
    });
  }

  // Bulk export
  for (const btn of document.querySelectorAll("[data-action='export-all']")) {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      btn.disabled = true;
      btn.textContent = "导出中…";
      try {
        let ndjson;
        if (isStatic) {
          const { fetchWikiList: list, fetchWikiEntry: entry } = await import("./api.js");
          const concepts = await list();
          const lines = await Promise.all(concepts.map((c) => entry(c.conceptId)));
          ndjson = lines.filter(Boolean).map((e) => JSON.stringify(e)).join("\n");
        } else {
          const res = await fetch("/api/wiki/export.ndjson", { cache: "no-store" });
          if (!res.ok) throw new Error(`${res.status}`);
          ndjson = await res.text();
        }
        downloadBlob(ndjson, `storykb-wiki-${new Date().toISOString().slice(0, 10)}.ndjson`, "application/x-ndjson");
      } catch (err) {
        alert(`导出失败: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = "⬇ 批量导出";
      }
    });
  }

  // Evidence items → source viewer
  for (const btn of document.querySelectorAll(".evidenceItem")) {
    btn.addEventListener("click", () => openSource(
      btn.dataset.sourceId,
      Number(btn.dataset.charStart),
      Number(btn.dataset.charEnd),
    ));
  }

  for (const btn of document.querySelectorAll("[data-action='close-source']")) {
    btn.addEventListener("click", closeSource);
  }
  document.querySelector(".sourceOverlay")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("sourceOverlay")) closeSource();
  });
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

bootstrap();
