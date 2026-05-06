import { escapeHtml } from "../util.js";

export function renderRightPanel(concepts, query, activeTabId) {
  const q = query?.trim().toLowerCase();
  const filtered = q
    ? concepts.filter((c) => {
        const h = [c.canonical_zh, c.canonical_en, ...(c.aliases || [])].join(" ").toLowerCase();
        return h.includes(q);
      })
    : concepts;

  const sorted = [...filtered].sort((a, b) =>
    a.canonical_zh.localeCompare(b.canonical_zh, "zh-CN")
  );

  const groups = new Map();
  for (const c of sorted) {
    const key = groupKey(c);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === "#" && b !== "#") return 1;
    if (b === "#" && a !== "#") return -1;
    return a.localeCompare(b);
  });

  let out = `<nav class="rightPanel">`;
  for (const key of sortedKeys) {
    out += `<div class="dirGroup" id="dir-${escapeHtml(key)}">`;
    out += `<div class="dirLetter">${escapeHtml(key)}</div>`;
    out += `<div class="dirItems">`;
    for (const c of groups.get(key)) {
      const isActive = c.conceptId === activeTabId;
      out += `<button class="dirItem${isActive ? " active" : ""}" data-concept-id="${escapeHtml(c.conceptId)}">${escapeHtml(c.canonical_zh)}</button>`;
    }
    out += `</div>`;
    out += `</div>`;
  }
  out += `</nav>`;
  return out;
}

function groupKey(c) {
  if (c.canonical_en) {
    const ch = c.canonical_en.trim().charAt(0).toUpperCase();
    if (/[A-Z]/.test(ch)) return ch;
  }
  const zh = c.canonical_zh.trim().charAt(0);
  return pinyinInitial(zh);
}

const PINYIN_BANDS = [
  [0x554a, "A"], [0x8235, "B"], [0x5693, "C"], [0x5927, "D"],
  [0x5514, "E"], [0x53d1, "F"], [0x8c77, "G"], [0x54c8, "H"],
  [0x51fb, "J"], [0x54af, "K"], [0x5783, "L"], [0x5988, "M"],
  [0x62ff, "N"], [0x5662, "O"], [0x5991, "P"], [0x4e03, "Q"],
  [0x5982, "R"], [0x6492, "S"], [0x5854, "T"], [0x5c4b, "W"],
  [0x5699, "X"], [0x4e2b, "Y"], [0x5e00, "Z"],
];

function pinyinInitial(ch) {
  if (!ch) return "#";
  const code = ch.charCodeAt(0);
  if (code < 0x4e00 || code > 0x9fff) {
    const u = ch.toUpperCase();
    return /[A-Z]/.test(u) ? u : "#";
  }
  let label = "#";
  for (const [start, letter] of PINYIN_BANDS) {
    if (code >= start) label = letter;
  }
  return label;
}
