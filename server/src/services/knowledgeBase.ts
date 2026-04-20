/**
 * Knowledge Base — 知识库核心服务
 *
 * 整合设计规范提取器和模式识别器，构建项目级知识库。
 * 知识库 JSON 存储在 server/data/projects/{projectId}/knowledge.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DesignSystemKnowledge } from '../types.js';
import { getPages, getPage } from './storage.js';
import {
  extractAllDesignTokens,
  aggregateDesignTokens,
} from './designExtractor.js';
import {
  recognizeComponents,
  recognizeLayouts,
  aggregateComponentPatterns,
  aggregateLayoutPatterns,
} from './patternRecognizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

// ========== 存储 ==========

function getKnowledgePath(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId, 'knowledge.json');
}

// ========== 公开 API ==========

/**
 * 构建项目知识库 — 扫描所有页面，提取设计规范
 */
export async function buildKnowledgeBase(projectId: string): Promise<DesignSystemKnowledge> {
  const pages = getPages(projectId);
  if (pages.length === 0) {
    return createEmptyKnowledge(projectId);
  }

  // 每个页面分别提取
  const designTokensByPage = new Map<string, ReturnType<typeof extractAllDesignTokens>>();
  const componentPatternsByPage = new Map<string, ReturnType<typeof recognizeComponents>>();
  const layoutPatternsByPage = new Map<string, ReturnType<typeof recognizeLayouts>>();

  for (const pageSummary of pages) {
    const pageData = getPage(projectId, pageSummary.id);
    if (!pageData) continue;

    const tree = pageData.editedTree || pageData.captureTree;
    if (!tree || typeof tree !== 'object') continue;

    // 提取设计 Token
    const tokens = extractAllDesignTokens(tree as any);
    designTokensByPage.set(pageSummary.id, tokens);

    // 识别组件模式
    const components = recognizeComponents(tree as any, pageSummary.id);
    componentPatternsByPage.set(pageSummary.id, components);

    // 识别布局模式
    const layouts = recognizeLayouts(tree as any, pageSummary.id);
    layoutPatternsByPage.set(pageSummary.id, layouts);
  }

  // 聚合所有页面的结果
  const aggregatedTokens = aggregateDesignTokens(designTokensByPage);
  const aggregatedComponents = aggregateComponentPatterns(componentPatternsByPage);
  const aggregatedLayouts = aggregateLayoutPatterns(layoutPatternsByPage);

  const knowledge: DesignSystemKnowledge = {
    projectId,
    colors: aggregatedTokens.colors,
    typography: aggregatedTokens.typography,
    spacing: aggregatedTokens.spacing,
    borderRadius: aggregatedTokens.borderRadius,
    shadows: aggregatedTokens.shadows,
    componentPatterns: aggregatedComponents,
    layoutPatterns: aggregatedLayouts,
    updatedAt: new Date().toISOString(),
  };

  // 保存到文件
  saveKnowledgeBase(projectId, knowledge);

  return knowledge;
}

/**
 * 获取项目知识库（从缓存读取）
 */
export function getKnowledgeBase(projectId: string): DesignSystemKnowledge | null {
  const knowledgePath = getKnowledgePath(projectId);
  if (!fs.existsSync(knowledgePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(knowledgePath, 'utf-8');
    return JSON.parse(content) as DesignSystemKnowledge;
  } catch (error) {
    console.error(`Error reading knowledge base for project ${projectId}:`, error);
    return null;
  }
}

/**
 * 增量更新知识库 — 新捕获页面后调用
 */
export async function updateKnowledgeBase(projectId: string, _pageId: string): Promise<DesignSystemKnowledge> {
  // 当前实现：直接重新构建整个知识库
  // 优化方向：可以只处理新增/变更的页面，然后合并
  return buildKnowledgeBase(projectId);
}

/**
 * 重建知识库 — 保留用户自定义条目，合并自动提取条目
 *
 * 1. 读取现有知识库，提取 isCustom=true 的条目
 * 2. 重新扫描所有页面获取新的自动提取条目
 * 3. 合并：保留用户自定义条目 + 新扫描的自动条目
 */
export async function rebuildKnowledgeBase(projectId: string): Promise<DesignSystemKnowledge> {
  // 1. 读取现有知识库，提取 isCustom=true 的条目
  const existing = getKnowledgeBase(projectId);
  const customColors = existing?.colors.filter(t => t.isCustom === true) ?? [];
  const customTypography = existing?.typography.filter(t => t.isCustom === true) ?? [];
  const customSpacing = existing?.spacing.filter(t => t.isCustom === true) ?? [];
  const customBorderRadius = existing?.borderRadius.filter(t => t.isCustom === true) ?? [];
  const customShadows = existing?.shadows.filter(t => t.isCustom === true) ?? [];

  // 2. 重新扫描所有页面获取新的自动提取条目
  const freshKnowledge = await buildKnowledgeBase(projectId);

  // 3. 合并：用户自定义条目 + 新扫描的自动条目（自动条目不带 isCustom）
  const merged: DesignSystemKnowledge = {
    ...freshKnowledge,
    colors: [...customColors, ...freshKnowledge.colors.filter(t => !t.isCustom)],
    typography: [...customTypography, ...freshKnowledge.typography.filter(t => !t.isCustom)],
    spacing: [...customSpacing, ...freshKnowledge.spacing.filter(t => !t.isCustom)],
    borderRadius: [...customBorderRadius, ...freshKnowledge.borderRadius.filter(t => !t.isCustom)],
    shadows: [...customShadows, ...freshKnowledge.shadows.filter(t => !t.isCustom)],
    updatedAt: new Date().toISOString(),
  };

  // 保存合并后的知识库
  saveKnowledgeBase(projectId, merged);

  return merged;
}

/**
 * 将知识库转为 AI 可读的文本上下文
 */
export function toContextString(knowledge: DesignSystemKnowledge): string {
  const parts: string[] = [];

  // 色彩系统
  if (knowledge.colors.length > 0) {
    parts.push('## 色彩系统');
    const topColors = knowledge.colors.slice(0, 8);
    for (const color of topColors) {
      parts.push(`- ${color.usage}色: ${color.value} (使用${color.frequency}次, 来源${color.sourcePages.length}个页面)`);
    }
    parts.push('');
  }

  // 字体规范
  if (knowledge.typography.length > 0) {
    parts.push('## 字体规范');
    const topTypo = knowledge.typography.slice(0, 6);
    for (const typo of topTypo) {
      parts.push(`- ${typo.usage}: ${typo.fontSize} / ${typo.fontWeight} / ${typo.fontFamily} (使用${typo.frequency}次)`);
    }
    parts.push('');
  }

  // 间距系统
  if (knowledge.spacing.length > 0) {
    parts.push('## 间距系统');
    const topSpacing = knowledge.spacing.slice(0, 10);
    parts.push(`- 常用间距值: ${topSpacing.map(s => `${s.value}px(×${s.frequency})`).join(', ')}`);
    parts.push('');
  }

  // 圆角
  if (knowledge.borderRadius.length > 0) {
    parts.push('## 圆角');
    for (const radius of knowledge.borderRadius.slice(0, 5)) {
      parts.push(`- ${radius.value} (使用${radius.frequency}次)`);
    }
    parts.push('');
  }

  // 阴影
  if (knowledge.shadows.length > 0) {
    parts.push('## 阴影');
    for (const shadow of knowledge.shadows.slice(0, 3)) {
      parts.push(`- ${shadow.value} (使用${shadow.frequency}次)`);
    }
    parts.push('');
  }

  // 组件模式
  if (knowledge.componentPatterns.length > 0) {
    parts.push('## 组件模式');
    for (const comp of knowledge.componentPatterns.slice(0, 10)) {
      parts.push(`- ${comp.name}: ${comp.description} (出现${comp.frequency}次, 来源${comp.sourcePages.length}个页面)`);
    }
    parts.push('');
  }

  // 布局模式
  if (knowledge.layoutPatterns.length > 0) {
    parts.push('## 布局模式');
    for (const layout of knowledge.layoutPatterns.slice(0, 5)) {
      parts.push(`- ${layout.name}: ${layout.description} (出现${layout.frequency}次)`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

// ========== 内部辅助 ==========

function createEmptyKnowledge(projectId: string): DesignSystemKnowledge {
  return {
    projectId,
    colors: [],
    typography: [],
    spacing: [],
    borderRadius: [],
    shadows: [],
    componentPatterns: [],
    layoutPatterns: [],
    updatedAt: new Date().toISOString(),
  };
}

export function saveKnowledgeBase(projectId: string, knowledge: DesignSystemKnowledge): void {
  const knowledgePath = getKnowledgePath(projectId);
  const projectDir = path.dirname(knowledgePath);

  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  fs.writeFileSync(knowledgePath, JSON.stringify(knowledge, null, 2), 'utf-8');
}
