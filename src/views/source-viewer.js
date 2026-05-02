import { html, raw, escapeHtml } from "../util.js";

export function renderSourceViewer(state) {
  if (!state.sourceView) return "";
  const { meta, text, loading, error } = state.sourceView;
  return html`
    <div class="sourceOverlay">
      <div class="sourcePanel">
        <header class="sourceHeader">
          <div>
            <strong>${meta?.originalName || state.sourceView.sourceId.slice(0, 12)}</strong>
            ${meta ? html`<span class="sourceMeta">${meta.parser || "?"} · ${meta.charLength?.toLocaleString() || "?"} 字 · ${meta.pageCount || "?"} 页</span>` : ""}
          </div>
          <button data-action="close-source">关闭</button>
        </header>
        <div class="sourceBody">
          ${loading ? raw("<p class='empty'>加载中…</p>") : ""}
          ${error ? raw(`<p class="empty">读取失败：${escapeHtml(error)}</p>`) : ""}
          ${text?.before != null ? raw(renderHighlighted(text)) : ""}
          ${text?.full ? raw(`<pre>${escapeHtml(text.full)}</pre>`) : ""}
        </div>
        ${text?.total ? html`<footer class="sourceFooter">字符位置 ${text.windowStart}–${text.windowEnd} / 共 ${text.total.toLocaleString()}</footer>` : ""}
      </div>
    </div>
  `;
}

function renderHighlighted(text) {
  return `<pre>${escapeHtml(text.before || "")}<mark>${escapeHtml(text.highlight || "")}</mark>${escapeHtml(text.after || "")}</pre>`;
}
