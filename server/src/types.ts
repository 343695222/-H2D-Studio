export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
}

export interface PageCapture {
  id: string;
  projectId: string;
  name: string;
  url: string;
  description?: string;
  capturedAt: string;
  // captureTree 单独存储在文件中，这里不包含
}

export interface PageSummary {
  id: string;
  name: string;
  url: string;
  capturedAt: string;
  screenshotPath: string;
  hasEdited: boolean;
  // 知识库摘要字段
  knowledgeSummary?: PageKnowledgeSummary;
}

export interface PageKnowledgeSummary {
  documentTitle: string;
  topComponents: Array<{ tag: string; id?: string; className?: string }>;
  visibleText: string;
  mainStyles: {
    primaryColors: string[];
    fontFamilies: string[];
    spacingRange: { min: number; max: number };
  };
  layoutType: 'flex' | 'grid' | 'block' | 'mixed';
  componentStats: {
    total: number;
    byTag: Record<string, number>;
  };
}

export interface AIConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AppSettings {
  ai: AIConfig;
}

// AI Service Types
export interface ProjectContext {
  projectName: string;
  projectDescription: string;
  pages: PageKnowledgeSummary[];
}

export interface PRDResult {
  markdown: string;
  modifications: PageModification[] | null;
}

export interface PageModification {
  pageId: string;
  pageName: string;
  modifications: Modification[];
}

export interface Modification {
  targetArea: string;
  action: 'modify' | 'add' | 'delete' | 'move';
  description: string;
  details?: {
    textChanges?: unknown[];
    styleChanges?: unknown[];
    structureChanges?: unknown[];
  };
}

export interface ModificationPlan {
  pages: PageModification[];
  summary: string;
}

export interface StyleContext {
  primaryColors: string[];
  fonts: string[];
  borderRadius: string;
  spacing: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Skill Types
export interface Skill {
  name: string;          // 文件名(不含.md)
  title: string;         // 技能标题(从markdown #标题提取)
  description?: string;  // 描述
  content: string;       // 完整markdown内容
  createdAt: string;
  updatedAt: string;
}

// ========== SolarWire Types ==========

export interface SolarWireSummary {
  pageId: string;           // 关联的页面 ID
  dsl: string;              // SolarWire DSL 文本
  generatedAt: string;      // 生成时间
}

export interface SolarWireStructurePattern {
  name: string;             // 模式名称（如 "导航栏"、"卡片列表"）
  description: string;      // 模式描述
  dslSnippet: string;       // SolarWire DSL 片段
  frequency: number;        // 出现频次
  sourcePages: string[];    // 来源页面 ID
}

// ========== Knowledge Base Types ==========

export interface DesignSystemKnowledge {
  projectId: string;
  colors: ColorToken[];
  typography: TypographyToken[];
  spacing: SpacingToken[];
  borderRadius: BorderRadiusToken[];
  shadows: ShadowToken[];
  componentPatterns: ComponentPattern[];
  layoutPatterns: LayoutPattern[];
  solarwireSummaries?: SolarWireSummary[];
  solarwirePatterns?: SolarWireStructurePattern[];
  updatedAt: string;
}

export interface ColorToken {
  value: string;          // '#1a73e8' 或 'rgb(26, 115, 232)'
  usage: 'primary' | 'secondary' | 'accent' | 'background' | 'text' | 'border' | 'unknown';
  frequency: number;      // 使用次数
  sourcePages: string[];  // 来源页面ID
  isCustom?: boolean;     // 用户自定义条目标记
}

export interface TypographyToken {
  fontSize: string;       // '14px'
  fontWeight: string;     // '400' | '500' | '600' | '700'
  fontFamily: string;     // 字体族
  lineHeight: string;     // '1.5' 或 '21px'
  usage: 'heading' | 'body' | 'caption' | 'label' | 'unknown';
  frequency: number;
  sourcePages: string[];
  isCustom?: boolean;     // 用户自定义条目标记
}

export interface SpacingToken {
  value: number;          // 16
  unit: string;           // 'px'
  frequency: number;
  sourcePages: string[];
  isCustom?: boolean;     // 用户自定义条目标记
}

export interface BorderRadiusToken {
  value: string;          // '4px' | '50%' | '8px'
  frequency: number;
  sourcePages: string[];
  isCustom?: boolean;     // 用户自定义条目标记
}

export interface ShadowToken {
  value: string;          // '0 2px 8px rgba(0,0,0,0.1)'
  frequency: number;
  sourcePages: string[];
  isCustom?: boolean;     // 用户自定义条目标记
}

export interface ComponentPattern {
  name: string;           // 'card' | 'form' | 'table' | 'navbar' | 'list' | 'button' | 'input'
  description: string;    // AI 生成的组件描述
  structureHash: string;  // 结构指纹（用于快速匹配）
  typicalStyles: Record<string, string>; // 典型样式
  typicalTag: string;     // 典型 HTML 标签
  childCount: { min: number; max: number }; // 子元素数量范围
  frequency: number;      // 出现次数
  sourcePages: string[];
}

export interface LayoutPattern {
  name: string;           // 'sidebar-content' | 'full-width-list' | 'centered-form' | 'dashboard'
  description: string;
  direction: 'row' | 'column' | 'mixed';
  childCount: number;     // 直接子元素数量
  frequency: number;
  sourcePages: string[];
}


// ========== Page Hierarchy Types ==========

export interface PageHierarchy {
  [pageId: string]: string | null;  // pageId -> parentId, null 表示顶级页面
}

export interface PageHierarchyNode {
  id: string;
  name: string;
  url: string;
  parentId: string | null;
  children: PageHierarchyNode[];
  screenshotPath: string;
  hasEdited: boolean;
}

// ========== Design Knowledge Base Types ==========

export interface DesignKnowledgeBase {
  projectId: string;           // 项目ID，全局库为 'global'
  componentTemplates: ComponentTemplate[];
  interactionPatterns: InteractionPattern[];
  designPrinciples: DesignPrinciple[];
  updatedAt: string;
}

export interface ComponentTemplate {
  id: string;                  // UUID
  name: string;                // 组件名称
  description: string;         // 描述
  applicableScenes: string[];  // 适用场景
  htmlTemplate: string;        // HTML/CSS 结构模板
  previewImagePath?: string;   // 预览截图路径
  createdAt: string;
  updatedAt: string;
}

export interface InteractionPattern {
  id: string;
  name: string;                // 模式名称
  description: string;         // 描述
  triggerCondition: string;    // 触发条件
  interactionFlow: string;     // 交互流程描述
  applicableComponents: string[]; // 适用组件列表
  createdAt: string;
  updatedAt: string;
}

export interface DesignPrinciple {
  id: string;
  name: string;                // 原则名称
  description: string;         // 描述
  rules: string[];             // 具体规则列表
  createdAt: string;
  updatedAt: string;
}
