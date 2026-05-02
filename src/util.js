export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function html(strings, ...values) {
  let out = "";
  for (let i = 0; i < strings.length; i += 1) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v == null || v === false) continue;
      if (Array.isArray(v)) out += v.join("");
      else if (typeof v === "object" && v.__raw) out += v.__raw;
      else out += escapeHtml(v);
    }
  }
  return out;
}

export function raw(s) {
  return { __raw: String(s ?? "") };
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function on(selector, event, handler, root = document) {
  for (const el of root.querySelectorAll(selector)) {
    el.addEventListener(event, handler);
  }
}
