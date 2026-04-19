import { StateGraph, Annotation, MemorySaver, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { buildProjectContext, getPages } from './storage.js';

// ========== 类型定义 ==========

export type AgentStage = 'discovery' | 'clarifying' | 'requirement' | 'prd' | 'prototype' | 'done';

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

const PROTOTYPE_PROMPT = `你是一位原型设计师。基于PRD中的页面变更清单，描述每个页面需要进行的具体视觉和交互修改。

注意：此阶段只生成修改方案描述，不直接修改CaptureTree结构。用户可以在编辑器中逐个应用修改。

请为每个需要修改的页面输出：
1. 页面名称
2. 修改概述
3. 具体修改项（每项包含：位置、修改内容、样式变化）
4. 新增元素描述（如需要）

在回复末尾加上标记 [PROTOTYPE_DONE]`;

// ========== Node 函数 ==========

async function discoveryNode(state: typeof AgentStateAnnotation.State) {
  const llm = createLLM();
  const messages = [
    new SystemMessage(DISCOVERY_PROMPT),
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
  const messages = [
    new SystemMessage(CLARIFY_PROMPT),
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
  const promptWithContext = REQUIREMENT_PROMPT.replace('{projectContext}', state.projectContext);
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
  const promptWithContext = PRD_PROMPT.replace('{projectContext}', state.projectContext);
  const messages = [
    new SystemMessage(promptWithContext),
    ...state.messages,
    new HumanMessage('请基于以上需求分析，生成完整的PRD文档。'),
  ];
  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : '';
  
  return {
    messages: [new AIMessage(content.replace('[PRD_DONE]', '').trim())],
    stage: 'prototype' as AgentStage,
    prdDoc: content,
    shouldAdvance: true,
  };
}

async function prototypeNode(state: typeof AgentStateAnnotation.State) {
  const llm = createLLM();
  // 获取项目页面列表
  const pagesInfo = state.projectContext;
  const messages = [
    new SystemMessage(PROTOTYPE_PROMPT),
    ...state.messages,
    new HumanMessage(`请基于以上PRD中的页面变更清单，为每个页面生成具体的修改方案。\n\n项目页面信息：\n${pagesInfo}`),
  ];
  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : '';
  
  return {
    messages: [new AIMessage(content.replace('[PROTOTYPE_DONE]', '').trim())],
    stage: 'done' as AgentStage,
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
    .addNode('prototype', prototypeNode)
    .addEdge('__start__', 'discovery')
    .addConditionalEdges('discovery', routeAfterDiscovery)
    .addConditionalEdges('clarify', routeAfterClarify)
    .addEdge('requirement', 'prd')
    .addEdge('prd', 'prototype')
    .addEdge('prototype', END);
  
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
    
    const graph = getGraph();
    const config = { configurable: { thread_id: sessionId } };
    
    // 初始调用 — 传入用户的想法
    const result = await graph.invoke({
      messages: [new HumanMessage(initialIdea)],
      projectId,
      rawIdea: initialIdea,
      projectContext: projectCtx,
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
  async sendMessage(sessionId: string, message: string): Promise<{ response: string; stage: AgentStage; prd?: string }> {
    const graph = getGraph();
    const config = { configurable: { thread_id: sessionId } };
    
    // 获取当前状态
    const currentState = await graph.getState(config);
    const currentStage = currentState.values?.stage || 'clarifying';
    
    // 根据当前阶段决定下一个节点入口
    // 用户消息后，根据 stage 更新图的入口
    let result;
    
    if (currentStage === 'clarifying') {
      // 用户回答后继续 clarify
      result = await graph.invoke({
        messages: [new HumanMessage(message)],
      }, config);
    } else if (currentStage === 'requirement' || currentStage === 'prd' || currentStage === 'prototype') {
      // 这些阶段是自动推进的，用户消息可以作为补充
      result = await graph.invoke({
        messages: [new HumanMessage(message)],
      }, config);
    } else {
      // 其他情况直接发送
      result = await graph.invoke({
        messages: [new HumanMessage(message)],
      }, config);
    }
    
    const lastMessage = result.messages[result.messages.length - 1];
    const responseText = typeof lastMessage.content === 'string' ? lastMessage.content : '';
    
    // 更新 meta
    const metaPath = path.join(DATA_DIR, sessionId, 'meta.json');
    if (fs.existsSync(metaPath)) {
      const meta: SessionMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      meta.stage = result.stage || currentStage;
      meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    }
    
    return {
      response: responseText,
      stage: result.stage || currentStage,
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
      case 'prd': return '请基于PRD生成原型修改方案。';
      default: return '请继续。';
    }
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
