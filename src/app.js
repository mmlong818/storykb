import { fetchWikiList, fetchWikiEntry, fetchSourceMeta, fetchSourceText, fetchProgress } from "./api.js";
import { renderConceptIndex } from "./views/concept-index.js";
import { renderConceptEntry } from "./views/concept-entry.js";
import { renderSourceViewer } from "./views/source-viewer.js";
import { renderProgressPanel } from "./views/progress-panel.js";
import { html, raw, debounce } from "./util.js";

const STORAGE_KEY = "story-kb-wiki-v1";

const state = {
  concepts: [],
  conceptsById: new Map(),
  query: "",
  typeFilter: "",
  activeConceptId: null,
  activeEntry: null,
  sourceView: null,
  progress: null,
  loading: true,
  error: null,
};

function saveSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    activeConceptId: state.activeConceptId,
    typeFilter: state.typeFilter,
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
  state.typeFilter = session.typeFilter || "";
  await refreshConcepts();
  if (session.activeConceptId && state.conceptsById.has(session.activeConceptId)) {
    await selectConcept(session.activeConceptId);
  } else if (state.concepts.length > 0) {
    await selectConcept(state.concepts[0].conceptId);
  } else {
    state.loading = false;
    render();
  }
  pollProgress();
  setInterval(pollProgress, 5000);
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

async function selectConcept(conceptId) {
  state.activeConceptId = conceptId;
  state.activeEntry = null;
  saveSession();
  render();
  try {
    state.activeEntry = await fetchWikiEntry(conceptId);
  } catch (error) {
    state.error = `加载条目失败: ${error.message}`;
  }
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
  if (!state.sourceView) renderProgressOnly();
}

function renderProgressOnly() {
  const slot = document.getElementById("progressSlot");
  if (slot) slot.innerHTML = renderProgressPanel(state.progress);
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
  root.innerHTML = html`
    <div class="shell">
      ${raw(renderConceptIndex({ concepts: state.concepts, query: state.query, typeFilter: state.typeFilter, activeConceptId: state.activeConceptId }))}
      <main class="entryArea">
        ${raw(renderConceptEntry(state.activeEntry, state.conceptsById))}
      </main>
      <div id="progressSlot" class="progressSlot">${raw(renderProgressPanel(state.progress))}</div>
    </div>
    ${raw(renderSourceViewer(state))}
  `;
  bindEvents();
}

const debouncedQuery = debounce((value) => {
  state.query = value;
  render();
}, 120);

function bindEvents() {
  const search = document.getElementById("conceptSearch");
  if (search) {
    search.addEventListener("input", (event) => debouncedQuery(event.target.value));
    if (state.query && document.activeElement !== search) search.value = state.query;
  }
  for (const btn of document.querySelectorAll("[data-type-filter]")) {
    btn.addEventListener("click", () => {
      state.typeFilter = btn.dataset.typeFilter || "";
      saveSession();
      render();
    });
  }
  for (const card of document.querySelectorAll("[data-concept-id]")) {
    card.addEventListener("click", () => selectConcept(card.dataset.conceptId));
  }
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
  document.querySelector(".sourceOverlay")?.addEventListener("click", (event) => {
    if (event.target.classList.contains("sourceOverlay")) closeSource();
  });
}

bootstrap();
