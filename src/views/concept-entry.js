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

export function renderConceptEntry(entry, allConceptsById, showCode = false) {
  if (!entry) {
    return html`<article class="conceptEntry empty">
      <div class="emptyHint">
        <p>从右侧目录选择概念查看详情</p>
        <p class="emptyMuted">支持多标签同时打开 · 点击相关概念可跳转</p>
      </div>
    </article>`;
  }

  const sections = entry.sections || {};
  const sectionsHtml = Object.entries(SECTION_LABELS)
    .map(([key, label]) => {
      const text = sections[key];
      if (!text) return "";
      return `<section class="wikiSection">
        <h3>${escapeHtml(label)}</h3>
        <div class="sectionBody">${renderMarkdown(text)}</div>
      </section>`;
    }).join("");

  const bookPerspectives = (entry.source_perspectives || []).filter((p) => isBookSource(p.sourceTitle));
  const perspectives = bookPerspectives.map((p) => `
    <div class="perspective">
      <p>${escapeHtml(p.view || "").replace(/\n/g, "<br>")}</p>
    </div>
  `).join("");

  const related = (entry.related_concepts || []).map((name) => {
    const match = findConceptByName(allConceptsById, name);
    if (match) return `<button class="relatedChip" data-concept-id="${escapeHtml(match.conceptId)}">${escapeHtml(name)}</button>`;
    return `<span class="relatedChip dim">${escapeHtml(name)}</span>`;
  }).join("");

  const backlinks = buildBacklinks(entry, allConceptsById);
  const backlinksHtml = backlinks.map((c) =>
    `<button class="relatedChip backlink" data-concept-id="${escapeHtml(c.conceptId)}">${escapeHtml(c.canonical_zh)}</button>`
  ).join("");

  const codeContent = showCode
    ? `<section class="wikiSection codeSection">
        <pre class="entryCode">${escapeHtml(JSON.stringify(entry, null, 2))}</pre>
      </section>`
    : "";

  // Build pills as joined string, not array of raw objects
  const pillsHtml = (entry.types || []).map((t) =>
    `<span class="pill">${escapeHtml(t)}</span>`
  ).join("");

  const enNameHtml = entry.canonical_en
    ? `<div class="enName">${escapeHtml(entry.canonical_en)}</div>`
    : "";

  const aliasesHtml = entry.aliases?.length
    ? `<div class="aliases">别名：${escapeHtml(entry.aliases.join(" · "))}</div>`
    : "";

  const reviewedHtml = entry.lastReviewedAt
    ? `<span class="reviewedBadge">已审核</span>`
    : "";

  return html`
    <article class="conceptEntry">
      <header class="entryHeader">
        <div class="entryHeaderTop">
          <div class="entryTitles">
            <h2>${entry.canonical_zh}</h2>
            ${raw(enNameHtml)}
            ${raw(aliasesHtml)}
          </div>
          <div class="entryActions">
            <button class="actionBtn ${showCode ? "active" : ""}" data-action="toggle-code" title="查看原始数据">{ }</button>
            <button class="actionBtn" data-action="download-json" title="下载 JSON">↓ JSON</button>
            <button class="actionBtn" data-action="download-md" title="下载 Markdown">↓ MD</button>
          </div>
        </div>
        <div class="entryMeta">
          ${raw(pillsHtml)}
          <span class="evMeta">${entry.evidence?.length || 0} 条证据 · ${new Set((entry.evidence || []).map((e) => e.sourceId)).size} 个来源</span>
          ${raw(reviewedHtml)}
        </div>
      </header>
      <div class="entryBody">
        ${raw(codeContent)}
        ${raw(sectionsHtml || "<p class='empty'>暂无内容</p>")}
        ${perspectives ? raw(`<section class="wikiSection perspectivesBlock"><h3>来源摘录</h3>${perspectives}</section>`) : ""}
        ${related ? raw(`<section class="wikiSection"><h3>相关概念 <span class="sectionNote">→ 本条引用</span></h3><div class="relatedChips">${related}</div></section>`) : ""}
        ${backlinksHtml ? raw(`<section class="wikiSection"><h3>被引用自 <span class="sectionNote">← 其他条目</span></h3><div class="relatedChips">${backlinksHtml}</div></section>`) : ""}
      </div>
    </article>
  `;
}

function buildBacklinks(entry, allConceptsById) {
  if (!allConceptsById || !entry) return [];
  const names = new Set([
    entry.canonical_zh?.toLowerCase(),
    entry.canonical_en?.toLowerCase(),
    ...(entry.aliases || []).map((a) => a.toLowerCase()),
  ].filter(Boolean));
  const result = [];
  for (const c of allConceptsById.values()) {
    if (c.conceptId === entry.conceptId) continue;
    const related = (c.related_concepts || []).map((r) => r.toLowerCase());
    if (related.some((r) => names.has(r))) result.push(c);
  }
  return result;
}

function renderMarkdown(text) {
  return `<p>${escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")}</p>`;
}

export function entryToMarkdown(entry) {
  const lines = [`# ${entry.canonical_zh}`];
  if (entry.canonical_en) lines.push(`*${entry.canonical_en}*`);
  if (entry.aliases?.length) lines.push(`\n别名：${entry.aliases.join(" · ")}`);
  if (entry.types?.length) lines.push(`\n类型：${entry.types.join("、")}`);
  lines.push("");
  for (const [key, label] of Object.entries(SECTION_LABELS)) {
    const text = entry.sections?.[key];
    if (!text) continue;
    lines.push(`## ${label}\n\n${text}\n`);
  }
  if (entry.source_perspectives?.length) {
    lines.push("## 来源观点对照\n");
    for (const p of entry.source_perspectives) {
      lines.push(`**${p.sourceTitle || "未署名来源"}**\n\n${p.view || ""}\n`);
    }
  }
  if (entry.related_concepts?.length) {
    lines.push(`## 相关概念\n\n${entry.related_concepts.join("、")}\n`);
  }
  return lines.join("\n");
}

function isBookSource(title) {
  if (!title || typeof title !== "string") return false;
  const t = title.trim();
  if (!t || t === "未署名来源") return false;
  // URL 或域名形式
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return false;
  // 过短的标识符（单词/缩写，非书名）
  if (t.length < 4 && /^[A-Za-z]+$/.test(t)) return false;
  return true;
}

export function findConceptByName(map, name) {
  if (!map || !name) return null;
  const n = String(name).trim().toLowerCase();
  for (const c of map.values()) {
    if (c.canonical_zh?.toLowerCase() === n) return c;
    if (c.canonical_en?.toLowerCase() === n) return c;
    if ((c.aliases || []).some((a) => a.toLowerCase() === n)) return c;
  }
  return null;
}
