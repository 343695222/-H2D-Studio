import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { aiService } from '../services/ai.js';
import * as storage from '../services/storage.js';
import type { ProjectContext, PageKnowledgeSummary } from '../types.js';
import { getKnowledgeBase, buildKnowledgeBase, toContextString } from '../services/knowledgeBase.js';
import { getDesignKnowledgeBase, toDesignKnowledgeContextString } from '../services/designKnowledgeBase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// 递归确保所有元素节点都有 rect 属性
function ensureNodeRects(node: unknown, parentRect?: { x: number; y: number; width: number; height: number }): void {
  if (!node || typeof node !== 'object') return;
  
  const n = node as Record<string, unknown>;
  
  if (n.nodeType === 1) {
    // 元素节点：确保有 rect
    if (!n.rect || typeof n.rect !== 'object') {
      // 基于父节点或使用默认值
      const defaultX = parentRect?.x ?? 0;
      const defaultY = parentRect?.y ?? 0;
      const defaultWidth = parentRect?.width ?? 200;
      n.rect = {
        x: defaultX,
        y: defaultY,
        width: defaultWidth,
        height: 40,
        top: defaultY,
        left: defaultX,
        bottom: defaultY + 40,
        right: defaultX + defaultWidth,
      };
    }
    // 递归处理子节点
    if (Array.isArray(n.childNodes)) {
      const currentRect = n.rect as { x: number; y: number; width: number; height: number };
      for (const child of n.childNodes) {
        ensureNodeRects(child, currentRect);
      }
    }
  }
}

// 验证 CaptureTree 格式是否合法
function validateCaptureTree(tree: unknown): { valid: boolean; reason: string } {
  if (!tree || typeof tree !== 'object') {
    return { valid: false, reason: '返回值为空或非对象' };
  }

  const t = tree as Record<string, unknown>;
  const root = t.root;

  // 必须有 root 字段
  if (!root || typeof root !== 'object') {
    return { valid: false, reason: '缺少 root 字段' };
  }

  const r = root as Record<string, unknown>;

  // root 必须有 nodeType
  if (r.nodeType === undefined || r.nodeType === null) {
    return { valid: false, reason: 'root 缺少 nodeType' };
  }

  // 元素节点必须检查
  if (r.nodeType === 1) {
    if (!r.tag || typeof r.tag !== 'string') {
      return { valid: false, reason: 'root 元素节点缺少 tag' };
    }
    if (!Array.isArray(r.childNodes)) {
      return { valid: false, reason: 'root 元素节点缺少 childNodes 数组' };
    }
    if (!r.rect || typeof r.rect !== 'object') {
      return { valid: false, reason: 'root 元素节点缺少 rect' };
    }
    // 检查是否误用了非CaptureTree字段名
    const wrongFields = ['children', 'textContent', 'className'];
    const nodeStr = JSON.stringify(r).substring(0, 500);
    for (const field of wrongFields) {
      if (nodeStr.includes(`"${field}"`)) {
        return { valid: false, reason: `使用了非标准字段 "${field}"，应使用 CaptureTree 格式` };
      }
    }
  }

  // 递归检查子节点（浅层，只检查直接子节点）
  if (Array.isArray(r.childNodes)) {
    for (let i = 0; i < r.childNodes.length; i++) {
      const child = r.childNodes[i] as Record<string, unknown> | null;
      if (!child || typeof child !== 'object') continue;
      if (child.nodeType === 1) {
        if (!child.tag) {
          return { valid: false, reason: `childNodes[${i}] 元素节点缺少 tag` };
        }
        if (!Array.isArray(child.childNodes) && child.nodeType === 1) {
          return { valid: false, reason: `childNodes[${i}] 元素节点缺少 childNodes` };
        }
      } else if (child.nodeType === 3) {
        if (child.text === undefined) {
          return { valid: false, reason: `childNodes[${i}] 文本节点缺少 text` };
        }
      }
    }
  }

  return { valid: true, reason: '' };
}

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

/**
 * 从树中按 id 查找节点（深拷贝）
 */
function findNodeInTree(root: unknown, nodeId: string): unknown {
  if (!root || typeof root !== 'object') return null;
  const n = root as Record<string, unknown>;
  if (n.id === nodeId) return JSON.parse(JSON.stringify(root));
  if (Array.isArray(n.childNodes)) {
    for (const child of n.childNodes) {
      const found = findNodeInTree(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 替换树中指定 id 的节点（深拷贝），返回新树的根
 */
function replaceNodeInTree(root: unknown, nodeId: string, newNode: unknown): unknown {
  if (!root || typeof root !== 'object') return root;
  const n = root as Record<string, unknown>;
  if (n.id === nodeId) return JSON.parse(JSON.stringify(newNode));
  if (Array.isArray(n.childNodes)) {
    const updated = [...(n.childNodes as unknown[])];
    for (let i = 0; i < updated.length; i++) {
      const replaced = replaceNodeInTree(updated[i], nodeId, newNode);
      if (replaced !== updated[i]) {
        updated[i] = replaced;
        return { ...n, childNodes: updated };
      }
    }
  }
  return root;
}

/**
 * 从 requirement 文本中提取选中的节点 ID
 */
function extractSelectedNodeId(requirement: string): string | null {
  // 匹配 "请仅修改选中节点(h2d-node-xxx)" 或 "选中节点: TAG (h2d-node-xxx)"
  const match1 = requirement.match(/请仅修改选中节点\((h2d-node-[^\)]+)\)/);
  if (match1) return match1[1];
  const match2 = requirement.match(/选中节点:\s*\S+\s+\((h2d-node-[^\)]+)\)/);
  if (match2) return match2[1];
  return null;
}

/**
 * 样式合并：将原始树中节点的完整样式合并回AI修改后的树
 * 对于两个树中都存在的节点（相同id），如果AI返回的样式少于原始样式，
 * 则用原始样式补全缺失的属性
 */
function mergeStylesFromOriginal(originalTree: unknown, modifiedTree: unknown): unknown {
  if (!originalTree || !modifiedTree) return modifiedTree;
  
  // 构建 id → styles 的映射（从原始树）
  const originalStylesMap = new Map<string, Record<string, string>>();
  const originalRectsMap = new Map<string, unknown>();
  
  function collectOriginal(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.nodeType === 1 && n.id) {
      if (n.styles && typeof n.styles === 'object') {
        originalStylesMap.set(String(n.id), { ...(n.styles as Record<string, string>) });
      }
      if (n.rect) {
        originalRectsMap.set(String(n.id), n.rect);
      }
    }
    if (Array.isArray(n.childNodes)) {
      for (const child of n.childNodes) collectOriginal(child);
    }
  }
  
  const origObj = originalTree as Record<string, unknown>;
  collectOriginal(origObj.root || originalTree);
  
  // 遍历修改后的树，补全样式
  function mergeInto(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.nodeType === 1 && n.id) {
      const id = String(n.id);
      const origStyles = originalStylesMap.get(id);
      if (origStyles) {
        // 合并样式：AI返回的样式优先，但缺失的属性从原始样式补充
        const modStyles = (n.styles && typeof n.styles === 'object')
          ? n.styles as Record<string, string>
          : {};
        n.styles = { ...origStyles, ...modStyles };
      }
      // 如果AI返回的节点缺少rect，从原始树补充
      if (!n.rect) {
        const origRect = originalRectsMap.get(id);
        if (origRect) n.rect = origRect;
      }
    }
    if (Array.isArray(n.childNodes)) {
      for (const child of n.childNodes) mergeInto(child);
    }
  }
  
  const modObj = modifiedTree as Record<string, unknown>;
  mergeInto(modObj.root || modifiedTree);
  
  return modifiedTree;
}

// 精简CaptureTree以减少token消耗
function simplifyCaptureTreeForAI(tree: unknown, depth = 0, maxDepth = 3): unknown {
  if (!tree || typeof tree !== 'object') {
    return tree;
  }

  const node = tree as Record<string, unknown>;
  const simplified: Record<string, unknown> = {};

  // 保留关键字段
  const keepFields = ['nodeType', 'id', 'tag', 'text', 'rect', 'styles', 'attributes'];
  for (const field of keepFields) {
    if (node[field] !== undefined) {
      simplified[field] = node[field];
    }
  }

  // 递归处理childNodes，但限制深度和数量
  if (node.childNodes && Array.isArray(node.childNodes)) {
    const children = node.childNodes as unknown[];
    
    if (depth < maxDepth) {
      // 保留子元素（限制数量避免 token 爆炸）
      const maxChildren = depth < 2 ? 20 : 15;
      simplified.childNodes = children.slice(0, maxChildren).map((child) => 
        simplifyCaptureTreeForAI(child, depth + 1, maxDepth)
      );
      if (children.length > maxChildren) {
        simplified._truncated = `还有 ${children.length - maxChildren} 个子节点未显示`;
      }
    } else {
      // 第4层及以后：只保留数量和标签统计
      const tagCounts: Record<string, number> = {};
      let textCount = 0;
      
      for (const child of children) {
        if (typeof child === 'object' && child !== null) {
          const childNode = child as Record<string, unknown>;
          if (childNode.nodeType === 3) {
            textCount++;
          } else if (childNode.tag) {
            tagCounts[String(childNode.tag)] = (tagCounts[String(childNode.tag)] || 0) + 1;
          }
        }
      }
      
      simplified._childStats = {
        total: children.length,
        textNodes: textCount,
        tagCounts: Object.entries(tagCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5),
      };
      simplified.childNodes = []; // 清空子节点以减少大小
    }
  }

  // 保留完整的 styles 对象（不过滤），确保 AI 能看到所有样式并保持不变
  // 只在 styles 过大时（超过 80 个属性）做适当裁剪
  if (simplified.styles && typeof simplified.styles === 'object') {
    const styles = simplified.styles as Record<string, string>;
    const entries = Object.entries(styles);
    if (entries.length > 80) {
      // 保留所有非空样式，但限制总数
      const filteredStyles: Record<string, string> = {};
      const importantStyles = ['backgroundColor', 'color', 'fontSize', 'fontWeight',
        'width', 'height', 'display', 'position', 'padding', 'margin', 'borderRadius',
        'border', 'boxShadow', 'opacity', 'overflow', 'textAlign', 'lineHeight',
        'fontFamily', 'flexDirection', 'justifyContent', 'alignItems', 'gap',
        'top', 'left', 'right', 'bottom', 'zIndex', 'transform'];
      
      // 先保留重要样式
      for (const key of importantStyles) {
        if (styles[key]) filteredStyles[key] = styles[key];
      }
      // 再保留其他非空样式（最多80个）
      const otherStyles = entries
        .filter(([k]) => !importantStyles.includes(k))
        .filter(([, v]) => v && v !== '')
        .slice(0, 80 - Object.keys(filteredStyles).length);
      
      for (const [k, v] of otherStyles) {
        filteredStyles[k] = v;
      }
      simplified.styles = filteredStyles;
    }
    // 否则保留完整 styles 不做任何裁剪
  }

  // 限制attributes对象的大小
  if (simplified.attributes && typeof simplified.attributes === 'object') {
    const attrs = simplified.attributes as Record<string, string>;
    const importantAttrs = ['id', 'class', 'href', 'src', 'alt', 'type', 'placeholder'];
    const filteredAttrs: Record<string, string> = {};
    
    for (const key of importantAttrs) {
      if (attrs[key]) {
        filteredAttrs[key] = attrs[key].length > 100 ? attrs[key].slice(0, 100) + '...' : attrs[key];
      }
    }
    
    simplified.attributes = filteredAttrs;
  }

  // 限制文本长度
  if (simplified.text && typeof simplified.text === 'string') {
    if (simplified.text.length > 200) {
      simplified.text = simplified.text.slice(0, 200) + '...';
    }
  }

  return simplified;
}

// ---------------------------------------------------------------------------
// 知识库上下文注入 — 让 AI 了解项目的设计系统
// ---------------------------------------------------------------------------

/**
 * 获取项目知识库 + 设计知识库的统一 AI 可读上下文字符串。
 * 如果项目知识库不存在则自动构建；设计知识库不存在则跳过。
 */
async function getFullKnowledgeContext(projectId: string): Promise<string> {
  let projectContext = '';
  try {
    let knowledge = getKnowledgeBase(projectId);
    if (!knowledge) {
      knowledge = await buildKnowledgeBase(projectId);
    }
    projectContext = toContextString(knowledge);
  } catch (e) {
    console.warn('Failed to load project knowledge base:', e);
  }

  let designContext = '';
  try {
    const designKB = getDesignKnowledgeBase(projectId);
    if (designKB) {
      designContext = toDesignKnowledgeContextString(designKB);
    }
  } catch (e) {
    console.warn('Failed to load design knowledge base:', e);
  }

  return [projectContext, designContext].filter(Boolean).join('\n\n');
}

/**
 * 从选中节点提取布局描述（flex/grid/position 关系），
 * 让 AI 理解原有布局结构而不是凭空创建新结构。
 */
function describeNodeLayout(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  const styles = (n.styles || {}) as Record<string, string>;
  const tag = n.tag as string || 'div';
  const id = n.id as string || '';
  const children = (n.childNodes || []) as unknown[];

  const parts: string[] = [];
  parts.push(`节点: <${tag}> (${id})`);

  // 布局方式
  const display = styles.display || 'block';
  parts.push(`布局: display=${display}`);
  if (display === 'flex' || display === 'inline-flex') {
    parts.push(`  flexDirection=${styles.flexDirection || 'row'}`);
    parts.push(`  justifyContent=${styles.justifyContent || 'flex-start'}`);
    parts.push(`  alignItems=${styles.alignItems || 'stretch'}`);
    if (styles.gap) parts.push(`  gap=${styles.gap}`);
    if (styles.flexWrap) parts.push(`  flexWrap=${styles.flexWrap}`);
  }
  if (display === 'grid') {
    if (styles.gridTemplateColumns) parts.push(`  gridTemplateColumns=${styles.gridTemplateColumns}`);
    if (styles.gridTemplateRows) parts.push(`  gridTemplateRows=${styles.gridTemplateRows}`);
    if (styles.gap) parts.push(`  gap=${styles.gap}`);
  }

  // 间距
  if (styles.padding) parts.push(`padding=${styles.padding}`);
  if (styles.margin) parts.push(`margin=${styles.margin}`);

  // 子节点概览
  if (children.length > 0) {
    parts.push(`子节点 (${children.length}个):`);
    for (const child of children.slice(0, 20)) {
      const c = child as Record<string, unknown>;
      if (c.nodeType === 3) {
        const text = (c.text as string || '').slice(0, 30);
        parts.push(`  - 文本: "${text}${(c.text as string || '').length > 30 ? '...' : ''}"`);
      } else {
        const cTag = c.tag as string || 'div';
        const cId = c.id as string || '';
        const cStyles = (c.styles || {}) as Record<string, string>;
        const cChildren = (c.childNodes || []) as unknown[];
        parts.push(`  - <${cTag}> (${cId}) [${cChildren.length}个子节点] display=${cStyles.display || 'block'}`);
      }
    }
  }

  return parts.join('\n');
}

/**
 * 精简选中子树 — 比全量精简更保守，保留更多层级和细节。
 * 选中区域是用户关注的焦点，不能激进截断。
 */
function simplifySelectedSubtree(tree: unknown, depth = 0): unknown {
  if (!tree || typeof tree !== 'object') return tree;
  const node = tree as Record<string, unknown>;
  const simplified: Record<string, unknown> = {};

  // 保留所有关键字段
  const keepFields = ['nodeType', 'id', 'tag', 'text', 'rect', 'styles', 'attributes'];
  for (const field of keepFields) {
    if (node[field] !== undefined) simplified[field] = node[field];
  }

  // 选中子树保留更深的层级（6层而不是3层）
  if (node.childNodes && Array.isArray(node.childNodes)) {
    const children = node.childNodes as unknown[];
    if (depth < 6) {
      // 保留所有子元素（不限制数量）
      simplified.childNodes = children.map((child) =>
        simplifySelectedSubtree(child, depth + 1)
      );
    } else {
      // 第7层及以后：只保留统计
      simplified._childStats = { total: children.length };
      simplified.childNodes = [];
    }
  }

  // 保留完整 styles（不裁剪）
  // 限制 attributes 和 text 长度
  if (simplified.attributes && typeof simplified.attributes === 'object') {
    const attrs = simplified.attributes as Record<string, string>;
    const important = ['id', 'class', 'href', 'src', 'alt', 'type', 'placeholder'];
    const filtered: Record<string, string> = {};
    for (const key of important) {
      if (attrs[key]) filtered[key] = attrs[key].length > 100 ? attrs[key].slice(0, 100) + '...' : attrs[key];
    }
    simplified.attributes = filtered;
  }
  if (simplified.text && typeof simplified.text === 'string' && (simplified.text as string).length > 200) {
    simplified.text = (simplified.text as string).slice(0, 200) + '...';
  }

  return simplified;
}

// Helper: 获取项目PRD目录
function getProjectPrdDir(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId, 'prd');
}

// Helper: 确保PRD目录存在
function ensurePrdDir(projectId: string): void {
  const prdDir = getProjectPrdDir(projectId);
  if (!fs.existsSync(prdDir)) {
    fs.mkdirSync(prdDir, { recursive: true });
  }
}

// POST /api/ai/generate-prd
// Body: { projectId: string, requirement: string, skillName?: string }
router.post('/generate-prd', async (req, res) => {
  try {
    const { projectId, requirement, skillName } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: projectId',
      });
    }

    if (!requirement || typeof requirement !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: requirement',
      });
    }

    // 1. 获取项目信息
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // 2. 获取所有页面摘要
    const pages = storage.getPages(projectId);
    if (pages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Project has no pages',
      });
    }

    // 3. 组装ProjectContext
    const projectContext: ProjectContext = {
      projectName: project.name,
      projectDescription: project.description,
      pages: pages
        .map((p) => p.knowledgeSummary)
        .filter((s): s is PageKnowledgeSummary => s !== undefined),
    };

    // 3.5 获取知识库上下文，注入到 requirement 中
    let enrichedRequirement = requirement;
    try {
      const knowledgeContext = await getFullKnowledgeContext(projectId);
      if (knowledgeContext) {
        enrichedRequirement = `${requirement}\n\n[项目设计规范 — 从已捕获页面中提取]\n${knowledgeContext}\n\n请在 PRD 中参考以上设计规范，确保新功能的视觉风格与现有页面一致。`;
      }
    } catch (e) { /* 知识库不可用时继续 */ }

    // 4. 调用 aiService.generatePRD()
    let prdResult: { markdown: string; modifications: unknown };
    try {
      prdResult = await aiService.generatePRD(projectContext, enrichedRequirement, skillName);
    } catch (aiError) {
      const aiErrorMessage = aiError instanceof Error ? aiError.message : String(aiError);
      console.error('AI service error during PRD generation:', aiErrorMessage);
      return res.status(500).json({
        success: false,
        error: 'AI 服务调用失败',
        message: aiErrorMessage.includes('API Key') ? '请先在设置页面配置 AI API Key' : aiErrorMessage,
      });
    }

    // 5. 将PRD保存到 server/data/projects/{projectId}/prd/latest.md
    ensurePrdDir(projectId);
    const prdPath = path.join(getProjectPrdDir(projectId), 'latest.md');
    fs.writeFileSync(prdPath, prdResult.markdown, 'utf-8');

    // 6. 返回结果
    res.json({
      success: true,
      data: prdResult,
    });
  } catch (error) {
    console.error('Error generating PRD:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PRD',
      message: errorMessage,
    });
  }
});

// POST /api/ai/analyze-modifications
// Body: { projectId: string, prd: string }
router.post('/analyze-modifications', async (req, res) => {
  try {
    const { projectId, prd } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: projectId',
      });
    }

    if (!prd || typeof prd !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: prd',
      });
    }

    // 1. 获取项目所有页面摘要
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    const pages = storage.getPages(projectId);
    const pageSummaries = pages
      .map((p) => p.knowledgeSummary)
      .filter((s): s is PageKnowledgeSummary => s !== undefined);

    // 2. 调用 aiService.analyzeModifications()
    const plan = await aiService.analyzeModifications(prd, pageSummaries);

    // 3. 返回结果
    res.json({
      success: true,
      plan,
    });
  } catch (error) {
    console.error('Error analyzing modifications:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze modifications',
      message: errorMessage,
    });
  }
});

// POST /api/ai/generate-modified
// Body: { projectId: string, pageId: string, requirement: string, captureTree?: CaptureTree }
router.post('/generate-modified', async (req, res) => {
  try {
    const { projectId, pageId, requirement, captureTree: providedTree, modifications } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: projectId',
      });
    }

    if (!pageId || typeof pageId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: pageId',
      });
    }

    // 1. 获取页面的captureTree（从请求体或从存储中读取）
    let currentTree = providedTree;
    if (!currentTree) {
      const pageData = storage.getPage(projectId, pageId);
      if (!pageData) {
        return res.status(404).json({
          success: false,
          error: 'Page not found',
        });
      }
      currentTree = pageData.captureTree;
    }

    // 2. 获取项目风格上下文
    const pages = storage.getPages(projectId);
    const pageSummaries = pages
      .map((p) => p.knowledgeSummary)
      .filter((s): s is PageKnowledgeSummary => s !== undefined);
    const styleContext = await aiService.extractStyleContext(pageSummaries);

    let modifiedTree: unknown;
    let explanation: string;

    // 如果有自然语言需求，使用新的自然语言处理方式
    if (requirement && typeof requirement === 'string') {
      // 检测用户是否选中了特定区域 → 使用范围编辑模式
      const hasSelectedArea = requirement.includes('用户选中了以下区域进行修改');
      const selectedNodeId = hasSelectedArea ? extractSelectedNodeId(requirement) : null;

      const treeObj = currentTree as Record<string, unknown>;
      const rootNode = treeObj.root || currentTree;

      // --- 范围编辑模式：只发送选中子树给 AI，返回后合并回原树 ---
      if (hasSelectedArea && selectedNodeId) {
        // 提取选中节点的子树
        const selectedSubtree = findNodeInTree(rootNode, selectedNodeId);
        if (selectedSubtree) {
          // 不做深度截断——传完整子树给 AI，只精简兄弟节点
          const simplifiedSubtree = simplifySelectedSubtree(selectedSubtree);

          // 获取知识库上下文
          let knowledgeContext = '';
          try {
            knowledgeContext = await getFullKnowledgeContext(projectId);
          } catch (e) { /* 知识库不可用时继续 */ }

          // 提取选中节点的布局信息，帮助 AI 理解原始结构
          const subtreeObj = selectedSubtree as Record<string, unknown>;
          const subtreeStyles = (subtreeObj.styles || {}) as Record<string, string>;
          const layoutInfo = [
            subtreeStyles.display ? `display: ${subtreeStyles.display}` : null,
            subtreeStyles.flexDirection ? `flexDirection: ${subtreeStyles.flexDirection}` : null,
            subtreeStyles.justifyContent ? `justifyContent: ${subtreeStyles.justifyContent}` : null,
            subtreeStyles.alignItems ? `alignItems: ${subtreeStyles.alignItems}` : null,
            subtreeStyles.gap ? `gap: ${subtreeStyles.gap}` : null,
            subtreeStyles.padding ? `padding: ${subtreeStyles.padding}` : null,
            subtreeStyles.position ? `position: ${subtreeStyles.position}` : null,
            subtreeStyles.gridTemplateColumns ? `gridTemplateColumns: ${subtreeStyles.gridTemplateColumns}` : null,
          ].filter(Boolean).join(', ');

          // 统计子节点信息
          const childNodes = (subtreeObj.childNodes || []) as unknown[];
          const childSummary = childNodes.map((c: unknown, i: number) => {
            const cn = c as Record<string, unknown>;
            if (cn.nodeType === 3) return `  [${i}] 文本: "${String(cn.text || '').slice(0, 30)}"`;
            return `  [${i}] <${cn.tag}> id=${cn.id} (${Math.round((cn.rect as any)?.width || 0)}×${Math.round((cn.rect as any)?.height || 0)})`;
          }).join('\n');

          const scopedSystemPrompt = `你是一个网页原型编辑助手。用户选中了页面的一个组件区域，你需要在这个组件的**现有结构基础上**做增量修改。

⚠️ 核心原则 — 增量修改，不要重建：
1. **必须保留所有现有节点的 id**，绝对不要删除或替换已有节点
2. 如果需要新增元素，在现有 childNodes 数组中插入新节点，新节点用 "h2d-node-new-xxx" 格式的 id
3. 如果需要修改某个节点的样式，只修改需要变更的 styles 属性，其他属性原样保留
4. 如果需要调整布局，修改父节点的 display/flexDirection/gap 等布局属性，不要重建子节点
5. 根节点的 id、tag、rect 必须保持不变

当前组件的布局结构：${layoutInfo || '未知'}
当前组件有 ${childNodes.length} 个直接子节点：
${childSummary}

节点格式规则:
- 元素节点: { "nodeType": 1, "id": "xxx", "tag": "DIV", "styles": {...}, "rect": {...}, "childNodes": [...], "attributes": {...} }
- 文本节点: { "nodeType": 3, "id": "xxx", "text": "文本内容", "rect": {...} }
- 使用 "childNodes" 不要用 "children"，使用 "text" 不要用 "textContent"

${knowledgeContext ? `\n项目设计规范（知识库）：\n${knowledgeContext}\n请严格遵循以上设计规范，新增元素的样式必须与现有设计风格一致。` : ''}

输出格式:
1. 首先用自然语言简要说明做了哪些修改（说明修改了哪些节点、新增了哪些节点）
2. 然后用\`\`\`json\`\`\`包裹返回修改后的子树JSON（不需要外层 root/documentTitle 包裹）`;

          // 从 requirement 中提取用户的实际需求（去掉上下文前缀）
          const userNeedMatch = requirement.match(/用户需求:\s*([\s\S]+)$/);
          const userNeed = userNeedMatch ? userNeedMatch[1].trim() : requirement;

          const scopedUserPrompt = `选中的组件完整结构:
\`\`\`json
${JSON.stringify(simplifiedSubtree, null, 2)}
\`\`\`

用户需求: ${userNeed}

风格约束:
- 主色调: ${styleContext.primaryColors.join(', ') || '保持原样'}
- 字体: ${styleContext.fonts.join(', ') || '保持原样'}
- 圆角: ${styleContext.borderRadius || '保持原样'}
- 间距: ${styleContext.spacing || '保持原样'}

请在现有结构基础上做增量修改，保留所有现有节点的 id，返回修改后的子树JSON。`;

          const aiResult = await aiService.chat([
            { role: 'system', content: scopedSystemPrompt },
            { role: 'user', content: scopedUserPrompt },
          ]);

          // 提取 AI 返回的 JSON（可能是子树，不需要外层 root 包裹）
          const jsonMatch = aiResult.match(/```json\s*([\s\S]*?)\s*```/);
          let aiModifiedNode: unknown = null;
          if (jsonMatch) {
            try { aiModifiedNode = JSON.parse(jsonMatch[1]); } catch { /* ignore */ }
          }
          if (!aiModifiedNode) {
            try { aiModifiedNode = JSON.parse(aiResult); } catch { /* ignore */ }
          }

          explanation = aiResult.split('```json')[0].trim() || '已根据您的需求修改选中区域';

          if (aiModifiedNode && typeof aiModifiedNode === 'object') {
            // 将修改后的子树替换回原树
            const newRoot = replaceNodeInTree(rootNode, selectedNodeId, aiModifiedNode);
            modifiedTree = treeObj.root
              ? { ...treeObj, root: newRoot }
              : newRoot;

            // 确保节点有 rect
            const mo = modifiedTree as Record<string, unknown>;
            if (mo.root && typeof mo.root === 'object') {
              ensureNodeRects(mo.root);
            }
            // 样式合并保护
            modifiedTree = mergeStylesFromOriginal(currentTree, modifiedTree);
          } else {
            modifiedTree = currentTree;
            explanation += '\n\n⚠️ AI 返回的内容无法解析，已保持原始结构。';
          }
        } else {
          // 未找到选中节点，退回全量模式
          console.warn(`Selected node ${selectedNodeId} not found in tree, falling back to full edit`);
          modifiedTree = currentTree;
          explanation = '未找到选中的节点，请重新选择后重试。';
        }
      } else {
        // --- 全量编辑模式（无选中区域时的原有逻辑） ---
        const simplifiedRoot = simplifyCaptureTreeForAI(rootNode);
        const simplifiedTree = treeObj.root
          ? { root: simplifiedRoot, documentTitle: treeObj.documentTitle || '' }
          : simplifiedRoot;

        // 获取知识库上下文
        let knowledgeContext = '';
        try {
          knowledgeContext = await getFullKnowledgeContext(projectId);
        } catch (e) { /* 知识库不可用时继续 */ }

        const systemPrompt = `你是一个网页原型编辑助手。用户会给你一个网页的组件结构(JSON)和修改需求。
请根据需求修改JSON结构并返回修改后的完整JSON。

⚠️ 核心原则 — 增量修改：
- 必须保留所有现有节点的 id，不要删除或替换已有节点
- 对于未修改的节点，必须完整保留其原始 styles 对象中的所有属性
- 对于被修改的节点，只修改用户要求的样式属性，其他样式属性必须原样保留
- 新增节点用 "h2d-node-new-xxx" 格式的 id

节点格式规则:
1. 每个元素节点必须包含: { "nodeType": 1, "id": "h2d-node-xxx", "tag": "DIV", "styles": {...}, "rect": {...}, "childNodes": [...] }
2. 每个文本节点必须包含: { "nodeType": 3, "id": "h2d-node-xxx", "text": "文本内容" }
3. 样式用 "styles" 对象（camelCase），子节点用 "childNodes" 数组
4. 不要使用 "children"、"textContent"、"className" 等字段
5. 结果必须包含在 { "root": {...}, "documentTitle": "..." } 外层结构中

${knowledgeContext ? `项目设计规范（知识库）：\n${knowledgeContext}\n请严格遵循以上设计规范。` : ''}

输出格式:
1. 首先用自然语言简要说明做了哪些修改
2. 然后用\`\`\`json\`\`\`包裹返回修改后的完整JSON结构`;

        const userPrompt = `当前页面结构(已精简):
\`\`\`json
${JSON.stringify(simplifiedTree, null, 2)}
\`\`\`

用户需求: ${requirement}

风格约束:
- 主色调: ${styleContext.primaryColors.join(', ') || '保持原样'}
- 字体: ${styleContext.fonts.join(', ') || '保持原样'}
- 圆角: ${styleContext.borderRadius || '保持原样'}
- 间距: ${styleContext.spacing || '保持原样'}

请返回修改后的JSON结构，用\`\`\`json\`\`\`包裹。同时简要说明你做了哪些修改。`;

        const aiResult = await aiService.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ]);

        const jsonMatch = aiResult.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          try { modifiedTree = JSON.parse(jsonMatch[1]); } catch {
            modifiedTree = currentTree;
          }
        } else {
          try { modifiedTree = JSON.parse(aiResult); } catch {
            modifiedTree = currentTree;
          }
        }

        explanation = aiResult.split('```json')[0].trim() || '已根据您的需求修改页面结构';

        const validationResult = validateCaptureTree(modifiedTree);
        if (!validationResult.valid) {
          console.warn('AI returned invalid CaptureTree format:', validationResult.reason, 'Keys:', Object.keys(modifiedTree as Record<string, unknown>));
          modifiedTree = currentTree;
          explanation += `\n\n⚠️ AI返回的结构格式不符合要求(${validationResult.reason})，已保持原始结构。请重新描述您的需求。`;
        } else {
          const treeObj = modifiedTree as Record<string, unknown>;
          if (treeObj.root && typeof treeObj.root === 'object') {
            ensureNodeRects(treeObj.root);
          }
          modifiedTree = mergeStylesFromOriginal(currentTree, modifiedTree);
        }
      }
    } else if (modifications && Array.isArray(modifications)) {
      // 使用原有的modifications方式（向后兼容）
      modifiedTree = await aiService.generateModifiedStructure(
        currentTree,
        modifications,
        styleContext
      );
      explanation = '已应用指定的修改';
    } else {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: requirement (string) or modifications (array)',
      });
    }

    // 4. 返回结果（不直接保存edited.json，等前端确认应用后再保存）
    res.json({
      success: true,
      data: {
        modifiedTree,
        explanation,
      },
    });
  } catch (error) {
    console.error('Error generating modified structure:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Full error details:', JSON.stringify({ message: errorMessage, stack: (error as Error)?.stack?.split('\n').slice(0, 5) }));
    res.status(500).json({
      success: false,
      error: 'Failed to generate modified structure',
      message: errorMessage,
    });
  }
});

// POST /api/ai/test-connection
// 测试AI连接
router.post('/test-connection', async (_req, res) => {
  try {
    const result = await aiService.testConnection();
    res.json(result);
  } catch (error) {
    console.error('Error testing AI connection:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      message: `Connection test failed: ${errorMessage}`,
    });
  }
});

// 保留旧的路由以保持向后兼容
// POST /api/ai/chat - Chat with AI (简化版)
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: message',
      });
    }

    const result = await aiService.chat([
      { role: 'user', content: message },
    ]);

    res.json({
      success: true,
      response: result,
    });
  } catch (error) {
    console.error('Error in AI chat:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: 'AI chat failed',
      message: errorMessage,
    });
  }
});

// POST /api/ai/generate-code - Generate code from design
router.post('/generate-code', async (req, res) => {
  try {
    const { designData, options } = req.body;

    // 使用generateModifiedStructure作为代码生成的基础
    const styleContext = {
      primaryColors: [],
      fonts: [],
      borderRadius: '4px',
      spacing: '16px',
    };

    const result = await aiService.generateModifiedStructure(
      designData,
      [],
      styleContext
    );

    res.json({
      success: true,
      code: JSON.stringify(result, null, 2),
    });
  } catch (error) {
    console.error('Error generating code:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: 'Code generation failed',
      message: errorMessage,
    });
  }
});

// POST /api/ai/analyze - Analyze page design
router.post('/analyze', async (req, res) => {
  try {
    const { pageData } = req.body;

    const styleContext = await aiService.extractStyleContext([
      pageData?.knowledgeSummary,
    ].filter(Boolean));

    res.json({
      success: true,
      analysis: {
        styleContext,
        summary: '页面分析完成',
      },
    });
  } catch (error) {
    console.error('Error analyzing design:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: 'Design analysis failed',
      message: errorMessage,
    });
  }
});

// POST /api/ai/edit-node
// Body: { node: object, requirement: string, editType: 'style' | 'content' | 'layout' | 'free', projectId?: string }
router.post('/edit-node', async (req, res) => {
  try {
    const { node, requirement, editType, projectId } = req.body;

    if (!node || typeof node !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing node data' });
    }
    if (!requirement || typeof requirement !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing requirement' });
    }

    // 获取知识库上下文（如果提供了 projectId）
    let knowledgeContext = '';
    if (projectId) {
      try {
        knowledgeContext = await getFullKnowledgeContext(projectId);
      } catch (e) { /* 知识库不可用时继续 */ }
    }

    // 提取节点的布局信息
    const nodeObj = node as Record<string, unknown>;
    const nodeStyles = (nodeObj.styles || {}) as Record<string, string>;
    const layoutDesc = [
      nodeStyles.display ? `display: ${nodeStyles.display}` : null,
      nodeStyles.flexDirection ? `flexDirection: ${nodeStyles.flexDirection}` : null,
      nodeStyles.justifyContent ? `justifyContent: ${nodeStyles.justifyContent}` : null,
      nodeStyles.alignItems ? `alignItems: ${nodeStyles.alignItems}` : null,
      nodeStyles.gap ? `gap: ${nodeStyles.gap}` : null,
    ].filter(Boolean).join(', ');

    const systemPrompt = `你是一个网页原型编辑助手。用户会给你一个网页元素的结构(JSON)和修改需求。

⚠️ 核心原则 — 增量修改：
1. **必须保留节点的 id 和 nodeType 不变**
2. 只修改用户要求的属性，其他属性原样保留
3. 如果需要新增子节点，在 childNodes 数组中插入，新节点用 "h2d-node-new-xxx" 格式的 id
4. 不要删除或替换已有的子节点

${editType === 'style' ? '专注于修改CSS样式属性（styles对象中的值）。保持布局结构不变。' : ''}
${editType === 'content' ? '专注于修改文本内容（text字段）和语义相关的属性。保持样式和布局不变。' : ''}
${editType === 'layout' ? `专注于修改布局相关属性。当前布局: ${layoutDesc || '未知'}。调整 display/flexDirection/justifyContent/alignItems/gap/margin/padding 等属性。` : ''}
${editType === 'free' ? '根据用户需求自由修改，但必须保留所有现有节点的 id。' : ''}

${knowledgeContext ? `项目设计规范：\n${knowledgeContext}\n新增或修改的元素必须遵循以上设计规范。` : ''}

输出规则：
1. 返回完整的JSON节点结构，格式与输入相同
2. 用\`\`\`json\`\`\`包裹返回的JSON
3. 在JSON之后，用一句话简要说明你做了哪些修改
4. 使用驼峰命名法的CSS属性名`;

    const userPrompt = `当前元素结构：
\`\`\`json
${JSON.stringify(node, null, 2)}
\`\`\`

修改需求：${requirement}

请在现有结构基础上做增量修改，返回修改后的JSON结构。`;

    const aiResponse = await aiService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    // 解析AI响应：提取JSON和说明文字
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);
    let modifiedNode = node; // 默认返回原节点
    let explanation = '未能解析AI响应';

    if (jsonMatch) {
      try {
        modifiedNode = JSON.parse(jsonMatch[1]);
        // 提取JSON后面的说明文字
        const afterJson = aiResponse.substring(aiResponse.lastIndexOf('```') + 3).trim();
        explanation = afterJson || '修改已完成';
      } catch {
        explanation = '解析AI返回的JSON失败';
      }
    } else {
      explanation = 'AI未返回有效的JSON结构';
    }

    res.json({
      success: true,
      data: { modifiedNode, explanation }
    });
  } catch (error) {
    console.error('Error in AI edit-node:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: errorMessage.includes('API Key') ? '请先在设置页面配置 AI API Key' : `AI 编辑失败: ${errorMessage}`
    });
  }
});

// ========== Design Workflow 端点 ==========

// POST /api/ai/design-workflow/start
router.post('/design-workflow/start', async (req, res) => {
  try {
    const { projectId, pageId, selectedNodeId, selectedNodeContext, pageContext, requirement } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: projectId' });
    }
    if (!pageId || typeof pageId !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: pageId' });
    }
    if (!selectedNodeId || typeof selectedNodeId !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: selectedNodeId' });
    }
    if (!requirement || typeof requirement !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: requirement' });
    }

    // 获取知识库上下文注入到设计工作流
    let knowledgeContext = '';
    try {
      knowledgeContext = await getFullKnowledgeContext(projectId);
    } catch (e) { /* 知识库不可用时继续 */ }

    // 延迟加载 designAgentService，防止初始化失败影响其他路由
    const { designAgentService } = await import('../services/designAgent.js');
    const result = await designAgentService.startWorkflow({
      projectId,
      pageId,
      selectedNodeId,
      selectedNodeContext: selectedNodeContext || '',
      pageContext: pageContext || '',
      requirement: knowledgeContext
        ? `${requirement}\n\n[项目设计规范]\n${knowledgeContext}`
        : requirement,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error starting design workflow:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to start design workflow' });
  }
});

// POST /api/ai/design-workflow/:sessionId/message
router.post('/design-workflow/:sessionId/message', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: message' });
    }

    const { designAgentService } = await import('../services/designAgent.js');
    const result = await designAgentService.sendMessage(req.params.sessionId, message);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error in design workflow message:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to process message' });
  }
});

// POST /api/ai/design-workflow/:sessionId/advance
router.post('/design-workflow/:sessionId/advance', async (req, res) => {
  try {
    const { designAgentService } = await import('../services/designAgent.js');
    const result = await designAgentService.advanceToDesign(req.params.sessionId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error advancing design workflow:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to advance workflow' });
  }
});

export default router;
