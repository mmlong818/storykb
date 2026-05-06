import { html, raw, escapeHtml } from "../util.js";

export function renderLeftPanel(state) {
  const tabs = state.openTabs.map((id) => {
    const c = state.conceptsById.get(id);
    if (!c) return "";
    const isActive = id === state.activeTabId;
    return `
      <div class="tabCard ${isActive ? "active" : ""}" data-concept-id="${escapeHtml(id)}">
        <span class="tabTitle">${escapeHtml(c.canonical_zh)}</span>
        <button class="tabClose" data-close-tab="${escapeHtml(id)}" title="关闭">×</button>
      </div>
    `;
  }).join("");

  return html`
    <aside class="leftPanel">
      <div class="leftBrand">猫叔的编剧知识库</div>
      <div class="leftSearch">
        <input id="conceptSearch" placeholder="搜索概念…" value="${state.query}" autocomplete="off" />
      </div>
      ${state.openTabs.length > 0 ? raw(`
        <div class="tabsHeader">已打开</div>
        <div class="tabsList">${tabs}</div>
      `) : raw(`<div class="tabsEmpty">点击右侧概念打开</div>`)}
    </aside>
  `;
}
