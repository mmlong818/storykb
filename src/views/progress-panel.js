import { escapeHtml } from "../util.js";

const STAGE_LABELS = {
  "ingest": "导入",
  "parse": "解析",
  "chunk": "切块",
  "dedupe": "去重",
  "extract-concepts": "概念抽取",
  "consolidate": "归并",
  "synthesize-wiki": "Wiki 合成",
};

export function renderProgressPanel(progress) {
  if (!progress?.stage) {
    return `<div class="progressPanel idle">分析管线未运行</div>`;
  }
  const pct = progress.total ? Math.floor((progress.done / progress.total) * 100) : 0;
  const stageLabel = STAGE_LABELS[progress.stage] || escapeHtml(progress.stage);
  const elapsedMs = Date.now() - new Date(progress.startedAt).getTime();
  const rate = progress.done > 0 ? elapsedMs / progress.done : 0;
  const remaining = progress.total - progress.done;
  const etaMs = rate * remaining;
  const errors = progress.errors?.length || 0;

  const remainingHtml = remaining > 0
    ? `<span>剩余 ${escapeHtml(formatDuration(etaMs))}</span>`
    : "";
  const errorsHtml = errors > 0
    ? `<span class="warn">⚠ ${errors} 错误</span>`
    : "";
  const currentHtml = progress.current
    ? `<div class="progressCurrent">${escapeHtml(progress.current)}</div>`
    : "";

  return `
    <div class="progressPanel running">
      <div class="progressTop">
        <strong>${escapeHtml(stageLabel)}</strong>
        <span>${progress.done} / ${progress.total} (${pct}%)</span>
      </div>
      <div class="progressBar"><div class="progressFill" style="width:${pct}%"></div></div>
      <div class="progressMeta">
        <span>已用 ${escapeHtml(formatDuration(elapsedMs))}</span>
        ${remainingHtml}
        ${errorsHtml}
      </div>
      ${currentHtml}
    </div>
  `;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}
