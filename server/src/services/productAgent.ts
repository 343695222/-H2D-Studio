import { StateGraph, Annotation, MemorySaver, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { buildProjectContext, getPages, getPageHierarchyTree } from './storage.js';
import { getKnowledgeBase, toContextString } from './knowledgeBase.js';
import { getDesignKnowledgeBase, toDesignKnowledgeContextString } from './designKnowledgeBase.js';
import type { PageHierarchyNode } from '../types.js';

// ========== 类型定义 ==========

export type AgentStage =
  | 'discovery'
  | 'clarifying'
  | 'requirement'
  | 'prd'
  | 'designPrinciples'
  | 'wireframe'
  | 'hifi'
  | 'codeExport'
  | 'done';

// LangGraph State 定义
const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  stage: Annotation<AgentStage>({
    reducer: (_prev, next) => next,
    default: () => 'discovery' as AgentStage,
  }),
  projectId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  rawIdea: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  projectContext: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  requirementDoc: Annotation<string>({
    reducer: (_prev, next) => next || _prev,
    default: () => '',
  }),
  prdDoc: Annotation<string>({
    reducer: (_prev, next) => next || _prev,
    default: () => '',
  }),
  clarifyCount: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  shouldAdvance: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  // 新增：知识库上下文
  knowledgeContext: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  // 新增：设计知识库上下文
  designKnowledgeContext: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  // 新增：页面层级上下文
  pageHierarchyContext: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  // 新增：设计原则文档
  designPrinciplesDoc: Annotation<string>({
    reducer: (_prev, next) => next || _prev,
    default: () => '',
  }),
  // 新增：线框 CaptureTree JSON
  wireframeTree: Annotation<unknown>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  // 新增：高保真 CaptureTree JSON
  hifiTree: Annotation<unknown>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  // 新增：生成的代码
  generatedCode: Annotation<string>({
    reducer: (_prev, next) => next || _prev,
    default: () => '',
  }),
  // 新增：阶段历史记录（用于回退功能）
  stageHistory: Annotation<AgentStage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

// ========== LLM 初始化 ==========

function createLLM() {
  // 读取环境变量（与现有 AIService 保持一致）
  const apiKey = process.env.AI_API_KEY || '';
  const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.AI_MODEL || 'gpt-4o';
  
  return new ChatOpenAI({
    modelName: model,
    apiKey: apiKey,
    openAIApiKey: apiKey,
    configuration: {
      baseURL: baseUrl,
    },
    // DeepSeek R1 不支持 temperature
    ...(model.includes('deepseek-reasoner') || model.includes('deepseek-r1') ? {} : { temperature: 0.7 }),
  });
}

// ========== System Prompts ==========

const DISCOVERY_PROMPT = `你是一位资深产品顾问。用户将向你描述一个产品想法或功能需求。

你的任务是：
1. 用1-2句话确认你理解了用户的想法
2. 提出3-5个关键问题来帮助细化需求，问题应覆盖：
   - 目标用户是谁？使用场景是什么？
   - 要解决什么核心痛点？
   - 期望的交互方式和用户体验是怎样的？
   - 成功的衡量标准是什么？
   - 与现有功能/页面的关系是什么？

你的风格：
- 专业但友好
- 会适当挑战不清晰的想法（不是people pleaser）
- 简洁有力，不说废话
- 用编号列出问题`;

const CLARIFY_PROMPT = `你是一位资深产品顾问，正在与产品经理澄清需求。

你已经提出了初始问题，用户正在回答。你的任务是：
1. 确认你理解了用户的回答
2. 如果还有不清晰的地方，继续追问（每次最多2-3个问题）
3. 如果核心问题都已澄清，在回复末尾加上标记 [READY_FOR_REQUIREMENT]

判断是否澄清完毕的标准：
- 目标用户和使用场景明确
- 核心功能点清晰
- 交互方式有基本共识
- 范围边界大致确定

你的风格：
- 不过度追问细节（产品设计是迭代的）
- 关注核心问题，忽略次要细节
- 当信息足够生成需求文档时，果断推进`;

const REQUIREMENT_PROMPT = `你是一位需求分析师。基于前面的对话和项目上下文，生成结构化的需求规格。

项目上下文：
{projectContext}

请输出结构化需求，包含：
1. **功能概述**：一段话描述核心功能
2. **目标用户**：谁在什么场景下使用
3. **功能需求列表**：编号的具体功能点
4. **交互需求**：用户操作流程
5. **涉及页面**：需要新增或修改哪些页面
6. **设计约束**：基于项目现有风格的约束（参考设计规范）
7. **范围边界**：包含什么/不包含什么

在回复末尾加上标记 [REQUIREMENT_DONE]`;

const PRD_PROMPT = `你是一位产品文档撰写专家。基于前面的需求分析和项目上下文，撰写一份完整的PRD文档。

项目上下文：
{projectContext}

请严格按以下模板输出 Markdown 格式的 PRD：

# {功能名称} 产品需求文档

## 1. 问题陈述
（一段话，描述当前痛点，引用项目中已有页面的现状）

## 2. 目标用户
（谁会使用，使用场景，用户画像）

## 3. 功能描述
### 3.1 核心功能
（编号列出每个功能点，包含详细描述）

### 3.2 交互流程
（分步骤描述用户操作流程，可用序号或流程图文字描述）

### 3.3 页面变更清单
| 页面 | 变更类型 | 具体修改 |
|------|---------|---------|
（列出每个需要变更的页面）

## 4. 设计约束
（基于项目知识库提取的风格约束：色彩、字体、间距、组件风格等）

## 5. 成功指标
| 指标 | 当前值 | 目标值 | 衡量方式 |
|------|--------|--------|---------|

## 6. 范围边界
### 包含
### 不包含

## 7. 开放问题
（列出需要进一步讨论的问题）

在回复末尾加上标记 [PRD_DONE]`;

// ========== 新增 Prompt ==========

const DESIGN_PRINCIPLES_PROMPT = `你是一位设计系统专家。基于PRD文档和项目知识库中的设计规范，提取设计原则。

项目知识库：
{knowledgeContext}

请输出设计原则，包含：
1. **视觉风格**：基于知识库的色彩、字体、间距规范
2. **组件选择**：应使用哪些组件模式（卡片、表单、表格等）
3. **布局策略**：推荐使用哪种布局模式
4. **交互规范**：按钮样式、弹窗行为、加载状态等
5. **响应式策略**：如何适配不同屏幕尺寸

在回复末尾加上标记 [DESIGN_PRINCIPLES_DONE]`;

const WIREFRAME_PROMPT = `你是一位线框设计师。基于PRD中的页面变更清单和设计原则，为每个新页面生成线框结构。

设计原则：
{designPrinciples}

请为每个页面生成一个 CaptureTree 线框 JSON。线框要求：
- 使用灰色占位色 #e0e0e0，文字用 #999
- 每个占位块标注语义角色（如 "搜索栏"、"表格"、"分页"）
- 结构符合 CaptureTree 格式：{ root: { nodeType:1, tag:"div", styles:{}, rect:{x,y,width,height,cssWidth,cssHeight}, childNodes:[] } }
- 布局使用 flex/grid，参考知识库中的布局模式

输出格式：对每个页面，先简要描述线框结构，然后输出 JSON 块：
\`\`\`json
{ "root": { ... }, "documentTitle": "...", "documentRect": {...}, "viewportRect": {...}, "devicePixelRatio": 1 }
\`\`\`

在回复末尾加上标记 [WIREFRAME_DONE]`;

const HIFI_PROMPT = `你是一位高保真设计师。基于线框结构和知识库中的设计规范，将线框升级为高保真设计。

知识库设计规范：
{knowledgeContext}

设计原则：
{designPrinciples}

请将线框中的灰色占位替换为真实样式：
- 应用知识库中的颜色、字体、间距
- 每个元素匹配到合适的组件模式
- 生成真实的文案内容（非 lorem ipsum）
- 保持 CaptureTree 格式不变

输出完整的 CaptureTree JSON：
\`\`\`json
{ "root": { ... }, ... }
\`\`\`

在回复末尾加上标记 [HIFI_DONE]`;

const CODE_EXPORT_PROMPT = `你是一位前端开发专家。基于高保真设计的 CaptureTree，生成语义化的 React 组件代码。

要求：
1. 识别组件边界，将子树提取为独立组件
2. 使用语义化的组件名（如 Card、InfoRow、ActionLink）
3. 使用 TypeScript + 函数式组件
4. 样式使用 CSS Modules 或 inline styles
5. 输出可直接使用的代码

请输出：
1. 主组件文件（默认导出）
2. 如有子组件，分别输出

在回复末尾加上标记 [CODE_EXPORT_DONE]`;

// ========== Node 函数 ==========

async function discoveryNode(state: typeof AgentStateAnnotation.State) {
  const llm = createLLM();
  let prompt = DISCOVERY_PROMPT;
  if (state.pageHierarchyContext) {
    prompt += `\n\n# 页面层级结构\n${state.pageHierarchyContext}`;
  }
  if (state.knowledgeContext) {
    prompt += `\n\n# 组件模式\n${state.knowledgeContext}`;
  }
  const messages = [
    new SystemMessage(prompt),
    ...state.messages,
  ];
  const response = await llm.invoke(messages);
  return {
    messages: [response],
    stage: 'clarifying' as AgentStage,
    shouldAdvance: false,
  };
}

async function clarifyNode(state: typeof AgentStateAnnotation.State) {
  const llm = createLLM();
  let prompt = CLARIFY_PROMPT;
  if (state.knowledgeContext) {
    prompt += `\n\n# 项目知识库\n${state.knowledgeContext}`;
  }
  const messages = [
    new SystemMessage(prompt),
    ...state.messages,
  ];
  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : '';
  const isReady = content.includes('[READY_FOR_REQUIREMENT]');
  
  return {
    messages: [new AIMessage(content.replace('[READY_FOR_REQUIREMENT]', '').trim())],
    stage: (isReady ? 'requirement' : 'clarifying') as AgentStage,
    clarifyCount: state.clarifyCount + 1,
    shouldAdvance: isReady,
  };
}

async function requirementNode(state: typeof AgentStateAnnotation.State) {
  const llm = createLLM();
  let promptWithContext = REQUIREMENT_PROMPT.replace('{projectContext}', state.projectContext);
  if (state.pageHierarchyContext) {
    promptWithContext += `\n\n# 页面层级结构\n${state.pageHierarchyContext}`;
  }
  if (state.knowledgeContext) {
    promptWithContext += `\n\n# 组件模式\n${state.knowledgeContext}`;
  }
  const messages = [
    new SystemMessage(promptWithContext),
    ...state.messages,
  ];
  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : '';
  
  return {
    messages: [new AIMessage(content.replace('[REQUIREMENT_DONE]', '').trim())],
    stage: 'prd' as AgentStage,
    requirementDoc: content,
    shouldAdvance: true,
  };
}

async function prdNode(state: typeof AgentStateAnnotation.State) {
  const llm = createLLM();
  let promptWithContext = PRD_PROMPT.replace('{projectContext}', state.projectContext);
  if (state.knowledgeContext) {
    promptWithContext += `\n\n# Design Token 设计规范\n${state.knowledgeContext}`;
  }
  const messages = [
    new SystemMessage(promptWithContext),
    ...state.messages,
    new HumanMessage('请基于以上需求分析，生成完整的PRD文档。'),
  ];
  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : '';
  
  return {
    messages: [new AIMessage(content.replace('[PRD_DONE]', '').trim())],
    stage: 'designPrinciples' as AgentStage,
    prdDoc: content,
    shouldAdvance: true,
  };
}

// 新增：设计原则节点
async function designPrinciplesNode(state: typeof AgentStateAnnotation.State) {
  // 尝试加载知识库上下文
  let knowledgeCtx = state.knowledgeContext;
  if (!knowledgeCtx && state.projectId) {
    try {
      const kb = await getKnowledgeBase(state.projectId);
      if (kb) {
        knowledgeCtx = toContextString(kb);
      }
    } catch { /* 知识库可能不存在 */ }
  }

  const llm = createLLM();
  let prompt = DESIGN_PRINCIPLES_PROMPT.replace('{knowledgeContext}', knowledgeCtx || '暂无知识库数据');
  if (state.designKnowledgeContext) {
    prompt += `\n\n# 设计知识库\n${state.designKnowledgeContext}`;
  }
  const messages = [
    new SystemMessage(prompt),
    ...state.messages,
    new HumanMessage('请基于以上PRD和知识库，提取设计原则。'),
  ];
  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : '';
  
  return {
    messages: [new AIMessage(content.replace('[DESIGN_PRINCIPLES_DONE]', '').trim())],
    stage: 'wireframe' as AgentStage,
    knowledgeContext: knowledgeCtx,
    designPrinciplesDoc: content,
    shouldAdvance: true,
  };
}

// 新增：线框生成节点
async function wireframeGenerateNode(state: typeof AgentStateAnnotation.State) {
  const llm = createLLM();
  let prompt = WIREFRAME_PROMPT.replace('{designPrinciples}', state.designPrinciplesDoc || '无');
  if (state.designKnowledgeContext) {
    prompt += `\n\n# 设计知识库（优先使用以下组件模板）\n${state.designKnowledgeContext}`;
  }
  const messages = [
    new SystemMessage(prompt),
    ...state.messages,
    new HumanMessage('请基于以上PRD和设计原则，为每个新页面生成线框 CaptureTree JSON。'),
  ];
  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : '';
  
  // 尝试从 AI 回复中提取 CaptureTree JSON
  let wireframeTree: unknown = null;
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      wireframeTree = JSON.parse(jsonMatch[1]);
    }
  } catch { /* JSON 解析失败，保留 null */ }
  
  return {
    messages: [new AIMessage(content.replace('[WIREFRAME_DONE]', '').trim())],
    stage: 'hifi' as AgentStage,
    wireframeTree,
    shouldAdvance: true,
  };
}

// 新增：高保真设计节点
async function hifiDesignNode(state: typeof AgentStateAnnotation.State) {
  const llm = createLLM();
  let prompt = HIFI_PROMPT
    .replace('{knowledgeContext}', state.knowledgeContext || '暂无')
    .replace('{designPrinciples}', state.designPrinciplesDoc || '无');
  if (state.knowledgeContext) {
    prompt += `\n\n# 完整 Design Token\n${state.knowledgeContext}`;
  }
  
  const wireframeContext = state.wireframeTree
    ? `\n\n线框 CaptureTree：\n\`\`\`json\n${JSON.stringify(state.wireframeTree, null, 2).slice(0, 4000)}\n\`\`\``
    : '\n\n（无线框数据，请基于PRD直接生成高保真设计）';

  const messages = [
    new SystemMessage(prompt),
    ...state.messages,
    new HumanMessage(`请将线框升级为高保真设计。${wireframeContext}`),
  ];
  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : '';
  
  // 尝试提取高保真 CaptureTree JSON
  let hifiTree: unknown = null;
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      hifiTree = JSON.parse(jsonMatch[1]);
    }
  } catch { /* JSON 解析失败 */ }
  
  return {
    messages: [new AIMessage(content.replace('[HIFI_DONE]', '').trim())],
    stage: 'codeExport' as AgentStage,
    hifiTree,
    shouldAdvance: true,
  };
}

// 新增：代码导出节点
async function codeExportNode(state: typeof AgentStateAnnotation.State) {
  const llm = createLLM();
  const hifiContext = state.hifiTree
    ? `\n\n高保真 CaptureTree：\n\`\`\`json\n${JSON.stringify(state.hifiTree, null, 2).slice(0, 6000)}\n\`\`\``
    : '\n\n（无高保真数据，请基于PRD描述生成代码）';

  const messages = [
    new SystemMessage(CODE_EXPORT_PROMPT),
    ...state.messages,
    new HumanMessage(`请基于高保真设计生成 React 组件代码。${hifiContext}`),
  ];
  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : '';
  
  return {
    messages: [new AIMessage(content.replace('[CODE_EXPORT_DONE]', '').trim())],
    stage: 'done' as AgentStage,
    generatedCode: content,
    shouldAdvance: false,
  };
}

// ========== 路由函数 ==========

function routeAfterClarify(state: typeof AgentStateAnnotation.State): string {
  if (state.shouldAdvance || state.stage === 'requirement') {
    return 'requirement';
  }
  // 停下来等待用户输入（通过 END 退出图，下次调用继续）
  return END;
}

function routeAfterDiscovery(state: typeof AgentStateAnnotation.State): string {
  // Discovery 后总是等用户回答
  return END;
}

// ========== 构建 Graph ==========

function buildAgentGraph() {
  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('discovery', discoveryNode)
    .addNode('clarify', clarifyNode)
    .addNode('requirement', requirementNode)
    .addNode('prd', prdNode)
    .addNode('designPrinciples', designPrinciplesNode)
    .addNode('wireframeGenerate', wireframeGenerateNode)
    .addNode('hifiDesign', hifiDesignNode)
    .addNode('codeExport', codeExportNode)
    .addEdge('__start__', 'discovery')
    .addConditionalEdges('discovery', routeAfterDiscovery)
    .addConditionalEdges('clarify', routeAfterClarify)
    .addEdge('requirement', 'prd')
    .addEdge('prd', 'designPrinciples')
    .addEdge('designPrinciples', 'wireframeGenerate')
    .addEdge('wireframeGenerate', 'hifiDesign')
    .addEdge('hifiDesign', 'codeExport')
    .addEdge('codeExport', END);
  
  // 使用内存检查点（生产环境可改为文件系统）
  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}

// ========== Session 管理 ==========

interface SessionMeta {
  id: string;
  projectId: string;
  stage: AgentStage;
  createdAt: string;
  updatedAt: string;
  title: string;
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data', 'agent-sessions');

/**
 * 将页面层级树格式化为缩进文本
 * 例如:
 * - 首页
 *   - 产品列表页
 *     - 产品详情页
 *   - 用户中心
 */
function formatPageHierarchyTree(nodes: PageHierarchyNode[], indent: number = 0): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const prefix = '  '.repeat(indent) + '- ';
    lines.push(`${prefix}${node.name || node.url || node.id}`);
    if (node.children.length > 0) {
      lines.push(formatPageHierarchyTree(node.children, indent + 1));
    }
  }
  return lines.join('\n');
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 在内存中缓存已编译的 graph
let cachedGraph: ReturnType<typeof buildAgentGraph> | null = null;
let graphError: Error | null = null;

function getGraph() {
  if (graphError) {
    throw graphError;
  }
  if (!cachedGraph) {
    try {
      cachedGraph = buildAgentGraph();
    } catch (err) {
      graphError = err instanceof Error ? err : new Error(String(err));
      console.error('Failed to build agent graph:', graphError.message);
      throw graphError;
    }
  }
  return cachedGraph;
}

export class ProductAgentService {
  
  // 创建新会话
  async createSession(projectId: string, initialIdea: string): Promise<{ sessionId: string; response: string }> {
    const sessionId = uuidv4();
    const projectCtx = buildProjectContext(projectId);
    
    // 加载项目知识库上下文
    let knowledgeCtx = '';
    try {
      const projectKB = getKnowledgeBase(projectId);
      if (projectKB) {
        knowledgeCtx = toContextString(projectKB);
      }
    } catch (err) {
      console.warn(`Failed to load project knowledge base for ${projectId}:`, err);
    }

    // 加载设计知识库上下文
    let designKnowledgeCtx = '';
    try {
      const designKB = getDesignKnowledgeBase(projectId);
      if (designKB) {
        designKnowledgeCtx = toDesignKnowledgeContextString(designKB);
      }
    } catch (err) {
      console.warn(`Failed to load design knowledge base for ${projectId}:`, err);
    }

    // 加载页面层级树并格式化为文本
    let pageHierarchyCtx = '';
    try {
      const hierarchyTree = getPageHierarchyTree(projectId);
      if (hierarchyTree.length > 0) {
        pageHierarchyCtx = formatPageHierarchyTree(hierarchyTree);
      }
    } catch (err) {
      console.warn(`Failed to load page hierarchy for ${projectId}:`, err);
    }

    const graph = getGraph();
    const config = { configurable: { thread_id: sessionId } };
    
    // 初始调用 — 传入用户的想法，注入知识库上下文
    const result = await graph.invoke({
      messages: [new HumanMessage(initialIdea)],
      projectId,
      rawIdea: initialIdea,
      projectContext: projectCtx,
      knowledgeContext: knowledgeCtx,
      designKnowledgeContext: designKnowledgeCtx,
      pageHierarchyContext: pageHierarchyCtx,
    }, config);
    
    // 提取最后一条 AI 消息
    const lastMessage = result.messages[result.messages.length - 1];
    const responseText = typeof lastMessage.content === 'string' ? lastMessage.content : '';
    
    // 保存 session 元数据到文件
    const meta: SessionMeta = {
      id: sessionId,
      projectId,
      stage: result.stage || 'clarifying',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: initialIdea.slice(0, 50),
    };
    ensureDir(path.join(DATA_DIR, sessionId));
    fs.writeFileSync(
      path.join(DATA_DIR, sessionId, 'meta.json'),
      JSON.stringify(meta, null, 2),
      'utf-8'
    );
    
    return { sessionId, response: responseText };
  }
  
  // 发送消息（继续对话）
  // 增强：用户普通消息不自动推进阶段 (Requirement 5.1)
  async sendMessage(sessionId: string, message: string): Promise<{ response: string; stage: AgentStage; prd?: string }> {
    const graph = getGraph();
    const config = { configurable: { thread_id: sessionId } };
    
    // 获取当前状态
    const currentState = await graph.getState(config);
    const currentStage = currentState.values?.stage || 'clarifying';
    
    // 从 session meta 中获取 projectId，用于重新加载知识库
    let projectId = '';
    const metaFilePath = path.join(DATA_DIR, sessionId, 'meta.json');
    try {
      if (fs.existsSync(metaFilePath)) {
        const meta: SessionMeta = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8'));
        projectId = meta.projectId;
      }
    } catch (err) {
      console.warn(`Failed to read session meta for ${sessionId}:`, err);
    }

    // 每次处理消息前重新加载知识库上下文，确保使用最新内容 (Requirement 4.6)
    let knowledgeCtx = '';
    let designKnowledgeCtx = '';
    let pageHierarchyCtx = '';

    if (projectId) {
      try {
        const projectKB = getKnowledgeBase(projectId);
        if (projectKB) {
          knowledgeCtx = toContextString(projectKB);
        }
      } catch (err) {
        console.warn(`Failed to reload project knowledge base for ${projectId}:`, err);
      }

      try {
        const designKB = getDesignKnowledgeBase(projectId);
        if (designKB) {
          designKnowledgeCtx = toDesignKnowledgeContextString(designKB);
        }
      } catch (err) {
        console.warn(`Failed to reload design knowledge base for ${projectId}:`, err);
      }

      try {
        const hierarchyTree = getPageHierarchyTree(projectId);
        if (hierarchyTree.length > 0) {
          pageHierarchyCtx = formatPageHierarchyTree(hierarchyTree);
        }
      } catch (err) {
        console.warn(`Failed to reload page hierarchy for ${projectId}:`, err);
      }
    }

    // 构建包含刷新后知识库上下文的 invoke 输入
    // shouldAdvance 设为 false，确保用户普通消息不自动推进阶段
    const invokeInput = {
      messages: [new HumanMessage(message)],
      knowledgeContext: knowledgeCtx,
      designKnowledgeContext: designKnowledgeCtx,
      pageHierarchyContext: pageHierarchyCtx,
      shouldAdvance: false,
    };

    // 记录当前阶段到 stageHistory
    const stageHistoryUpdate = { stageHistory: [currentStage] };

    const result = await graph.invoke(
      { ...invokeInput, ...stageHistoryUpdate },
      config
    );
    
    const lastMessage = result.messages[result.messages.length - 1];
    const responseText = typeof lastMessage.content === 'string' ? lastMessage.content : '';
    
    // 确定最终阶段：如果 graph 自动推进了阶段但 shouldAdvance 未被设置，
    // 则保持当前阶段不变（除非是 clarify 阶段的 READY_FOR_REQUIREMENT 自然推进）
    const resultStage = result.stage || currentStage;
    const finalStage = (result.shouldAdvance || currentStage === 'clarifying')
      ? resultStage
      : currentStage;
    
    // 更新 meta
    const metaPath = path.join(DATA_DIR, sessionId, 'meta.json');
    if (fs.existsSync(metaPath)) {
      const meta: SessionMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      meta.stage = finalStage;
      meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    }
    
    return {
      response: responseText,
      stage: finalStage,
      prd: result.prdDoc || undefined,
    };
  }
  
  // 手动推进到下一阶段
  async advanceStage(sessionId: string): Promise<{ response: string; stage: AgentStage; prd?: string }> {
    const graph = getGraph();
    const config = { configurable: { thread_id: sessionId } };
    
    const currentState = await graph.getState(config);
    const currentStage = currentState.values?.stage || 'clarifying';
    
    // 根据当前阶段手动推进
    const advanceMessage = this.getAdvanceMessage(currentStage);
    
    const result = await graph.invoke({
      messages: [new HumanMessage(advanceMessage)],
      shouldAdvance: true,
    }, config);
    
    const lastMessage = result.messages[result.messages.length - 1];
    const responseText = typeof lastMessage.content === 'string' ? lastMessage.content : '';
    
    return {
      response: responseText,
      stage: result.stage || currentStage,
      prd: result.prdDoc || undefined,
    };
  }
  
  private getAdvanceMessage(stage: AgentStage): string {
    switch (stage) {
      case 'clarifying': return '我认为信息已经足够了，请直接进入需求分析阶段。';
      case 'requirement': return '请基于当前需求生成PRD文档。';
      case 'prd': return '请基于PRD提取设计原则。';
      case 'designPrinciples': return '请基于设计原则生成线框。';
      case 'wireframe': return '请将线框升级为高保真设计。';
      case 'hifi': return '请基于高保真设计生成代码。';
      default: return '请继续。';
    }
  }

  // 回退到指定阶段 (Requirement 5.2)
  async rollbackStage(sessionId: string, targetStage: AgentStage): Promise<{ response: string; stage: AgentStage }> {
    const graph = getGraph();
    const config = { configurable: { thread_id: sessionId } };

    // 获取当前状态
    const currentState = await graph.getState(config);
    if (!currentState.values) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const currentStage = currentState.values.stage as AgentStage;

    // 验证目标阶段有效性
    const stageOrder: AgentStage[] = [
      'discovery', 'clarifying', 'requirement', 'prd',
      'designPrinciples', 'wireframe', 'hifi', 'codeExport', 'done',
    ];
    const currentIdx = stageOrder.indexOf(currentStage);
    const targetIdx = stageOrder.indexOf(targetStage);

    if (targetIdx < 0) {
      throw new Error(`Invalid target stage: ${targetStage}. Valid stages: ${stageOrder.join(', ')}`);
    }
    if (targetIdx >= currentIdx) {
      throw new Error(`Cannot rollback to stage "${targetStage}" — it is not before current stage "${currentStage}"`);
    }

    // 通过 updateState 将 stage 设为 targetStage，保留所有对话历史，
    // 并添加系统消息说明回退
    const rollbackMessage = `已回退到${targetStage}阶段，您可以继续在此阶段进行对话。`;
    await graph.updateState(config, {
      stage: targetStage,
      shouldAdvance: false,
      stageHistory: [currentStage],
      messages: [new SystemMessage(rollbackMessage)],
    });

    // 更新 session meta 文件
    const metaPath = path.join(DATA_DIR, sessionId, 'meta.json');
    if (fs.existsSync(metaPath)) {
      const meta: SessionMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      meta.stage = targetStage;
      meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    }

    return {
      response: rollbackMessage,
      stage: targetStage,
    };
  }

  // 局部更新 PRD 指定部分 (Requirement 5.4)
  async updatePRDSection(sessionId: string, section: string, modification: string): Promise<{ response: string; prd: string }> {
    const graph = getGraph();
    const config = { configurable: { thread_id: sessionId } };

    // 获取当前状态
    const currentState = await graph.getState(config);
    if (!currentState.values) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const currentPRD = currentState.values.prdDoc as string;
    if (!currentPRD) {
      throw new Error('No PRD document found in current session. PRD must be generated first.');
    }

    // 使用 LLM 局部修改 PRD 中指定的部分
    const llm = createLLM();
    const updatePrompt = `你是一位产品文档编辑专家。你需要对以下 PRD 文档进行局部修改。

## 当前 PRD 文档
${currentPRD}

## 修改要求
需要修改的部分：${section}
修改内容：${modification}

## 规则
1. 仅修改指定的部分，保留其余所有内容不变
2. 保持 Markdown 格式一致
3. 修改后输出完整的 PRD 文档（不要只输出修改的部分）
4. 不要添加任何额外说明，直接输出修改后的完整 PRD

请输出修改后的完整 PRD 文档：`;

    const response = await llm.invoke([new HumanMessage(updatePrompt)]);
    const updatedPRD = typeof response.content === 'string' ? response.content : '';

    // 更新 state 中的 prdDoc
    const updateMessage = `已更新 PRD 中的「${section}」部分。`;
    await graph.updateState(config, {
      prdDoc: updatedPRD,
      messages: [
        new HumanMessage(`请修改 PRD 中的「${section}」：${modification}`),
        new AIMessage(updateMessage),
      ],
    });

    return {
      response: updateMessage,
      prd: updatedPRD,
    };
  }
  
  // 获取会话信息
  async getSession(sessionId: string): Promise<{ meta: SessionMeta; messages: Array<{ role: string; content: string }> } | null> {
    const metaPath = path.join(DATA_DIR, sessionId, 'meta.json');
    if (!fs.existsSync(metaPath)) return null;
    
    const meta: SessionMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    
    const graph = getGraph();
    const config = { configurable: { thread_id: sessionId } };
    const state = await graph.getState(config);
    
    // 将 BaseMessage[] 转为简单格式
    const messages = (state.values?.messages || []).map((m: BaseMessage) => ({
      role: m._getType() === 'human' ? 'user' : m._getType() === 'ai' ? 'assistant' : 'system',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));
    
    return { meta, messages };
  }
  
  // 获取 PRD
  async getPRD(sessionId: string): Promise<string | null> {
    const graph = getGraph();
    const config = { configurable: { thread_id: sessionId } };
    const state = await graph.getState(config);
    return state.values?.prdDoc || null;
  }
  
  // 列出项目的所有会话
  listSessions(projectId: string): SessionMeta[] {
    ensureDir(DATA_DIR);
    const sessions: SessionMeta[] = [];
    
    if (!fs.existsSync(DATA_DIR)) return sessions;
    
    const dirs = fs.readdirSync(DATA_DIR);
    for (const dir of dirs) {
      const metaPath = path.join(DATA_DIR, dir, 'meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          const meta: SessionMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          if (meta.projectId === projectId) {
            sessions.push(meta);
          }
        } catch {}
      }
    }
    
    return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
}

export const productAgentService = new ProductAgentService();
