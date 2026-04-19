import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { aiService } from '../services/ai.js';
import * as storage from '../services/storage.js';
import type { ProjectContext, PageKnowledgeSummary } from '../types.js';

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

// 精简CaptureTree以减少token消耗
function simplifyCaptureTreeForAI(tree: unknown, depth = 0): unknown {
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
    
    // 只保留前3层的完整结构，更深层只保留统计信息
    if (depth < 3) {
      // 前3层：保留前15个子元素
      simplified.childNodes = children.slice(0, 15).map((child) => 
        simplifyCaptureTreeForAI(child, depth + 1)
      );
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

  // 限制styles对象的大小
  if (simplified.styles && typeof simplified.styles === 'object') {
    const styles = simplified.styles as Record<string, string>;
    const importantStyles = ['backgroundColor', 'color', 'fontSize', 'fontWeight', 
      'width', 'height', 'display', 'position', 'padding', 'margin', 'borderRadius'];
    const filteredStyles: Record<string, string> = {};
    
    for (const key of importantStyles) {
      if (styles[key]) {
        filteredStyles[key] = styles[key];
      }
    }
    
    // 保留其他非空样式（限制数量）
    const otherStyles = Object.entries(styles)
      .filter(([k]) => !importantStyles.includes(k))
      .filter(([, v]) => v && v !== '0' && v !== 'none' && v !== 'auto')
      .slice(0, 10);
    
    for (const [k, v] of otherStyles) {
      filteredStyles[k] = v;
    }
    
    simplified.styles = filteredStyles;
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

    // 4. 调用 aiService.generatePRD()
    let prdResult: { markdown: string; modifications: unknown };
    try {
      prdResult = await aiService.generatePRD(projectContext, requirement, skillName);
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
      // 3a. 精简CaptureTree以减少token消耗
      // CaptureTree structure is { root: {...}, documentTitle: "..." }
      // We need to simplify root, not the wrapper
      const treeObj = currentTree as Record<string, unknown>;
      const rootNode = treeObj.root || currentTree;
      const simplifiedRoot = simplifyCaptureTreeForAI(rootNode);
      const simplifiedTree = treeObj.root 
        ? { root: simplifiedRoot, documentTitle: treeObj.documentTitle || '' }
        : simplifiedRoot;
      
      // 3b. 构造AI prompt
      const systemPrompt = `你是一个网页原型编辑助手。用户会给你一个网页的组件结构(JSON)和修改需求。
请根据需求修改JSON结构并返回修改后的完整JSON。只修改需要变更的部分，保持其余结构不变。

重要规则 - 必须严格遵循的节点格式:
1. 每个元素节点必须包含: { "nodeType": 1, "id": "h2d-node-xxx", "tag": "DIV", "styles": {...}, "rect": {...}, "childNodes": [...] }
2. 每个文本节点必须包含: { "nodeType": 3, "id": "h2d-node-xxx", "text": "文本内容" }
3. 样式用 "styles" 对象（camelCase），子节点用 "childNodes" 数组
4. 保持所有现有节点的 id 不变
5. 新增节点用 "h2d-node-new-xxx" 格式的 id
6. 结果必须包含在 { "root": {...}, "documentTitle": "..." } 外层结构中
7. 不要使用 "children"、"textContent"、"className" 等字段，必须用 "childNodes"、"text"、"attributes"

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

      // 3c. 调用AI chat
      const aiResult = await aiService.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      // 3d. 今AI响应中提取修改后的JSON和说明文字
      const jsonMatch = aiResult.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          modifiedTree = JSON.parse(jsonMatch[1]);
        } catch {
          console.warn('Failed to parse AI response JSON, using original tree');
          modifiedTree = currentTree;
        }
      } else {
        try {
          modifiedTree = JSON.parse(aiResult);
        } catch {
          modifiedTree = currentTree;
        }
      }
      
      // 提取说明文字（JSON之前的部分）
      explanation = aiResult.split('```json')[0].trim() || '已根据您的需求修改页面结构';
            
      // 严格验证AI返回的结构是否符合CaptureTree格式
      const validationResult = validateCaptureTree(modifiedTree);
      if (!validationResult.valid) {
        console.warn('AI returned invalid CaptureTree format:', validationResult.reason, 'Keys:', Object.keys(modifiedTree as Record<string, unknown>));
        modifiedTree = currentTree;
        explanation += `\n\n⚠️ AI返回的结构格式不符合要求(${validationResult.reason})，已保持原始结构。请重新描述您的需求。`;
      } else {
        // 验证通过后，确保所有节点都有 rect
        const treeObj = modifiedTree as Record<string, unknown>;
        if (treeObj.root && typeof treeObj.root === 'object') {
          ensureNodeRects(treeObj.root);
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
// Body: { node: object, requirement: string, editType: 'style' | 'content' | 'layout' | 'free' }
router.post('/edit-node', async (req, res) => {
  try {
    const { node, requirement, editType } = req.body;

    if (!node || typeof node !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing node data' });
    }
    if (!requirement || typeof requirement !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing requirement' });
    }

    // 构造AI提示
    const systemPrompt = `你是一个网页原型编辑助手。用户会给你一个网页元素的结构(JSON)和修改需求。
请根据需求修改JSON结构中的相关属性（styles、text、rect、childNodes等），并返回修改后的完整JSON。
只修改需要变更的部分，保持其余结构不变。
${editType === 'style' ? '专注于修改CSS样式属性（styles对象中的值）。' : ''}
${editType === 'content' ? '专注于修改文本内容（text字段）和语义相关的属性。' : ''}
${editType === 'layout' ? '专注于修改布局相关属性（display、flexDirection、justifyContent、alignItems、gap、margin、padding等）。' : ''}

重要规则：
1. 返回完整的JSON节点结构，格式与输入相同
2. 用\`\`\`json\`\`\`包裹返回的JSON
3. 在JSON之后，用一句话简要说明你做了哪些修改
4. 不要改变节点的id和nodeType
5. 不要添加不存在的CSS属性名，使用驼峰命名法`;

    const userPrompt = `当前元素结构：
\`\`\`json
${JSON.stringify(node, null, 2)}
\`\`\`

修改需求：${requirement}

请返回修改后的JSON结构。`;

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

    // 延迟加载 designAgentService，防止初始化失败影响其他路由
    const { designAgentService } = await import('../services/designAgent.js');
    const result = await designAgentService.startWorkflow({
      projectId,
      pageId,
      selectedNodeId,
      selectedNodeContext: selectedNodeContext || '',
      pageContext: pageContext || '',
      requirement,
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
