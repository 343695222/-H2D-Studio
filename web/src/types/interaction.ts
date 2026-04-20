/**
 * Interaction Schema — AI 卡片交互系统的类型定义
 *
 * AI 不再输出纯文本，而是输出结构化的 InteractionMessage，
 * 前端根据 type 渲染为可点击的卡片/按钮。
 */

// ========== 交互消息类型 ==========

/** AI 返回的交互式消息 */
export interface InteractionMessage {
  id: string;
  type: 'text' | 'choice' | 'multi-choice' | 'confirm' | 'preview' | 'summary';
  content: string;           // 标题/描述文字（简短）
  options?: InteractionOption[]; // 选择项
  preview?: PreviewData;     // 预览数据
  metadata?: InteractionMetadata;
}

/** 交互选项 */
export interface InteractionOption {
  id: string;
  label: string;             // 显示文字
  description?: string;      // 补充说明
  icon?: string;             // 图标 emoji
  value: string;             // 选中后返回的值
  preview?: PreviewData;     // 选中后的预览
}

/** 预览数据 */
export interface PreviewData {
  type: 'wireframe' | 'hifi' | 'code' | 'diff';
  captureTree?: unknown;     // CaptureTree JSON
  code?: string;             // 代码预览
  diff?: DiffItem[];         // 变更差异
}

/** 变更差异项 */
export interface DiffItem {
  nodeId: string;
  action: 'modify' | 'add' | 'delete';
  description: string;
  before?: unknown;
  after?: unknown;
}

/** 交互元数据 */
export interface InteractionMetadata {
  step?: number;             // 当前步骤
  totalSteps?: number;       // 总步骤数
  stage?: string;            // 当前阶段
  [key: string]: unknown;
}

// ========== 用户回复 ==========

/** 用户的选择结果 */
export interface InteractionResponse {
  messageId: string;
  selectedOptions: string[];  // 选中的 option id 列表
  customInput?: string;       // 用户自定义输入
}

// ========== 会话状态 ==========

/** 交互式会话状态 */
export interface InteractionSessionState {
  sessionId: string;
  projectId: string;
  stage: InteractionStage;
  messages: InteractionMessage[];
  history: InteractionHistoryEntry[];
  currentStep: number;
  totalSteps: number;
}

/** 交互阶段 */
export type InteractionStage =
  | 'discovery'      // 需求发现
  | 'clarifying'     // 需求澄清
  | 'requirement'    // 需求分析
  | 'prd'            // PRD 生成
  | 'designPrinciples' // 设计原则
  | 'wireframe'      // 线框生成
  | 'hifi'           // 高保真设计
  | 'codeExport'     // 代码导出
  | 'done';          // 完成

/** 历史记录条目 */
export interface InteractionHistoryEntry {
  stage: InteractionStage;
  timestamp: string;
  userResponse: InteractionResponse;
  aiMessages: InteractionMessage[];
  output?: unknown; // 该阶段的产出物
}

// ========== AI 回复格式 ==========

/** AI 服务端返回的交互式回复 */
export interface InteractionReply {
  messages: InteractionMessage[];
  stage: InteractionStage;
  currentStep: number;
  totalSteps: number;
  stageOutput?: unknown; // 当前阶段的产出物（PRD、线框 JSON 等）
}
