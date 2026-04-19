import { StateGraph, Annotation, MemorySaver, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';

// ========== 类型定义 ==========

export type DesignStage = 'analyze' | 'clarify' | 'design' | 'done';

export interface StateVariant {
  name: string;            // 如 "默认状态", "加载中", "空数据", "错误状态"
  description: string;
  modifiedTree: any;       // CaptureTree JSON
  isDefault: boolean;
}

// LangGraph State 定义
const DesignStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  stage: Annotation<DesignStage>({
    reducer: (_prev, next) => next,
    default: () => 'analyze' as DesignStage,
  }),
  projectId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  pageId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  selectedNodeId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  selectedNodeContext: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  pageContext: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  userRequirement: Annotation<string>({
    reducer: (_prev, next) => next,
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
  stateVariants: Annotation<StateVariant[]>({
    reducer: (_prev, next) => next || _prev,
    default: () => [],
  }),
});

// ========== LLM 初始化 ==========

function createLLM() {
  const apiKey = process.env.AI_API_KEY || '';
  const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.AI_MODEL || 'gpt-4o';

  if (!apiKey) {
    throw new Error('AI API Key 未配置，请在设置页面配置 API Key');
  }

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

// ========== CaptureTree 验证 ==========

function isValidCaptureTree(tree: unknown): boolean {
  if (!tree || typeof tree !== 'object') return false;
  const t = tree as Record<string, unknown>;
  const root = t.root;
  if (!root || typeof root !== 'object') return false;
  const r = root as Record<string, unknown>;
  if (r.nodeType === undefined || r.nodeType === null) return false;
  if (r.nodeType === 1) {
    if (!r.tag || typeof r.tag !== 'string') return false;
    if (!Array.isArray(r.childNodes)) return false;
    if (!r.rect || typeof r.rect !== 'object') return false;
  }
  return true;
}

// ========== System Prompts ==========

const ANALYZE_PROMPT = `你是一位资深交互设计师。用户提出了一个设计修改需求。

你的任务是：
1. 分析用户需求，识别模糊点和关键设计决策
2. 提出 2-3 个关键问题来澄清需求

要考虑的维度：
- 目标用户是谁？主要使用场景是什么？
- 交互方式是怎样的？（点击、滑动、输入等）
- 需要处理哪些状态？（加载、空数据、错误等）
- 与周围元素的关系和布局影响
- 是否涉及数据获取或异步操作？

你的风格：
- 专业但友好
- 关注用户体验和交互设计
- 简洁有力，避免冗余
- 用编号列出问题`;

const CLARIFY_PROMPT = `你是一位资深交互设计师，正在与用户澄清设计需求。

根据用户回答继续追问或判断信息足够。当核心问题都已澄清时，在回复末尾加上标记 [READY_FOR_DESIGN]。

判断是否推进的标准：
- 交互方式明确（用户如何操作，界面如何响应）
- 需要的状态变体明确（默认、空数据、加载中、错误等）
- 边界情况考虑周全
- 与周围元素的关系清晰

你的风格：
- 不过度追问细节（设计是迭代的）
- 关注核心交互逻辑和状态设计
- 当信息足够生成设计原型时，果断推进`;

const DESIGN_PROMPT = `你是一位资深交互设计师和前端原型专家。基于前面的需求澄清，为选中区域生成多种状态的原型修改。

你需要考虑以下状态（根据需求选择相关的状态，通常2-4个）：
1. 默认/正常状态 - 最常见的展示形态
2. 空数据状态 - 没有数据时的展示
3. 加载中状态 - 数据正在加载时
4. 错误/异常状态 - 出错时的展示
5. 悬停/交互状态 - 鼠标悬停或点击时的变化
6. 边界数据状态 - 数据极多或极少时

输出格式要求：
1. 首先用自然语言总结设计方案
2. 然后为每个状态输出一个 JSON 块，格式如下：

### 状态: {状态名称}
描述: {什么场景下展示这个状态}
默认: {true/false}
\`\`\`json
{完整的 CaptureTree JSON}
\`\`\`

重要的 CaptureTree 格式规则：
- 每个元素节点: { "nodeType": 1, "id": "h2d-node-xxx", "tag": "DIV", "styles": {...}, "rect": {...}, "childNodes": [...] }
- 每个文本节点: { "nodeType": 3, "id": "h2d-node-xxx", "text": "文本" }
- 新增节点用 "h2d-node-new-xxx" 格式
- 结构必须包含在 { "root": {...}, "documentTitle": "..." } 中
- 保持所有现有节点的 id 不变
- 不要使用 "children"、"textContent"、"className" 等字段，必须用 "childNodes"、"text"、"attributes"`;

const DONE_PROMPT = `你是一位交互设计师，刚刚完成了多种状态的原型设计。请用1-2句话总结设计方案，并提示用户可以预览和选择不同的状态变体。`;

// ========== 解析 AI 响应中的状态变体 ==========

function parseStateVariants(aiContent: string, fallbackTree?: any): StateVariant[] {
  const variants: StateVariant[] = [];

  // 使用正则匹配每个状态块：### 状态: xxx \n 描述: xxx \n 默认: xxx \n ```json ... ```
  const stateBlockRegex = /###\s*状态[:：]\s*(.+?)\n\s*描述[:：]\s*(.+?)\n\s*默认[:：]\s*(true|false)\s*\n\s*```json\s*([\s\S]*?)\s*```/gi;

  let match;
  while ((match = stateBlockRegex.exec(aiContent)) !== null) {
    const name = match[1].trim();
    const description = match[2].trim();
    const isDefault = match[3].trim().toLowerCase() === 'true';
    const jsonStr = match[4].trim();

    try {
      const parsed = JSON.parse(jsonStr);
      if (isValidCaptureTree(parsed)) {
        variants.push({
          name,
          description,
          modifiedTree: parsed,
          isDefault,
        });
      } else {
        console.warn(`DesignAgent: State variant "${name}" has invalid CaptureTree format, skipping`);
      }
    } catch (e) {
      console.warn(`DesignAgent: Failed to parse JSON for state variant "${name}":`, e);
    }
  }

  // 如果没有解析到任何变体，尝试更宽松的匹配
  if (variants.length === 0) {
    // 尝试匹配 ```json ... ``` 块
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/gi;
    let jsonMatch;
    let variantIndex = 0;
    while ((jsonMatch = jsonBlockRegex.exec(aiContent)) !== null) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        if (isValidCaptureTree(parsed)) {
          variantIndex++;
          variants.push({
            name: variantIndex === 1 ? '默认状态' : `状态 ${variantIndex}`,
            description: variantIndex === 1 ? '默认展示状态' : `第 ${variantIndex} 个状态`,
            modifiedTree: parsed,
            isDefault: variantIndex === 1,
          });
        }
      } catch (e) {
        console.warn('DesignAgent: Failed to parse fallback JSON block:', e);
      }
    }
  }

  // 如果仍然没有解析到任何变体，使用 fallbackTree 创建一个默认变体
  if (variants.length === 0 && fallbackTree) {
    variants.push({
      name: '默认状态',
      description: '原始设计状态',
      modifiedTree: fallbackTree,
      isDefault: true,
    });
  }

  // 确保至少有一个 isDefault=true 的变体
  if (variants.length > 0 && !variants.some(v => v.isDefault)) {
    variants[0].isDefault = true;
  }

  return variants;
}

// ========== Node 函数 ==========

async function analyzeNode(state: typeof DesignStateAnnotation.State) {
  const llm = createLLM();

  // 构建包含上下文的用户消息
  const contextParts: string[] = [];
  if (state.selectedNodeContext) {
    contextParts.push(`选中元素的结构：\n${state.selectedNodeContext}`);
  }
  if (state.pageContext) {
    contextParts.push(`页面上下文：\n${state.pageContext}`);
  }

  const userMessage = contextParts.length > 0
    ? `${contextParts.join('\n\n')}\n\n用户需求：${state.userRequirement}`
    : `用户需求：${state.userRequirement}`;

  const messages = [
    new SystemMessage(ANALYZE_PROMPT),
    new HumanMessage(userMessage),
  ];

  const response = await llm.invoke(messages);

  return {
    messages: [response],
    stage: 'clarify' as DesignStage,
    shouldAdvance: false,
  };
}

async function clarifyNode(state: typeof DesignStateAnnotation.State) {
  const llm = createLLM();
  const messages = [
    new SystemMessage(CLARIFY_PROMPT),
    ...state.messages,
  ];
  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : '';
  const isReady = content.includes('[READY_FOR_DESIGN]');

  return {
    messages: [new AIMessage(content.replace('[READY_FOR_DESIGN]', '').trim())],
    stage: (isReady ? 'design' : 'clarify') as DesignStage,
    clarifyCount: state.clarifyCount + 1,
    shouldAdvance: isReady,
  };
}

async function designNode(state: typeof DesignStateAnnotation.State) {
  const llm = createLLM();

  // 构建设计提示
  const contextParts: string[] = [];
  if (state.selectedNodeContext) {
    contextParts.push(`选中元素的结构（需修改的原始结构）：\n${state.selectedNodeContext}`);
  }
  if (state.pageContext) {
    contextParts.push(`页面上下文（供参考的周围元素信息）：\n${state.pageContext}`);
  }

  const designPromptWithContext = contextParts.length > 0
    ? `${DESIGN_PROMPT}\n\n${contextParts.join('\n\n')}`
    : DESIGN_PROMPT;

  const messages = [
    new SystemMessage(designPromptWithContext),
    ...state.messages,
    new HumanMessage('请基于以上澄清的需求，为选中区域生成多种状态的原型修改。'),
  ];

  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : '';

  // 解析状态变体
  const selectedNodeTree = tryParseSelectedNodeContext(state.selectedNodeContext);
  const stateVariants = parseStateVariants(content, selectedNodeTree);

  // 提取自然语言总结（在第一个 "### 状态" 之前的内容）
  const summaryMatch = content.match(/^([\s\S]*?)(?=###\s*状态|$)/i);
  const summary = summaryMatch ? summaryMatch[1].trim() : content.split('```json')[0].trim();

  return {
    messages: [new AIMessage(summary)],
    stage: 'done' as DesignStage,
    shouldAdvance: false,
    stateVariants,
  };
}

async function doneNode(state: typeof DesignStateAnnotation.State) {
  const llm = createLLM();
  const messages = [
    new SystemMessage(DONE_PROMPT),
    ...state.messages,
  ];
  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : '';

  return {
    messages: [new AIMessage(content)],
    stage: 'done' as DesignStage,
  };
}

// ========== 辅助函数 ==========

/** 尝试从 selectedNodeContext 中解析出 CaptureTree JSON */
function tryParseSelectedNodeContext(context: string): any {
  if (!context) return undefined;
  // 尝试匹配 json 代码块
  const jsonMatch = context.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {
      // 忽略解析错误
    }
  }
  // 尝试直接解析整个 context 为 JSON
  try {
    const parsed = JSON.parse(context);
    return parsed;
  } catch {
    // 忽略
  }
  return undefined;
}

// ========== 路由函数 ==========

function routeAfterAnalyze(_state: typeof DesignStateAnnotation.State): string {
  // analyze 后总是等待用户回答
  return END;
}

function routeAfterClarify(state: typeof DesignStateAnnotation.State): string {
  if (state.shouldAdvance || state.stage === 'design') {
    return 'design';
  }
  // 停下来等待用户输入
  return END;
}

// ========== 构建 Graph ==========

function buildDesignGraph() {
  const graph = new StateGraph(DesignStateAnnotation)
    .addNode('analyze', analyzeNode)
    .addNode('clarify', clarifyNode)
    .addNode('design', designNode)
    .addNode('done', doneNode)
    .addEdge('__start__', 'analyze')
    .addConditionalEdges('analyze', routeAfterAnalyze)
    .addConditionalEdges('clarify', routeAfterClarify)
    .addEdge('design', 'done')
    .addEdge('done', END);

  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}

// ========== 防崩溃设计 ==========

let cachedGraph: ReturnType<typeof buildDesignGraph> | null = null;
let graphError: Error | null = null;

function getDesignGraph() {
  if (graphError) throw graphError;
  if (!cachedGraph) {
    try {
      cachedGraph = buildDesignGraph();
    } catch (err) {
      graphError = err instanceof Error ? err : new Error(String(err));
      console.error('Failed to build design agent graph:', graphError.message);
      throw graphError;
    }
  }
  return cachedGraph;
}

// ========== Service 类 ==========

export class DesignAgentService {

  /**
   * 启动设计工作流
   */
  async startWorkflow(params: {
    projectId: string;
    pageId: string;
    selectedNodeId: string;
    selectedNodeContext: string;
    pageContext: string;
    requirement: string;
  }): Promise<{ sessionId: string; response: string; stage: DesignStage }> {
    const sessionId = uuidv4();
    const graph = getDesignGraph();
    const config = { configurable: { thread_id: sessionId } };

    // 初始调用 — 传入用户需求和上下文
    const result = await graph.invoke({
      messages: [new HumanMessage(params.requirement)],
      projectId: params.projectId,
      pageId: params.pageId,
      selectedNodeId: params.selectedNodeId,
      selectedNodeContext: params.selectedNodeContext,
      pageContext: params.pageContext,
      userRequirement: params.requirement,
    }, config);

    // 提取最后一条 AI 消息
    const lastMessage = result.messages[result.messages.length - 1];
    const responseText = typeof lastMessage.content === 'string' ? lastMessage.content : '';

    return {
      sessionId,
      response: responseText,
      stage: result.stage || 'clarify',
    };
  }

  /**
   * 在工作流中发送消息（用于 clarify 阶段的追问回答）
   */
  async sendMessage(sessionId: string, message: string): Promise<{
    response: string;
    stage: DesignStage;
    stateVariants?: StateVariant[];
  }> {
    const graph = getDesignGraph();
    const config = { configurable: { thread_id: sessionId } };

    // 获取当前状态
    const currentState = await graph.getState(config);
    const currentStage = currentState.values?.stage || 'clarify';

    // 继续图执行 — 传入用户消息
    const result = await graph.invoke({
      messages: [new HumanMessage(message)],
    }, config);

    const lastMessage = result.messages[result.messages.length - 1];
    const responseText = typeof lastMessage.content === 'string' ? lastMessage.content : '';

    const resultStage = result.stage || currentStage;

    return {
      response: responseText,
      stage: resultStage,
      stateVariants: result.stateVariants || undefined,
    };
  }

  /**
   * 手动推进到 design 阶段
   */
  async advanceToDesign(sessionId: string): Promise<{
    response: string;
    stage: DesignStage;
    stateVariants?: StateVariant[];
  }> {
    const graph = getDesignGraph();
    const config = { configurable: { thread_id: sessionId } };

    // 强制推进 — 设置 shouldAdvance 并发送推进消息
    const result = await graph.invoke({
      messages: [new HumanMessage('我认为信息已经足够了，请直接进入设计阶段，生成多种状态的原型修改。')],
      shouldAdvance: true,
    }, config);

    const lastMessage = result.messages[result.messages.length - 1];
    const responseText = typeof lastMessage.content === 'string' ? lastMessage.content : '';

    return {
      response: responseText,
      stage: result.stage || 'done',
      stateVariants: result.stateVariants || undefined,
    };
  }
}

export const designAgentService = new DesignAgentService();
