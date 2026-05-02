import mammoth from "mammoth";

export async function parseDocx(rawPath) {
  const result = await mammoth.convertToHtml({ path: rawPath }, {
    styleMap: [
      "p[style-name='Heading 1'] => h1",
      "p[style-name='Heading 2'] => h2",
      "p[style-name='Heading 3'] => h3",
      "p[style-name='Heading 4'] => h4",
      "p[style-name='Heading 5'] => h5",
      "p[style-name='Heading 6'] => h6",
    ],
  });
  const html = result.value || "";
  const { text, headings } = htmlToTextWithHeadings(html);
  return {
    text,
    structure: { headings, mode: "docx" },
    pages: null,
    parser: "mammoth",
    warnings: result.messages?.slice(0, 20).map((m) => m.message) || [],
  };
}

function htmlToTextWithHeadings(html) {
  const headings = [];
  const out = [];
  let offset = 0;
  const tagRe = /<(\/?)(h[1-6]|p|li|br)([^>]*)>/gi;
  let cursor = 0;
  let pendingHeadingLevel = null;
  let buffer = "";

  const flush = (asHeading) => {
    const clean = decodeEntities(buffer.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    buffer = "";
    if (!clean) return;
    if (asHeading) {
      headings.push({ level: pendingHeadingLevel, text: clean, charStart: offset });
    }
    out.push(clean);
    offset += clean.length + 1;
  };

  for (const match of html.matchAll(tagRe)) {
    const [whole, slash, tag] = match;
    buffer += html.slice(cursor, match.index);
    cursor = match.index + whole.length;
    if (slash === "/") {
      const wasHeading = pendingHeadingLevel !== null;
      flush(wasHeading);
      pendingHeadingLevel = null;
    } else {
      flush(false);
      if (/^h[1-6]$/i.test(tag)) pendingHeadingLevel = Number(tag.slice(1));
    }
  }
  buffer += html.slice(cursor);
  flush(false);

  return { text: out.join("\n"), headings };
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
