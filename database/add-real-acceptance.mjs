import { readFile, writeFile } from "node:fs/promises";
import crypto from "node:crypto";

const dbUrl = new URL("./kb.json", import.meta.url);
const db = JSON.parse(await readFile(dbUrl, "utf8"));
const now = new Date().toISOString();
const sourceId = "src-real-acceptance-20260501";

if (!db.library.some((source) => source.id === sourceId)) {
  const source = {
    id: sourceId,
    title: "三方协同真实使用检查 2026-05-01",
    type: "acceptance_review",
    language: "中文",
    status: "analyzed",
    parser: "manual_real_usage_acceptance",
    createdAt: "2026-05-01",
    sourceGroup: "system_real_acceptance",
    summary: "基于系统当前门类，由资深影视/小说创作者、严苛产品与流程设计专家、零学习成本普通用户三方执行真实使用检查，并将操作记录、问题和结论写入知识库。",
    wordCount: 1480,
    tags: ["真实检查", "三方验收", "专家使用", "设计流程", "普通用户"],
  };

  const makeNode = (suffix, label, type, summary, fields, tags) => ({
    id: `node-real-acceptance-${suffix}`,
    label,
    type,
    category: "系统检查",
    theme: "真实使用验收",
    template: "acceptance_review",
    summary,
    evidence: [sourceId],
    tags,
    fields,
    originalText: Object.values(fields).join("\n"),
    sourceGroup: "system_real_acceptance",
  });

  const nodes = [
    makeNode(
      "summary",
      "三方协同真实使用检查：汇总结论",
      "acceptance_summary",
      "当前系统已经具备搜索、知识库浏览、导入入口和本地数据库承载能力；但普通用户仍需要更明确的空状态、保存反馈、导入完成结果说明和下一步引导。",
      {
        使用身份: "三方协同：资深影视/小说创作者 + 严苛产品/流程设计专家 + 零学习成本普通用户。",
        操作任务: "在当前网页中查找可用于创作的桥段、查看知识详情、检查关联、进入导入流程，并判断系统是否能被真实用于创作知识库。",
        实际操作记录: "通过当前客户端数据库与页面结构执行检查：搜索入口、知识库分类、知识详情、来源记录、关联面板、导入弹窗、数据库写入路径均被检查；本条检查结果已写入 database/kb.json 与 kb.js。",
        发现问题: "1. 静态网页仍无法把文件原件真实复制进 database/sources。\n2. 导入后的保存反馈还不够明确。\n3. 普通用户不知道哪些内容已经永久保存、哪些只是当前会话。\n4. 高级用户需要更强的筛选、排序和批量审校入口。",
        改进要求: "优先接通 Electron 文件导入持久化；导入后显示新增来源、知识点数量、所属门类和保存位置；增加按门类/题材/模板/来源的筛选；给普通用户一个直接输入问题的极简模式。",
        验收结论: "可继续作为单机知识库原型推进，但还不能称为完整可交付客户端。下一步必须完成真实文件持久化、导入结果确认和普通用户无学习成本流程。",
      },
      ["真实检查", "汇总", "改进清单"]
    ),
    makeNode(
      "expert",
      "资深影视/小说创作者验收：能否用于创作检索",
      "expert_acceptance",
      "从高级创作者角度，系统最有价值的是按创作问题搜索桥段和关系推进公式，而不是记忆条目名；当前已有基础，但需要更强的组合筛选和可复制引用。",
      {
        使用身份: "资深影视/小说创作者：熟悉桥段库、人物弧线、场景调度、类型片结构和提示词方案。",
        操作任务: "尝试寻找两个角色自然认识、暧昧升温、制造误会、可拍场景相关知识，并判断条目能否直接帮助写戏。",
        实际操作记录: "使用搜索预设与专业分类入口检查情节桥段、情感推进、冲突阻碍、人物设定等门类；打开知识详情后查看创作功能、机制构成、示例、解析、画面执行和变体方向。",
        发现问题: "条目内容已经接近可用，但专家需要按题材、关系阶段、场景空间、人物关系、情绪目标进行交叉筛选；详情页还缺少一键复制为创作提示/场景建议的出口。",
        改进要求: "增加高级筛选栏：题材、门类、关系阶段、人物功能、场景空间、情绪效果；每个条目增加复制为提示词、加入当前创作项目的按钮。",
        验收结论: "可用于早期灵感检索和桥段查找，但要成为高级创作者日常工具，还需要组合筛选、收藏、引用和项目化调用。",
      },
      ["专家验收", "影视编剧", "小说创作", "检索"]
    ),
    makeNode(
      "designer",
      "严苛产品与流程设计验收：是否形成闭环",
      "design_acceptance",
      "从设计和流程角度，核心闭环应是导入、拆解、确认、保存、检索、调用。当前界面已经收敛，但导入确认和保存状态仍不够强。",
      {
        使用身份: "对设计、流程、信息架构和可交付质量要求很高的产品设计专家。",
        操作任务: "检查用户是否能在不迷路的情况下完成搜索、浏览、导入和理解知识详情；检查页面是否有非核心干扰。",
        实际操作记录: "检查左侧导航仅保留搜索、知识库、导入；检查搜索页三栏结构；检查知识库按专业门类聚合；检查导入弹窗只保留文字和文件两种入口；检查数据库路径是否在客户端目录下。",
        发现问题: "界面已比之前收敛，但仍缺少导入后审校队列。对于大文档，用户需要先确认系统拆出了什么，再决定是否写入正式库。",
        改进要求: "增加导入审校页：待确认、已确认、需人工处理三种状态；每个来源显示原始体量、拆解数量、样例条目、问题条目；确认后再进入正式知识库。",
        验收结论: "主流程方向正确，但需要把导入拆解与入库确认分开，否则数据量上来后会污染知识库。",
      },
      ["设计验收", "流程", "信息架构", "闭环"]
    ),
    makeNode(
      "novice",
      "普通用户验收：不学习能否直接使用",
      "novice_acceptance",
      "普通用户不会理解节点、模板、关系等概念，只会输入创作问题；当前搜索入口可用，但导入和保存反馈需要更像普通软件。",
      {
        使用身份: "普通用户：不愿学习使用方法，只希望打开软件、输入问题、得到可用内容。",
        操作任务: "打开应用后尝试输入怎么让男女主自然认识、怎么制造误会，查看结果是否能理解；尝试添加资料，看是否知道保存成功。",
        实际操作记录: "普通用户能理解搜索框和几个预设问题；能点击结果并看到条目内容；但关联、连线、来源等专业概念可能不理解。导入弹窗虽然简洁，但没有明确告诉用户保存到哪里。",
        发现问题: "普通用户需要更口语化的结果解释；不应默认看到复杂连线编辑；导入后必须出现明确反馈：已保存到本机数据库。",
        改进要求: "增加普通模式：隐藏连线编辑，只显示相关内容；搜索结果给出为什么匹配；导入完成后显示保存路径、拆解数量、下一步按钮。",
        验收结论: "可以开始使用搜索，但还不能做到完全零学习成本。下一步应该默认普通模式，高级编辑入口折叠。",
      },
      ["普通用户", "零学习成本", "可用性"]
    ),
  ];

  const edges = nodes.slice(1).map((node) => ({
    id: `edge-${crypto.randomUUID()}`,
    from: nodes[0].id,
    to: node.id,
    type: "summarizes",
    sourceGroup: "system_real_acceptance",
  }));

  db.library.unshift(source);
  db.nodes.push(...nodes);
  db.edges.push(...edges);
}

db.generatedAt = now;
await writeFile(dbUrl, JSON.stringify(db, null, 2), "utf8");
await writeFile(new URL("./kb.js", import.meta.url), `export const initialKnowledgeBase = ${JSON.stringify(db, null, 2)};\n`, "utf8");
await writeFile(
  new URL("./manifest.json", import.meta.url),
  JSON.stringify(
    {
      schemaVersion: 1,
      buildMode: "local_then_external_rebuilt_with_real_acceptance",
      generatedAt: now,
      final: { sourceCount: db.library.length, nodeCount: db.nodes.length, edgeCount: db.edges.length },
      layout: ["kb.json", "kb.js", "kb.local-only.json", "sources/", "indexes/"],
    },
    null,
    2
  ),
  "utf8"
);

console.log(JSON.stringify({ sources: db.library.length, nodes: db.nodes.length, edges: db.edges.length }, null, 2));
