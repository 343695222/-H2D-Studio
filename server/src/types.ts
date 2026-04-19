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
