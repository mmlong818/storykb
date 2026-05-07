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
  const zh = c.canonical_zh.trim().charAt(0);
  return pinyinInitial(zh);
}

// boundary characters: the first character whose pinyin starts with each letter
const PINYIN_BOUNDARIES = [
  ["A", "啊"], ["B", "芭"], ["C", "擦"], ["D", "搭"],
  ["E", "鹅"], ["F", "发"], ["G", "噶"], ["H", "哈"],
  ["J", "击"], ["K", "喀"], ["L", "垃"], ["M", "妈"],
  ["N", "拿"], ["O", "哦"], ["P", "啪"], ["Q", "七"],
  ["R", "然"], ["S", "撒"], ["T", "他"], ["W", "挖"],
  ["X", "西"], ["Y", "压"], ["Z", "匝"],
];
const collator = new Intl.Collator("zh-Hans-CN", { sensitivity: "base" });

function pinyinInitial(ch) {
  if (!ch) return "#";
  const u = ch.toUpperCase();
  if (/[A-Z]/.test(u) && !/[一-鿿]/.test(ch)) return u;
  let label = "#";
  for (const [letter, boundary] of PINYIN_BOUNDARIES) {
    if (collator.compare(ch, boundary) >= 0) label = letter;
  }
  return label;
}
