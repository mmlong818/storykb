import { html, raw, escapeHtml } from "../util.js";

export function renderConceptIndex(state) {
  const filtered = filterConcepts(state.concepts, state.query, state.typeFilter);
  const types = collectTypes(state.concepts);
  return html`
    <aside class="conceptIndex">
      <div class="indexHeader">
        <input id="conceptSearch" placeholder="搜索概念（中文或英文，含别名）" value="${state.query}" />
        <div class="typeFilters">
          <button data-type-filter="" class="${state.typeFilter ? "" : "active"}">全部 ${state.concepts.length}</button>
          ${raw(types.map(([t, n]) => `<button data-type-filter="${escapeHtml(t)}" class="${state.typeFilter === t ? "active" : ""}">${escapeHtml(t)} ${n}</button>`).join(""))}
        </div>
        <div class="indexStats">
          ${filtered.length} / ${state.concepts.length} 条概念
        </div>
      </div>
      <div class="conceptList">
        ${raw(filtered.map((c) => renderConceptCard(c, state.activeConceptId)).join(""))}
      </div>
    </aside>
  `;
}

function renderConceptCard(c, activeId) {
  const cls = c.conceptId === activeId ? "conceptCard active" : "conceptCard";
  const aliases = c.aliases?.length ? `<em>${escapeHtml(c.aliases.slice(0, 3).join(" / "))}</em>` : "";
  return `
    <button class="${cls}" data-concept-id="${escapeHtml(c.conceptId)}">
      <strong>${escapeHtml(c.canonical_zh)}</strong>
      ${c.canonical_en ? `<span class="enName">${escapeHtml(c.canonical_en)}</span>` : ""}
      ${aliases}
      <div class="cardMeta">
        <span class="evCount">${c.evidenceCount} 证据</span>
        <span class="srcCount">${c.sourceCount} 来源</span>
        ${(c.types || []).slice(0, 2).map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join("")}
      </div>
    </button>
  `;
}

function filterConcepts(concepts, query, typeFilter) {
  let result = concepts;
  if (typeFilter) result = result.filter((c) => c.types?.includes(typeFilter));
  const q = query?.trim().toLowerCase();
  if (!q) return result;
  return result.filter((c) => {
    const haystack = [c.canonical_zh, c.canonical_en, ...(c.aliases || [])].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

function collectTypes(concepts) {
  const counter = new Map();
  for (const c of concepts) {
    for (const t of c.types || []) counter.set(t, (counter.get(t) || 0) + 1);
  }
  return [...counter.entries()].sort((a, b) => b[1] - a[1]);
}
