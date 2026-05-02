import { html, raw, escapeHtml } from "../util.js";

const SECTION_LABELS = {
  definition: "定义",
  origins: "起源与流派",
  components: "构成要素",
  mechanism: "运作机制",
  applications: "应用场景",
  examples: "经典案例",
  diagnostics: "诊断要点",
  pitfalls: "常见误区",
};

export function renderConceptEntry(entry, allConceptsById) {
  if (!entry) {
    return html`<article class="conceptEntry empty">
      <h2>选择左侧概念查看百科条目</h2>
      <p>每条概念由跨书证据合成，可点击 related 概念跳转，可点击 evidence 跳到原文。</p>
    </article>`;
  }
  const sections = entry.sections || {};
  const sectionsHtml = Object.entries(SECTION_LABELS)
    .map(([key, label]) => {
      const text = sections[key];
      if (!text) return "";
      return `<section class="wikiSection"><h3>${escapeHtml(label)}</h3><p>${escapeHtml(text).replace(/\n/g, "<br>")}</p></section>`;
    })
    .join("");

  const perspectives = (entry.source_perspectives || []).map((p) => `
    <div class="perspective">
      <strong>${escapeHtml(p.sourceTitle || "未署名来源")}</strong>
      <p>${escapeHtml(p.view || "").replace(/\n/g, "<br>")}</p>
    </div>
  `).join("");

  const related = (entry.related_concepts || []).map((name) => {
    const match = findConceptByName(allConceptsById, name);
    if (match) {
      return `<button class="relatedChip" data-concept-id="${escapeHtml(match.conceptId)}">${escapeHtml(name)}</button>`;
    }
    return `<span class="relatedChip dim">${escapeHtml(name)}</span>`;
  }).join("");

  return html`
    <article class="conceptEntry">
      <header class="entryHeader">
        <h2>${entry.canonical_zh}</h2>
        ${entry.canonical_en ? html`<div class="enName">${entry.canonical_en}</div>` : ""}
        ${entry.aliases?.length ? html`<div class="aliases">别名：${entry.aliases.join(" · ")}</div>` : ""}
        <div class="entryMeta">
          ${(entry.types || []).map((t) => raw(`<span class="pill">${escapeHtml(t)}</span>`))}
          <span class="evMeta">${entry.evidence?.length || 0} 条证据 · ${new Set((entry.evidence || []).map((e) => e.sourceId)).size} 个来源</span>
        </div>
      </header>
      <div class="entryBody">
        ${raw(sectionsHtml || "<p class='empty'>暂无 section 内容。</p>")}
        ${perspectives ? raw(`<section class="wikiSection perspectivesBlock"><h3>来源观点对照</h3>${perspectives}</section>`) : ""}
        ${related ? raw(`<section class="wikiSection"><h3>相关概念</h3><div class="relatedChips">${related}</div></section>`) : ""}
      </div>
    </article>
  `;
}

function findConceptByName(map, name) {
  if (!map || !name) return null;
  const normalized = String(name).trim().toLowerCase();
  for (const c of map.values()) {
    if (c.canonical_zh?.toLowerCase() === normalized) return c;
    if (c.canonical_en?.toLowerCase() === normalized) return c;
    if ((c.aliases || []).some((a) => a.toLowerCase() === normalized)) return c;
  }
  return null;
}
