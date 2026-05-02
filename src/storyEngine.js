export const SUPPORTED_TEXT_EXTENSIONS = [".txt", ".md", ".csv", ".json", ".srt", ".vtt", ".html"];
export const REGISTER_ONLY_EXTENSIONS = [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx"];

export function uid(prefix) {
  const id = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${id}`;
}

export function getExtension(name = "") {
  const clean = name.toLowerCase().split("?")[0].split("#")[0];
  const index = clean.lastIndexOf(".");
  return index >= 0 ? clean.slice(index) : "";
}

export function classifyFile(name = "", mime = "") {
  const ext = getExtension(name);
  if (mime.startsWith("image/")) return { kind: "image", status: "registered", parser: "vision_or_ocr_pending" };
  if (SUPPORTED_TEXT_EXTENSIONS.includes(ext) || mime.startsWith("text/")) return { kind: "text", status: "analyzed", parser: "text" };
  if (REGISTER_ONLY_EXTENSIONS.includes(ext)) return { kind: "document", status: "registered", parser: "parser_pending" };
  return { kind: "unknown", status: "registered", parser: "manual_review" };
}

export function detectLanguage(text = "") {
  if (/[\u4e00-\u9fff]/.test(text)) return "中文";
  if (/[\u3040-\u30ff]/.test(text)) return "日文";
  if (/[\uac00-\ud7af]/.test(text)) return "韩文";
  if (/[А-Яа-яЁё]/.test(text)) return "俄文";
  if (/[áéíóúñü¿¡]/i.test(text)) return "西班牙文";
  if (/[àâçéèêëîïôûùüÿœ]/i.test(text)) return "法文";
  return "英文 / 混合";
}

export function detectType(title = "", text = "", fileKind = "") {
  if (fileKind === "image") return "image";
  if (fileKind === "document") return "document";
  const low = `${title} ${text}`.toLowerCase();
  if (low.includes("paper") || low.includes("arxiv") || low.includes("dataset") || low.includes("research") || low.includes("研究")) return "research";
  if (low.includes("fade in") || low.includes("int.") || low.includes("ext.") || low.includes("slugline")) return "screenplay";
  if (low.includes("scene") || low.includes("场") || low.includes("幕")) return "screenplay";
  if (low.includes("beat") || low.includes("structure") || low.includes("arc") || low.includes("人物弧线") || low.includes("theme") || low.includes("dramatic argument") || low.includes("编剧")) return "craft-theory";
  if (low.includes("course") || low.includes("lecture") || low.includes("课程")) return "course";
  if (low.includes("interview") || low.includes("访谈")) return "interview";
  return "note";
}

export function extractTags(text = "") {
  const terms = [
    ["伏笔", "setup"], ["回收", "payoff"], ["反转", "reversal"], ["扭转", "twist"],
    ["冲突", "conflict"], ["人物", "character"], ["弧线", "arc"], ["对白", "dialogue"],
    ["潜台词", "subtext"], ["悬疑", "suspense"], ["类型", "genre"], ["主题", "theme"],
    ["揭示", "reveal"], ["审讯", "interrogation"], ["晚餐", "dinner"], ["威胁", "threat"],
    ["压力", "pressure"], ["scene", "scene"], ["conflict", "conflict"], ["dialogue", "dialogue"],
    ["subtext", "subtext"], ["character", "character"], ["reveal", "reveal"], ["twist", "twist"],
    ["setup", "setup"], ["payoff", "payoff"], ["theme", "theme"], ["arc", "arc"], ["pressure", "pressure"],
  ];
  const low = text.toLowerCase();
  const tags = terms.filter(([needle]) => low.includes(needle.toLowerCase())).map(([, tag]) => tag);
  return [...new Set(tags)].slice(0, 10);
}

export function summarize(text = "", fallback = "") {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback || "资源已登记，等待后续解析器或模型分析。";
  return normalized.slice(0, 240) + (normalized.length > 240 ? "..." : "");
}

export function countWords(text = "") {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.replace(/[\u4e00-\u9fff]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + latin;
}

export function presentationStrategy(type = "", wordCount = 0) {
  if (type === "screenplay" || type === "play") return "案例页 + 场景表 + 机制摘要";
  if (type === "craft-theory" || type === "course") return "原则定义 + 诊断问题 + 适用边界";
  if (type === "research") return "研究方法 + 可计算标签 + 工程限制";
  if (type === "source_locator") return "来源目录 + 可信度规则";
  if (wordCount > 3000) return "全文保留为证据层，百科页只显示抽象定义与关键断言";
  return "摘要 + 关键知识点";
}

export function tagLabel(tag) {
  const labels = {
    setup: "伏笔", payoff: "回收", reversal: "反转", conflict: "冲突机制",
    character: "人物关系", arc: "人物弧线", dialogue: "对白技巧", subtext: "潜台词",
    suspense: "悬疑压力", genre: "类型机制", theme: "主题论证", scene: "场景功能",
    reveal: "信息揭示", twist: "情节扭转", interrogation: "审讯场景", dinner: "晚餐场景",
    threat: "威胁关系", pressure: "压力系统", story: "故事知识",
  };
  return labels[tag] || tag;
}

export function tagToType(tag) {
  if (["setup", "payoff", "dialogue", "subtext", "theme"].includes(tag)) return "technique";
  if (["arc", "character"].includes(tag)) return "character_arc";
  if (["reversal", "twist", "reveal"].includes(tag)) return "plot_device";
  if (["scene", "suspense", "interrogation", "dinner", "threat"].includes(tag)) return "scene_type";
  return "story_pattern";
}

export function analyzeResource({ title, body = "", fileName = "", mime = "", image = null }) {
  const fileInfo = fileName ? classifyFile(fileName, mime) : { kind: image ? "image" : "text", status: image ? "registered" : "analyzed", parser: image ? "vision_or_ocr_pending" : "text" };
  const finalTitle = (title || fileName || "未命名资料").trim();
  const combined = `${finalTitle}\n${body}`;
  const type = detectType(finalTitle, body, fileInfo.kind);
  const tags = extractTags(combined);
  const source = {
    id: uid("src"),
    title: finalTitle,
    type,
    language: detectLanguage(combined),
    status: fileInfo.status,
    parser: fileInfo.parser,
    createdAt: new Date().toISOString().slice(0, 10),
    summary: summarize(body, fileInfo.kind === "image" ? "图像资源已登记，等待 OCR / 视觉模型提取场景、人物、空间和情绪信息。" : "文件已登记，等待格式解析器提取可分析文本。"),
    wordCount: countWords(body || title),
    presentation: presentationStrategy(type, countWords(body || title)),
    tags,
    image,
    mime,
  };
  const nodes = makeNodesFromSource(source, body);
  const edges = nodes.slice(1).map((node) => ({ id: uid("edge"), from: nodes[0].id, to: node.id, type: "extracts" }));
  return { source, nodes, edges };
}

export function analyzeStructuredSource(seed) {
  const type = seed.type || "note";
  const wordCount = countWords(seed.body || seed.title || "");
  const source = {
    id: uid("src"),
    title: seed.title,
    type,
    language: seed.language || detectLanguage(`${seed.title}\n${seed.body || ""}`),
    status: "analyzed",
    parser: "curated_seed",
    createdAt: new Date().toISOString().slice(0, 10),
    summary: summarize(seed.body || seed.summary || ""),
    wordCount,
    presentation: presentationStrategy(type, wordCount),
    tags: seed.tags || extractTags(`${seed.title}\n${seed.body || ""}`),
    access: seed.access,
    url: seed.url,
    formatNotes: seed.formatNotes,
  };
  const nodes = makeTypedNodesFromSeed(source, seed);
  const edges = nodes.slice(1).map((node) => ({ id: uid("edge"), from: nodes[0].id, to: node.id, type: "extracts" }));
  for (let i = 1; i < nodes.length - 1; i += 1) edges.push({ id: uid("edge"), from: nodes[i].id, to: nodes[i + 1].id, type: relationForTypes(nodes[i].type, nodes[i + 1].type) });
  return { source, nodes, edges };
}

function makeTypedNodesFromSeed(source, seed) {
  if (isPromptSchemeSource(seed)) {
    return makePromptSchemeNodes(source, seed);
  }
  const formulaEntries = extractFormulaEntries(seed.body || "");
  if (formulaEntries.length >= 3) {
    return makeFormulaKnowledgeNodes(source, seed, formulaEntries);
  }
  const numberedEntries = extractNumberedKnowledgeEntries(seed.body || "");
  if (numberedEntries.length >= 3) {
    return makeNumberedKnowledgeNodes(source, numberedEntries);
  }
  const primaryType = source.type === "screenplay" ? "case_study" : source.type === "play" ? "classic_case" : source.type === "document" ? "local_document" : source.type === "craft-theory" ? "technique" : source.type === "course" ? "craft_framework" : source.type === "research" ? "research_method" : "source_registry";
  const primary = makeNode(source.title.slice(0, 30), primaryType, source.summary, source.tags, source.id);
  const body = seed.body || source.summary;
  const specific = [
    makeNode("内容摘要", "source_summary", body, ["summary"], source.id),
    makeNode("可复用机制", source.type === "research" ? "analysis_axis" : "story_pattern", `从《${source.title}》中重构出的可迁移知识，不复制原文，而抽象为可检索、可引用、可对照的百科条目。`, source.tags.slice(0, 4), source.id),
    makeNode("适用边界", "failure_mode", "记录该资料适合回答的问题、可能误用的地方，以及需要和案例互证的限制。", ["boundary", "evidence"], source.id),
  ];
  if (source.type === "screenplay" || source.type === "play") specific.push(makeNode("场景与桥段索引", "scene_type", "按场景功能、冲突形式、信息揭示和人物选择建立索引，供创作时快速跳转。", ["scene", "structure"], source.id));
  if (source.type === "craft-theory" || source.type === "course") specific.push(makeNode("诊断问题", "craft_checklist", "把理论转为可执行的检查问题，用于诊断剧本、角色、主题和节奏。", ["craft", "diagnostic"], source.id));
  return [primary, ...specific];
}

function isPromptSchemeSource(seed) {
  const title = seed.title || "";
  return /故事系统/i.test(title);
}

function makePromptSchemeNodes(source, seed) {
  const body = seed.body || source.summary;
  return [
    {
      ...makeNode("故事系统：提示词方案", "prompt_scheme", summarize(body), ["prompt", "workflow", "story-system"], source.id),
      template: "prompt_scheme",
      category: "提示词方案",
      theme: "故事系统",
      fields: {
        方案定位: "用于驱动故事创作模型的完整提示词/执行逻辑方案，不作为情节桥段库逐条拆解。",
        使用方式: "作为提示词知识库中的方案条目保存；后续可在创作流程中整体调用，或按需抽取局部规则。",
        原文方案: body,
      },
      originalText: body,
    },
  ];
}

export function extractFormulaEntries(text = "") {
  const normalized = text.replace(/\r/g, "").replace(/\u0001/g, "\n");
  const entryStart = /^(?<id>(?:[A-Z]{2}-[A-Z]{2}-\d{2,3}|SN-[A-Z]-\d{3}))\s*(?:\([^)]*\))?\s*\|?\s*(?<name>[^\n]+)?$/gm;
  const matches = [...normalized.matchAll(entryStart)].filter((match) => {
    const name = (match.groups?.name || "").trim();
    return name && !name.includes("[") && name.length < 80;
  });
  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = matches[index + 1]?.index || normalized.length;
    const block = normalized.slice(start, end).trim();
    const id = match.groups.id.trim();
    const name = cleanEntryName(match.groups.name || id);
    const fields = extractEntryFields(block);
    return {
      id,
      name,
      title: `${id} ${name}`,
      block,
      fields,
      category: categoryFromFormulaId(id),
      theme: inferThemeForEntry(normalized.slice(Math.max(0, start - 1200), start), id),
    };
  });
}

export function extractNumberedKnowledgeEntries(text = "") {
  const normalized = text.replace(/\r/g, "").replace(/\u0001/g, "\n");
  const entryStart = /^(?<num>\d{1,2})[.．、]\s*(?<name>[^\n]{2,40})$/gm;
  const matches = [...normalized.matchAll(entryStart)].filter((match) => {
    const name = (match.groups?.name || "").trim();
    return !/[。:：]$/.test(name) && !name.includes("http");
  });
  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = matches[index + 1]?.index || normalized.length;
    const block = normalized.slice(start, end).trim();
    return {
      id: `SECTION-${match.groups.num.padStart(2, "0")}`,
      name: match.groups.name.trim(),
      title: `${match.groups.num}. ${match.groups.name.trim()}`,
      block,
      fields: extractLooseFields(block),
    };
  });
}

function extractLooseFields(block = "") {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  return {
    要点: lines.slice(1, 8).join("\n"),
    原文片段: lines.slice(0, 16).join("\n"),
  };
}

function cleanEntryName(name = "") {
  return name.replace(/^[|｜\s]+/, "").replace(/\s+/g, " ").trim();
}

function extractEntryFields(block = "") {
  const labels = ["核心功能", "构成", "出处题材", "必备元素", "镜头化拆解", "应用实例与解析", "实例", "解析", "创意变体", "示例"];
  const fields = {};
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nextLabels = labels.filter((item) => item !== label).map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const match = block.match(new RegExp(`${escaped}\\s*[:：]\\s*([\\s\\S]*?)(?=\\n(?:${nextLabels})\\s*[:：]|$)`));
    if (match) fields[label] = match[1].trim();
  }
  return fields;
}

function categoryFromFormulaId(id = "") {
  if (id.includes("-SC-") || /^SN-[RWSH]-/.test(id)) return "场景构建";
  if (id.includes("-EP-")) return "情感递进";
  if (id.includes("-CD-")) return "冲突发展";
  if (id.includes("-CA-")) return "人物塑造";
  return "情节公式";
}

function inferThemeForEntry(prefix = "", id = "") {
  const match = prefix.match(/题材[一二三四五六七八九十\d]+[:：]\s*([^\n]+)/g);
  if (match?.length) return match.at(-1).replace(/^题材[一二三四五六七八九十\d]+[:：]\s*/, "").trim();
  if (id.startsWith("LR-")) return "爱情浪漫";
  if (id.startsWith("HE-")) return "治愈";
  if (id.startsWith("SN-R-")) return "爱情浪漫";
  if (id.startsWith("SN-S-")) return "校园青春";
  if (id.startsWith("SN-W-")) return "温情";
  if (id.startsWith("SN-H-")) return "治愈";
  return "未标注题材";
}

function makeFormulaKnowledgeNodes(source, seed, entries) {
  const root = makeNode(`${source.title.replace(/\.[^.]+$/, "")}：条目索引`, "knowledge_collection", `该聚合文档已识别 ${entries.length} 个结构化知识条目。系统按原文 ID、名称、构成、示例、解析和变体拆分入库，而不是压缩成摘要。`, ["collection", "formula-library"], source.id);
  const nodes = [root];
  for (const [index, entry] of entries.entries()) {
    const summary = entry.fields["核心功能"] || entry.fields["解析"] || entry.fields["构成"] || summarize(entry.block);
    nodes.push({
      ...makeNode(entry.title, formulaTypeFromEntry(entry), summary, tagsForFormulaEntry(entry), source.id),
      formulaId: entry.id,
      sequence: index + 1,
      template: "plot_formula",
      category: entry.category,
      theme: entry.theme,
      fields: entry.fields,
      originalText: entry.block,
    });
  }
  return nodes;
}

function makeNumberedKnowledgeNodes(source, entries) {
  const root = makeNode(`${source.title.replace(/\.[^.]+$/, "")}：执行知识索引`, "knowledge_collection", `该文档已识别 ${entries.length} 个编号知识段落。系统按章节名称拆分，保留要点和原文片段，用于后续匹配角色、世界观、情节推进和写作流程模板。`, ["collection", "workflow"], source.id);
  return [
    root,
    ...entries.map((entry, index) => ({
      ...makeNode(entry.title, "workflow_rule", summarize(entry.block), ["workflow", "story-system"], source.id),
      formulaId: entry.id,
      sequence: index + 1,
      template: "workflow_rule",
      category: "执行逻辑",
      theme: "故事系统",
      fields: entry.fields,
      originalText: entry.block,
    })),
  ];
}

function formulaTypeFromEntry(entry) {
  if (entry.category === "人物塑造") return "character_template";
  if (entry.category === "冲突发展") return "conflict_formula";
  if (entry.category === "情感递进") return "emotional_progression";
  return "plot_beat_formula";
}

function tagsForFormulaEntry(entry) {
  const tags = ["formula", entry.category, entry.theme].filter(Boolean);
  const text = `${entry.name} ${Object.values(entry.fields).join(" ")}`;
  return [...new Set([...tags, ...extractTags(text)])].slice(0, 10);
}

export function makeNodesFromSource(source, body = "") {
  const tags = source.tags.length ? source.tags : ["story"];
  const primary = makeNode(source.title.slice(0, 28), source.type === "screenplay" ? "case_study" : source.type === "image" ? "visual_source" : "source_insight", source.summary, tags, source.id);
  const derived = tags.slice(0, 4).map((tag) => makeNode(tagLabel(tag), tagToType(tag), `从《${source.title}》中抽取到的 ${tagLabel(tag)} 相关知识点。${body ? summarize(body) : source.summary}`, [tag], source.id));
  return [primary, ...derived];
}

function makeNode(label, type, summary, tags, sourceId) {
  return {
    id: uid("node"),
    label,
    type,
    x: 12 + Math.random() * 76,
    y: 12 + Math.random() * 76,
    summary,
    evidence: [sourceId],
    tags,
  };
}

function relationForTypes(fromType, toType) {
  if (fromType.includes("summary")) return "defines";
  if (toType.includes("failure")) return "bounded_by";
  if (fromType.includes("scene") || toType.includes("scene")) return "indexes";
  if (fromType.includes("method") || toType.includes("axis")) return "operationalizes";
  return "relates_to";
}

export function runExpertReview({ library, nodes, edges }) {
  const issues = [];
  if (!library.length) issues.push({ level: "critical", message: "知识库没有资料来源，无法进行源证据驱动的创作分析。" });
  const citedNodes = nodes.filter((node) => Array.isArray(node.evidence) && node.evidence.length > 0).length;
  if (nodes.length && citedNodes / nodes.length < 0.9) issues.push({ level: "major", message: "部分知识点缺少来源证据，后续需要强制引用锚点。" });
  const orphanNodes = nodes.filter((node) => !edges.some((edge) => edge.from === node.id || edge.to === node.id));
  if (orphanNodes.length > Math.max(2, nodes.length * 0.25)) issues.push({ level: "major", message: `孤立知识点偏多：${orphanNodes.length} 个节点没有知识关系。` });
  const hasScene = nodes.some((node) => node.type === "scene_type" || node.tags?.some((tag) => ["scene", "interrogation", "dinner"].includes(tag)));
  const hasArc = nodes.some((node) => node.type === "character_arc" || node.tags?.includes("arc"));
  const hasTechnique = nodes.some((node) => node.type === "technique");
  if (!hasScene) issues.push({ level: "minor", message: "缺少场景类型节点，编剧检索会偏抽象。" });
  if (!hasArc) issues.push({ level: "minor", message: "缺少人物弧线节点，诊断人物变化会较弱。" });
  if (!hasTechnique) issues.push({ level: "minor", message: "缺少技巧节点，无法很好承接编剧方法论资料。" });
  return {
    score: Math.max(0, 100 - issues.reduce((sum, issue) => sum + (issue.level === "critical" ? 35 : issue.level === "major" ? 15 : 6), 0)),
    issues,
  };
}
