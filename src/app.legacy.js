import { initialKnowledgeBase } from "../database/kb.js";
import { analyzeResource, uid as engineUid } from "./storyEngine.js";

const STORAGE_KEY = "story-kb-client-session-v2";
const persistenceState = {
  mode: window.storyKb?.saveDatabase ? "desktop" : "browser",
  label: window.storyKb?.saveDatabase ? "本机数据库" : "浏览器临时会话",
  path: window.storyKb?.databasePath || "当前浏览器 localStorage；启动本地数据库服务后写入 database/kb.json",
};

const CREATIVE_TAXONOMY = [
  { id: "plot_beats", label: "情节桥段", hint: "事件、桥段、相遇、误会、危机和可拍的戏剧动作", types: ["plot_beat_formula", "plot_device", "scene_type", "story_pattern"], keywords: ["桥段", "情节", "场景", "相遇", "误会", "反转", "危机", "追逐", "道具", "事件", "可拍"] },
  { id: "emotional_progression", label: "情感推进", hint: "暧昧、心动、信任、吃醋、告白、疗愈和关系阶段", types: ["emotional_progression"], keywords: ["情感", "暧昧", "升温", "心动", "表白", "关系", "信任", "吃醋", "陪伴", "治愈"] },
  { id: "conflict_obstacles", label: "冲突阻碍", hint: "误会、外部压力、价值观差异、分离、危机和对抗", types: ["conflict_formula"], keywords: ["冲突", "阻碍", "误会", "危机", "分手", "家庭", "前任", "距离", "压力", "对抗"] },
  { id: "character_design", label: "人物设定", hint: "人设、弧线、欲望、创伤、反差、关系功能和成长", types: ["character_template", "character_arc"], keywords: ["人物", "角色", "人设", "弧线", "性格", "创伤", "成长", "反差", "动机"] },
  { id: "scene_staging", label: "场景调度", hint: "镜头、动作、空间、物件、节奏和画面执行", types: ["scene_type"], keywords: ["镜头", "调度", "动作", "特写", "中景", "空间", "画面", "视觉"] },
  { id: "theme_meaning", label: "主题表达", hint: "主题论证、价值选择、意义结构和观众情感落点", types: ["technique", "craft_checklist"], keywords: ["主题", "意义", "价值", "论证", "选择", "表达", "命题"] },
  { id: "structure_method", label: "叙事结构", hint: "结构、节奏、转折点、伏笔回收、悬念和信息控制", types: ["case_structure", "research_method", "analysis_axis", "technique"], keywords: ["结构", "节奏", "转折", "伏笔", "回收", "信息", "悬念", "铺垫"] },
  { id: "workflow", label: "创作流程", hint: "指令解析、世界观、人物、情节推进和风格控制规则", types: ["workflow_rule", "knowledge_collection"], keywords: ["流程", "执行", "指令", "世界观", "设定", "推进", "规则", "方法"] },
  { id: "prompt_schemes", label: "提示词方案", hint: "可整体调用的提示词、执行逻辑、创作代理方案和工作流提示", types: ["prompt_scheme"], keywords: ["提示词", "方案", "执行逻辑", "prompt", "工作流", "代理", "创作模型"] },
  { id: "system_reviews", label: "系统检查", hint: "真实使用验收、专家审查、流程审查和普通用户反馈", types: ["expert_acceptance", "design_acceptance", "novice_acceptance", "acceptance_summary"], keywords: ["检查", "验收", "用户", "专家", "设计", "流程", "问题", "改进"] },
];

const INTENT_PRESETS = [
  { label: "两个人自然认识", query: "自然相遇 破冰 共同场景" },
  { label: "让关系暧昧升温", query: "暧昧 心动 情感递进 试探" },
  { label: "制造误会或冲突", query: "误会 冲突 阻碍 澄清" },
  { label: "设计人物反差", query: "人设 反差 外冷内热 隐藏属性" },
  { label: "找一个可拍的场景", query: "镜头化拆解 场景 动作 特写" },
  { label: "做治愈型情节", query: "治愈 陪伴 自我接纳 温暖" },
];

let state = loadState();
let persistTimer = null;

bootstrapDatabase();

function loadState() {
  const persisted = window.storyKb?.loadDatabase?.();
  const database = persisted?.library?.length ? persisted : initialKnowledgeBase;
  const isAuthoritativeStore = persistenceState.mode !== "browser";
  const base = normalizeState({
    activeView: "search",
    selectedNodeId: database.nodes[1]?.id || database.nodes[0]?.id || "",
    query: "",
    importOpen: false,
    importMode: "text",
    draftTitle: "",
    draftText: "",
    lastImportReport: null,
    relationDraft: { from: "", to: "", type: "relates_to" },
    library: database.library || [],
    nodes: database.nodes || [],
    edges: database.edges || [],
  });
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return base;
  try {
    const session = JSON.parse(raw);
    if (isAuthoritativeStore) {
      const { library: _l, nodes: _n, edges: _e, ...uiOnly } = session;
      return normalizeState({ ...base, ...uiOnly });
    }
    return normalizeState({ ...base, ...session });
  } catch {
    return base;
  }
}

function saveSession() {
  const session = {
    activeView: state.activeView,
    selectedNodeId: state.selectedNodeId,
    query: state.query,
    importMode: state.importMode,
    draftTitle: state.draftTitle,
    draftText: state.draftText,
    lastImportReport: state.lastImportReport,
    library: state.library,
    nodes: state.nodes,
    edges: state.edges,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  scheduleDatabaseSave();
}

async function bootstrapDatabase() {
  const apiDatabase = await loadApiDatabase();
  if (!apiDatabase) {
    render();
    return;
  }
  state = normalizeState({
    ...state,
    library: apiDatabase.library || [],
    nodes: apiDatabase.nodes || [],
    edges: apiDatabase.edges || [],
    selectedNodeId: state.selectedNodeId || apiDatabase.nodes?.[0]?.id || "",
  });
  render();
}

async function loadApiDatabase() {
  if (window.storyKb?.loadDatabase) return null;
  if (!location.protocol.startsWith("http")) return null;
  try {
    const response = await fetch("./api/kb", { cache: "no-store" });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return null;
    const payload = await response.json();
    if (!payload?.ok || !payload.database) return null;
    persistenceState.mode = "api";
    persistenceState.label = "本机数据库";
    persistenceState.path = payload.path || "database/kb.json";
    return payload.database;
  } catch {
    return null;
  }
}

function scheduleDatabaseSave() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistDatabase(), 180);
}

async function persistDatabase() {
  const database = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    library: state.library,
    nodes: state.nodes,
    edges: state.edges,
  };
  const saved = window.storyKb?.saveDatabase?.(database);
  if (saved?.ok && state.lastImportReport) {
    persistenceState.mode = "desktop";
    persistenceState.label = "本机数据库";
    persistenceState.path = saved.path || window.storyKb?.databasePath || "database/kb.json";
    state.lastImportReport.saveMode = "本机数据库";
    state.lastImportReport.savePath = persistenceState.path;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"), lastImportReport: state.lastImportReport }));
    return saved;
  }
  if (!window.storyKb?.saveDatabase && location.protocol.startsWith("http")) {
    try {
      const response = await fetch("./api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(database),
      });
      const result = await response.json();
      if (response.ok && result?.ok) {
        persistenceState.mode = "api";
        persistenceState.label = "本机数据库";
        persistenceState.path = result.path || "database/kb.json";
        if (state.lastImportReport) {
          state.lastImportReport.saveMode = "本机数据库";
          state.lastImportReport.savePath = persistenceState.path;
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"), lastImportReport: state.lastImportReport }));
          render();
        }
        return result;
      }
    } catch {
      return { ok: false };
    }
  }
  return { ok: false };
}

function setState(patch) {
  state = normalizeState({ ...state, ...patch });
  saveSession();
  render();
}

function normalizeState(next) {
  next.library = (next.library || []).map((source) => ({
    wordCount: source.wordCount || countWords(`${source.title || ""} ${source.summary || ""}`),
    parser: source.parser || "unknown",
    ...source,
  }));
  next.nodes = (next.nodes || []).map(enrichNode);
  next.edges = next.edges || [];
  return next;
}

function enrichNode(node) {
  const creativeCategory = node.creativeCategory || inferCreativeCategory(node);
  return {
    professionalType: professionalTypeLabel(node),
    creativeCategory,
    creativeCategoryLabel: creativeCategoryLabel(creativeCategory),
    searchText: buildSearchText(node, creativeCategory),
    ...node,
  };
}

function countWords(text = "") {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.replace(/[\u4e00-\u9fff]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + latin;
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function getNode(id) {
  return state.nodes.find((node) => node.id === id);
}

function getSource(id) {
  return state.library.find((source) => source.id === id);
}

function sourceNodes(sourceId) {
  return state.nodes.filter((node) => node.evidence?.includes(sourceId));
}

function sourceEdges(sourceId) {
  const ids = new Set(sourceNodes(sourceId).map((node) => node.id));
  return state.edges.filter((edge) => ids.has(edge.from) || ids.has(edge.to));
}

function totalWordCount() {
  return state.library.reduce((sum, source) => sum + (Number(source.wordCount) || 0), 0);
}

function sourceProfessionalLabel(source = {}) {
  const nodes = sourceNodes(source.id);
  if (nodes.some((node) => node.type === "plot_beat_formula")) return "聚合情节库";
  if (nodes.some((node) => node.type === "workflow_rule")) return "创作流程文档";
  if (source.type === "screenplay") return "剧本案例";
  if (source.type === "play") return "戏剧案例";
  if (source.type === "craft-theory" || source.type === "course") return "编剧方法";
  if (source.type === "research") return "叙事研究";
  if (source.type === "source_locator") return "资料索引";
  return "创作资料";
}

function professionalTypeLabel(node = {}) {
  if (node.category === "场景构建") return "桥段公式";
  if (node.category === "情感递进") return "关系推进公式";
  if (node.category === "冲突发展") return "冲突阻碍公式";
  if (node.category === "人物塑造") return "人物设定公式";
  const labels = {
    story_pattern: "故事机制",
    technique: "叙事技巧",
    character_arc: "人物弧线",
    plot_device: "情节装置",
    scene_type: "场景桥段",
    case_study: "剧本案例",
    classic_case: "经典案例",
    source_summary: "来源摘要",
    failure_mode: "适用边界",
    craft_checklist: "诊断清单",
    analysis_axis: "分析维度",
    research_method: "研究方法",
    source_registry: "来源登记",
    knowledge_collection: "知识集合",
    plot_beat_formula: "桥段公式",
    emotional_progression: "关系推进公式",
    conflict_formula: "冲突阻碍公式",
    character_template: "人物设定公式",
    workflow_rule: "创作流程规则",
    prompt_scheme: "提示词方案",
    expert_acceptance: "专家验收",
    design_acceptance: "设计验收",
    novice_acceptance: "普通用户验收",
    acceptance_summary: "验收汇总",
  };
  return labels[node.type] || "知识点";
}

function inferCreativeCategory(node = {}) {
  if (node.category === "系统检查" || ["expert_acceptance", "design_acceptance", "novice_acceptance", "acceptance_summary"].includes(node.type)) {
    return "system_reviews";
  }
  if (node.type === "prompt_scheme" || node.category === "提示词方案") return "prompt_schemes";
  const text = `${node.type || ""} ${node.category || ""} ${node.theme || ""} ${node.label || ""} ${node.summary || ""} ${(node.tags || []).join(" ")}`.toLowerCase();
  const byKeyword = CREATIVE_TAXONOMY.find((group) => group.keywords.some((keyword) => text.includes(keyword.toLowerCase())));
  const byType = CREATIVE_TAXONOMY.find((group) => group.types.includes(node.type));
  return (byKeyword || byType || CREATIVE_TAXONOMY[0]).id;
}

function creativeCategoryLabel(id = "") {
  return CREATIVE_TAXONOMY.find((item) => item.id === id)?.label || "综合知识";
}

function buildSearchText(node = {}, category = "") {
  const fieldText = node.fields ? Object.entries(node.fields).map(([key, value]) => `${key} ${value}`).join(" ") : "";
  const taxonomy = CREATIVE_TAXONOMY.find((item) => item.id === category);
  return [
    node.label,
    node.summary,
    node.type,
    node.category,
    node.theme,
    node.formulaId,
    node.template,
    professionalTypeLabel(node),
    taxonomy?.label,
    taxonomy?.hint,
    taxonomy?.keywords.join(" "),
    (node.tags || []).join(" "),
    fieldText,
    node.originalText,
  ].filter(Boolean).join(" ").toLowerCase();
}

function expandedQueryTokens(query = "") {
  const raw = query.trim().toLowerCase();
  if (!raw) return [];
  const direct = raw.split(/[\s,，。;；、]+/).filter(Boolean);
  const expansions = [];
  for (const group of CREATIVE_TAXONOMY) {
    if ([group.label, group.hint, ...group.keywords].some((word) => raw.includes(word.toLowerCase()))) expansions.push(group.id, group.label, ...group.keywords);
  }
  const intentMap = [
    ["认识", ["相遇", "破冰", "共同场景", "社交", "偶遇"]],
    ["升温", ["暧昧", "心动", "情感递进", "试探", "关怀"]],
    ["误会", ["冲突", "澄清", "信息偏差", "社交误操作"]],
    ["治愈", ["陪伴", "自我接纳", "温暖", "疗愈", "创伤"]],
    ["反差", ["人设", "隐藏属性", "外冷内热", "人物塑造"]],
    ["可拍", ["镜头", "场景", "动作", "画面", "调度"]],
  ];
  for (const [needle, words] of intentMap) {
    if (raw.includes(needle)) expansions.push(...words);
  }
  return [...new Set([...direct, ...expansions.map((item) => String(item).toLowerCase())])];
}

function searchResults() {
  const tokens = expandedQueryTokens(state.query);
  const all = state.nodes.map((item) => ({ ...item, kind: "knowledge", label: item.label }));
  if (!tokens.length) return all.slice(0, 28);
  return all
    .map((item) => {
      const text = item.searchText || "";
      const score = tokens.reduce((sum, token) => {
        if (String(item.label || "").toLowerCase().includes(token)) return sum + 8;
        if (String(item.category || "").toLowerCase().includes(token) || String(item.theme || "").toLowerCase().includes(token)) return sum + 5;
        if ((item.tags || []).some((tag) => String(tag).toLowerCase().includes(token))) return sum + 4;
        return sum + (text.includes(token) ? 1 : 0);
      }, 0);
      return { ...item, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
}

function categoryCounts() {
  return CREATIVE_TAXONOMY.map((group) => ({
    ...group,
    count: state.nodes.filter((node) => node.creativeCategory === group.id).length,
  }));
}

function groupedNodes() {
  return state.nodes.reduce((groups, node) => {
    const key = node.creativeCategory || inferCreativeCategory(node);
    groups[key] ||= [];
    groups[key].push(node);
    return groups;
  }, {});
}

function importTextResource() {
  const title = state.draftTitle.trim() || "未命名资料";
  const body = state.draftText.trim();
  if (!body) return;
  const { source, nodes, edges } = analyzeResource({ title, body });
  state.library.unshift(source);
  state.nodes.push(...nodes);
  state.edges.push(...edges);
  setState({
    importOpen: false,
    draftTitle: "",
    draftText: "",
    lastImportReport: buildImportReport(source, nodes, edges),
    selectedNodeId: nodes[0]?.id,
    activeView: "library",
  });
}

async function importFiles(files) {
  const reports = [];
  for (const file of files) {
    const text = await readFileAsTextBestEffort(file);
    const image = file.type.startsWith("image/") ? await readFileAsDataUrl(file) : null;
    const analysis = analyzeResource({ title: file.name, body: text, fileName: file.name, mime: file.type || "unknown", image });
    state.library.unshift({ ...analysis.source, size: file.size });
    state.nodes.push(...analysis.nodes);
    state.edges.push(...analysis.edges);
    state.selectedNodeId = analysis.nodes[0]?.id || state.selectedNodeId;
    reports.push(buildImportReport(analysis.source, analysis.nodes, analysis.edges));
  }
  setState({ activeView: "library", importOpen: false, lastImportReport: mergeImportReports(reports) });
}

function buildImportReport(source, nodes, edges) {
  return {
    title: source.title,
    sourceCount: 1,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    wordCount: source.wordCount || 0,
    saveMode: persistenceState.label,
    savePath: persistenceState.path,
  };
}

function mergeImportReports(reports) {
  const valid = reports.filter(Boolean);
  if (!valid.length) return null;
  return {
    title: valid.length === 1 ? valid[0].title : `${valid.length} 个文件`,
    sourceCount: valid.reduce((sum, item) => sum + item.sourceCount, 0),
    nodeCount: valid.reduce((sum, item) => sum + item.nodeCount, 0),
    edgeCount: valid.reduce((sum, item) => sum + item.edgeCount, 0),
    wordCount: valid.reduce((sum, item) => sum + item.wordCount, 0),
    saveMode: persistenceState.label,
    savePath: persistenceState.path,
  };
}

function readFileAsTextBestEffort(file) {
  return new Promise((resolve) => {
    if (file.type.startsWith("image/")) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function addRelation() {
  const { from, to, type } = state.relationDraft;
  if (!from || !to || from === to) return;
  state.edges.push({ id: engineUid("edge"), from, to, type });
  setState({ relationDraft: { from: "", to: "", type } });
}

function render() {
  document.getElementById("app").innerHTML = `
    <div class="shell">
      ${renderSidebar()}
      <main class="workspace">
        ${state.activeView === "search" ? renderSearchView() : ""}
        ${state.activeView === "library" ? renderLibraryView() : ""}
        ${state.activeView === "ingest" ? renderIngestView() : ""}
      </main>
      ${state.importOpen ? renderImportPanel() : ""}
    </div>
  `;
  bindEvents();
}

function renderSidebar() {
  const nav = [["search", "搜索"], ["library", "知识库"], ["ingest", "导入"]];
  return `
    <aside class="sidebar compactSidebar">
      <div class="brand"><div class="brandMark">SK</div><div><strong>Story KB</strong><span>单机知识库</span></div></div>
      <nav>${nav.map(([id, label]) => `<button class="navItem ${state.activeView === id ? "active" : ""}" data-view="${id}">${label}</button>`).join("")}</nav>
      <button class="importButton" data-action="open-import">添加资料</button>
      <div class="sideStats">
        <div><strong>${state.library.length}</strong><span>来源</span></div>
        <div><strong>${state.nodes.length}</strong><span>知识</span></div>
        <div><strong>${state.edges.length}</strong><span>关联</span></div>
      </div>
      <div class="persistenceBadge ${persistenceState.mode === "browser" ? "browser" : "desktop"}">
        <strong>${escapeHtml(persistenceState.label)}</strong>
        <span>${persistenceState.mode === "browser" ? "当前网页只能暂存到本浏览器；请用本地数据库服务或桌面客户端启动。" : `内容写入 ${escapeHtml(persistenceState.path)}，可随主程序搬走。`}</span>
      </div>
    </aside>
  `;
}

function renderSearchView() {
  const results = searchResults();
  const selected = getNode(state.selectedNodeId) || results[0] || state.nodes[0];
  return `
    <header class="workHeader">
      <div>
        <h1>创作知识搜索</h1>
        <p>输入模糊创作意图，系统会从桥段、情感推进、冲突、人物、场景和流程中匹配。</p>
      </div>
    </header>
    <section class="searchStrip">
      <div class="intentSearch">
        <input id="queryInput" value="${escapeHtml(state.query)}" placeholder="例如：两个人如何自然认识？如何让暧昧升温？怎样制造误会？" />
        <div class="intentPresets">${INTENT_PRESETS.map((item) => `<button data-query-preset="${escapeHtml(item.query)}">${escapeHtml(item.label)}</button>`).join("")}</div>
      </div>
      <div class="searchMetrics"><span>${state.nodes.length} 知识点</span><span>${totalWordCount()} 字/词</span></div>
    </section>
    <section class="categoryRail">
      ${categoryCounts().map((item) => `<button data-query-preset="${escapeHtml(item.label)}"><strong>${item.label}</strong><span>${item.count}</span><em>${item.hint}</em></button>`).join("")}
    </section>
    <section class="coreLayout">
      <div class="surface resultsPanel">
        <div class="panelHeader"><h2>结果</h2><span>${results.length}</span></div>
        <div class="resultList">${results.map(renderResultCard).join("") || `<div class="empty">暂无匹配结果。</div>`}</div>
      </div>
      <article class="surface articlePane">${renderKnowledgeArticle(selected)}</article>
      <aside class="surface relationPane">${renderRelations(selected)}</aside>
    </section>
  `;
}

function renderResultCard(item) {
  return `
    <button class="resultCard" data-select-node="${item.id}">
      <div class="resultMeta"><span class="pill">${escapeHtml(item.creativeCategoryLabel)}</span><span>${escapeHtml(item.professionalType)}</span>${item.score ? `<span>匹配 ${item.score}</span>` : ""}</div>
      <strong>${escapeHtml(item.label)}</strong>
      <p>${escapeHtml(item.summary || "")}</p>
      <div class="tagRow">${[item.theme, item.category, ...(item.tags || [])].filter(Boolean).slice(0, 5).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
    </button>
  `;
}

function renderKnowledgeArticle(node) {
  if (!node) return `<div class="empty">暂无知识点。</div>`;
  const fields = node.fields || {};
  const evidence = (node.evidence || []).map(getSource).filter(Boolean);
  return `
    <div class="articleHead">
      <div class="articleBadges">
        <span class="pill">${escapeHtml(node.creativeCategoryLabel)}</span>
        <span>${escapeHtml(node.professionalType)}</span>
        ${node.theme ? `<span>${escapeHtml(node.theme)}</span>` : ""}
        ${node.formulaId ? `<span>${escapeHtml(node.formulaId)}</span>` : ""}
      </div>
      <h2>${escapeHtml(node.label)}</h2>
      <p>${escapeHtml(node.summary || "")}</p>
    </div>
    <div class="articleGrid">
      ${renderArticleBlock("创作功能", fields["核心功能"] || fields["构成"] || node.summary, true)}
      ${renderArticleBlock("机制构成", fields["构成"])}
      ${renderArticleBlock("必备元素", fields["必备元素"])}
      ${renderArticleBlock("可用示例", fields["示例"] || fields["实例"])}
      ${renderArticleBlock("为什么有效", fields["解析"] || fields["应用实例与解析"])}
      ${renderArticleBlock("画面执行", fields["镜头化拆解"])}
      ${renderArticleBlock("变体方向", fields["创意变体"])}
      ${renderArticleBlock("要点", fields["要点"])}
      ${renderArticleBlock("方案定位", fields["方案定位"])}
      ${renderArticleBlock("使用方式", fields["使用方式"])}
      ${renderArticleBlock("原文方案", fields["原文方案"])}
      ${renderArticleBlock("使用身份", fields["使用身份"])}
      ${renderArticleBlock("操作任务", fields["操作任务"])}
      ${renderArticleBlock("实际操作记录", fields["实际操作记录"])}
      ${renderArticleBlock("发现问题", fields["发现问题"])}
      ${renderArticleBlock("改进要求", fields["改进要求"])}
      ${renderArticleBlock("验收结论", fields["验收结论"])}
      <section class="knowledgeBlock"><h3>来源</h3>${evidence.map((source) => `<button class="sourceCitation" data-select-source="${source.id}"><strong>${escapeHtml(source.title)}</strong><span>${sourceProfessionalLabel(source)} · ${source.wordCount || 0} 字/词 · ${sourceNodes(source.id).length} 知识点</span></button>`).join("") || `<p>暂无来源。</p>`}</section>
    </div>
  `;
}

function renderArticleBlock(title, body, lead = false) {
  if (!body) return "";
  return `<section class="knowledgeBlock ${lead ? "leadBlock" : ""}"><h3>${title}</h3><p>${escapeHtml(body)}</p></section>`;
}

function renderRelations(node) {
  if (!node) return `<div class="empty">未选择知识点。</div>`;
  const links = [
    ...state.edges.filter((edge) => edge.from === node.id).map((edge) => ({ edge, node: getNode(edge.to) })),
    ...state.edges.filter((edge) => edge.to === node.id).map((edge) => ({ edge, node: getNode(edge.from) })),
  ].filter((item) => item.node);
  return `
    <div class="panelHeader"><h2>关联</h2><span>${links.length}</span></div>
    <div class="quickLinkList">${links.slice(0, 24).map(({ edge, node: linked }) => `<button data-select-node="${linked.id}"><strong>${escapeHtml(linked.label)}</strong><span>${escapeHtml(edge.type)} · ${escapeHtml(linked.professionalType)}</span></button>`).join("") || `<div class="empty">暂无关联。</div>`}</div>
    <div class="relationEditor">
      <h3>连线</h3>
      <select id="edgeFrom">${renderNodeOptions(state.relationDraft.from || node.id)}</select>
      <select id="edgeTo">${renderNodeOptions(state.relationDraft.to)}</select>
      <select id="edgeType">${["relates_to", "supports", "contradicts", "enables", "reveals", "variant_of"].map((type) => `<option ${state.relationDraft.type === type ? "selected" : ""}>${type}</option>`).join("")}</select>
      <button class="primaryButton" data-action="add-edge">添加</button>
    </div>
  `;
}

function renderNodeOptions(selected) {
  return `<option value="">选择知识点</option>${state.nodes.map((node) => `<option value="${node.id}" ${selected === node.id ? "selected" : ""}>${escapeHtml(node.label)}</option>`).join("")}`;
}

function renderLibraryView() {
  const groups = groupedNodes();
  return `
    <header class="workHeader"><div><h1>知识库</h1><p>按创作专业分类浏览当前随客户端携带的知识。</p></div></header>
    ${renderImportReport()}
    <section class="libraryMetrics">
      <div><strong>${state.library.length}</strong><span>来源</span></div>
      <div><strong>${state.nodes.length}</strong><span>知识点</span></div>
      <div><strong>${state.edges.length}</strong><span>关联</span></div>
      <div><strong>${totalWordCount()}</strong><span>字/词</span></div>
    </section>
    <section class="libraryLayout">
      <aside class="surface knowledgeIndex">
        ${CREATIVE_TAXONOMY.map((group) => {
          const nodes = groups[group.id] || [];
          if (!nodes.length) return "";
          return `<div class="nodeGroup"><h3>${group.label}<span>${nodes.length}</span></h3><p>${group.hint}</p>${nodes.slice(0, 120).map((node) => `<button data-select-node="${node.id}"><strong>${escapeHtml(node.label)}</strong><span>${escapeHtml(node.professionalType)}${node.theme ? ` · ${escapeHtml(node.theme)}` : ""}</span></button>`).join("")}</div>`;
        }).join("")}
      </aside>
      <article class="surface articlePane">${renderKnowledgeArticle(getNode(state.selectedNodeId) || state.nodes[0])}</article>
    </section>
  `;
}

function renderIngestView() {
  return `
    <header class="workHeader"><div><h1>导入</h1><p>上传文件或粘贴内容，系统会先拆解为知识点并加入当前客户端知识库。</p></div><button class="primaryButton" data-action="open-import">添加资料</button></header>
    ${renderImportReport()}
    <section class="surface sourcePanel">
      <div class="panelHeader"><h2>来源</h2><span>${state.library.length}</span></div>
      <div class="sourceDenseTable">${state.library.map(renderSourceRow).join("")}</div>
    </section>
  `;
}

function renderImportReport() {
  const report = state.lastImportReport;
  if (!report) return "";
  return `
    <section class="surface importReport">
      <div>
        <strong>最近入库：${escapeHtml(report.title)}</strong>
        <span>${report.sourceCount} 来源 / ${report.nodeCount} 知识点 / ${report.edgeCount} 关联 / ${report.wordCount} 字词</span>
      </div>
      <div>
        <strong>${escapeHtml(report.saveMode)}</strong>
        <span>${escapeHtml(report.savePath)}</span>
      </div>
    </section>
  `;
}

function renderSourceRow(source) {
  const nodes = sourceNodes(source.id);
  const edges = sourceEdges(source.id);
  return `
    <button class="sourceDenseRow" data-select-source="${source.id}">
      <span class="sourceMain"><strong>${escapeHtml(source.title)}</strong><em>${escapeHtml(source.summary || "")}</em></span>
      <span>${sourceProfessionalLabel(source)}</span>
      <span>${source.wordCount || 0} 字/词</span>
      <span>${nodes.length} 知识点</span>
      <span>${edges.length} 关联</span>
    </button>
  `;
}

function renderImportPanel() {
  return `
    <div class="overlay">
      <section class="importPanel">
        <div class="panelHeader"><h2>添加资料</h2><button class="closeButton" data-action="close-import">关闭</button></div>
        <div class="modeTabs">
          <button class="${state.importMode === "text" ? "active" : ""}" data-import-mode="text">粘贴文字</button>
          <button class="${state.importMode === "file" ? "active" : ""}" data-import-mode="file">上传文件</button>
        </div>
        ${state.importMode === "text" ? `
          <label>标题</label>
          <input id="draftTitle" value="${escapeHtml(state.draftTitle)}" />
          <label>内容</label>
          <textarea id="draftText">${escapeHtml(state.draftText)}</textarea>
          <button class="primaryButton" data-action="import-text">分析并入库</button>
        ` : `
          <div class="dropZone" id="dropZone">
            <input id="fileInput" type="file" multiple accept=".txt,.md,.csv,.json,.srt,.vtt,.html,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*" />
            <strong>选择或拖入文件</strong>
            <p>当前静态客户端会先解析可读文本；完整文件持久化将在桌面壳接入后写入 database。</p>
          </div>
        `}
      </section>
    </div>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setState({ activeView: button.dataset.view })));
  document.querySelectorAll("[data-action='open-import']").forEach((button) => button.addEventListener("click", () => setState({ importOpen: true })));
  document.querySelector("[data-action='close-import']")?.addEventListener("click", () => setState({ importOpen: false }));
  document.querySelectorAll("[data-import-mode]").forEach((button) => button.addEventListener("click", () => setState({ importMode: button.dataset.importMode })));
  document.getElementById("queryInput")?.addEventListener("input", (event) => setState({ query: event.target.value }));
  document.querySelectorAll("[data-query-preset]").forEach((button) => button.addEventListener("click", () => setState({ query: button.dataset.queryPreset || "", activeView: "search" })));
  document.querySelectorAll("[data-select-node]").forEach((item) => item.addEventListener("click", () => setState({ selectedNodeId: item.dataset.selectNode, activeView: state.activeView === "ingest" ? "library" : state.activeView })));
  document.querySelectorAll("[data-select-source]").forEach((item) => item.addEventListener("click", () => {
    const node = state.nodes.find((entry) => entry.evidence?.includes(item.dataset.selectSource));
    setState({ selectedNodeId: node?.id || state.selectedNodeId, activeView: "library" });
  }));
  document.getElementById("draftTitle")?.addEventListener("input", (event) => {
    state.draftTitle = event.target.value;
    saveSession();
  });
  document.getElementById("draftText")?.addEventListener("input", (event) => {
    state.draftText = event.target.value;
    saveSession();
  });
  document.querySelector("[data-action='import-text']")?.addEventListener("click", importTextResource);
  document.getElementById("fileInput")?.addEventListener("change", (event) => importFiles([...event.target.files]));
  const dropZone = document.getElementById("dropZone");
  dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
  dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
  dropZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
    importFiles([...event.dataTransfer.files]);
  });
  document.getElementById("edgeFrom")?.addEventListener("change", (event) => {
    state.relationDraft.from = event.target.value;
    saveSession();
  });
  document.getElementById("edgeTo")?.addEventListener("change", (event) => {
    state.relationDraft.to = event.target.value;
    saveSession();
  });
  document.getElementById("edgeType")?.addEventListener("change", (event) => {
    state.relationDraft.type = event.target.value;
    saveSession();
  });
  document.querySelector("[data-action='add-edge']")?.addEventListener("click", addRelation);
}

render();
