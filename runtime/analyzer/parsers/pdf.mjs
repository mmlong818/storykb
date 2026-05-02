import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

export async function parsePdf(rawPath) {
  const buf = fs.readFileSync(rawPath);
  const pages = [];

  const renderPage = (pageData) => {
    const renderOptions = { normalizeWhitespace: false, disableCombineTextItems: false };
    return pageData.getTextContent(renderOptions).then((textContent) => {
      let lastY;
      let text = "";
      for (const item of textContent.items) {
        if (lastY === undefined || lastY === item.transform[5]) {
          text += item.str;
        } else {
          text += "\n" + item.str;
        }
        lastY = item.transform[5];
      }
      pages.push(text);
      return text + "\n\n";
    });
  };

  const result = await pdfParse(buf, { pagerender: renderPage });
  const fullText = pages.length ? pages.join("\n\n") : (result.text || "");
  const normalized = fullText.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  const pageOffsets = [];
  let cursor = 0;
  for (const page of pages) {
    pageOffsets.push({ charStart: cursor, length: page.length });
    cursor += page.length + 2;
  }

  const headings = detectHeadings(normalized);
  return {
    text: normalized,
    structure: { headings, mode: "pdf" },
    pages: { count: pages.length || result.numpages || 0, offsets: pageOffsets },
    parser: "pdf-parse",
    info: result.info || null,
  };
}

function detectHeadings(text) {
  const headings = [];
  const lines = text.split("\n");
  let offset = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && trimmed.length <= 40 && /^第[一二三四五六七八九十百千零\d]+[章节回部篇卷]/.test(trimmed)) {
      headings.push({ level: 2, text: trimmed, charStart: offset });
    } else if (trimmed && trimmed.length <= 30 && /^(?:Chapter|CHAPTER|Part|PART)\s+\d+/.test(trimmed)) {
      headings.push({ level: 2, text: trimmed, charStart: offset });
    } else if (trimmed && trimmed.length <= 30 && /^\d+[\.、]\s*\S/.test(trimmed) && !/[。：:]$/.test(trimmed)) {
      headings.push({ level: 3, text: trimmed, charStart: offset });
    }
    offset += line.length + 1;
  }
  return headings;
}
