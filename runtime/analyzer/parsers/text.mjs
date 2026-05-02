import fs from "node:fs";

export async function parseTextFile(rawPath) {
  const buf = fs.readFileSync(rawPath);
  const text = stripBOM(buf.toString("utf8")).replace(/\r\n?/g, "\n");
  return {
    text,
    structure: detectStructure(text),
    pages: null,
    parser: "text",
  };
}

function stripBOM(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function detectStructure(text) {
  const headings = [];
  const lines = text.split("\n");
  let offset = 0;
  for (const [index, line] of lines.entries()) {
    const md = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (md) {
      headings.push({
        level: md[1].length,
        text: md[2].trim(),
        charStart: offset,
        line: index,
      });
    }
    offset += line.length + 1;
  }
  return { headings, mode: headings.length ? "markdown" : "plain" };
}
