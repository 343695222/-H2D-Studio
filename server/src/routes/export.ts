import { Router } from 'express';
import { createCodeGenService, captureTreeToHTML } from '../services/codegen.js';
import { aiService } from '../services/ai.js';
import { getPage } from '../services/storage.js';

const router = Router();
const codeGenService = createCodeGenService();

// Helper to get capture tree from request
async function getCaptureTreeFromRequest(req: any): Promise<{ tree: any; page: any }> {
  const { captureTree, projectId, pageId } = req.body;
  
  // If captureTree is provided directly, use it
  if (captureTree) {
    return { tree: captureTree, page: { name: 'export', id: 'export' } };
  }
  
  // Otherwise, fetch from storage
  if (!projectId || !pageId) {
    throw new Error('Either captureTree or projectId+pageId must be provided');
  }
  
  const result = getPage(projectId, pageId);
  
  if (!result) {
    throw new Error('Page not found');
  }
  
  return { tree: result.editedTree || result.captureTree, page: result.page };
}

// POST /api/export/html - Export as HTML
router.post('/html', async (req, res) => {
  try {
    const { tree, page } = await getCaptureTreeFromRequest(req);
    const html = await codeGenService.generateHTML(page, tree);
    
    res.json({
      success: true,
      html,
      filename: `${page.name || 'export'}.html`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: 'Export failed',
      message,
    });
  }
});

// POST /api/export/json - Export as JSON
router.post('/json', async (req, res) => {
  try {
    const { tree, page } = await getCaptureTreeFromRequest(req);
    const json = await codeGenService.generateJSON(page, tree);
    
    res.json({
      success: true,
      json,
      filename: `${page.name || 'export'}.json`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: 'Export failed',
      message,
    });
  }
});

// POST /api/export/react - Export as React component
router.post('/react', async (req, res) => {
  try {
    // Check if AI is configured
    const aiConfig = aiService.getConfig();
    const useAI = aiConfig.apiKey && aiConfig.provider !== 'ollama';
    
    const { tree, page } = await getCaptureTreeFromRequest(req);
    
    if (useAI) {
      // Use AI to generate better React code
      const html = captureTreeToHTML(tree);
      const simplifiedTree = JSON.stringify(tree.root, null, 2).slice(0, 5000); // Limit size
      
      const messages = [
        { 
          role: 'system' as const, 
          content: '你是一个专业的React开发者。将以下HTML结构转换为高质量的React组件代码。保持布局和样式，使用语义化的组件结构。只输出代码，不要解释。' 
        },
        { 
          role: 'user' as const, 
          content: `请将以下HTML转换为React组件：

## HTML结构
\`\`\`html
${html}
\`\`\`

## 简化结构信息
\`\`\`json
${simplifiedTree}
\`\`\`

要求：
1. 使用函数组件
2. 保持所有样式
3. 使用语义化的HTML标签
4. 导出默认组件
5. 只输出代码，不要解释` 
        },
      ];
      
      const code = await aiService.chat(messages);
      
      res.json({
        success: true,
        code,
        filename: `${page.name || 'Component'}.jsx`,
      });
    } else {
      // Use basic code generation
      const code = await codeGenService.generateReact(page, tree);
      
      res.json({
        success: true,
        code,
        filename: `${page.name || 'Component'}.jsx`,
        message: 'AI not configured. Using basic code generation.',
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: 'Export failed',
      message,
    });
  }
});

// POST /api/export/vue - Export as Vue component
router.post('/vue', async (req, res) => {
  try {
    // Check if AI is configured
    const aiConfig = aiService.getConfig();
    const useAI = aiConfig.apiKey && aiConfig.provider !== 'ollama';
    
    const { tree, page } = await getCaptureTreeFromRequest(req);
    
    if (useAI) {
      // Use AI to generate better Vue code
      const html = captureTreeToHTML(tree);
      const simplifiedTree = JSON.stringify(tree.root, null, 2).slice(0, 5000); // Limit size
      
      const messages = [
        { 
          role: 'system' as const, 
          content: '你是一个专业的Vue开发者。将以下HTML结构转换为高质量的Vue单文件组件代码。保持布局和样式，使用语义化的组件结构。只输出代码，不要解释。' 
        },
        { 
          role: 'user' as const, 
          content: `请将以下HTML转换为Vue组件：

## HTML结构
\`\`\`html
${html}
\`\`\`

## 简化结构信息
\`\`\`json
${simplifiedTree}
\`\`\`

要求：
1. 使用Vue 3组合式API
2. 保持所有样式
3. 使用语义化的HTML标签
4. 导出默认组件
5. 只输出代码，不要解释` 
        },
      ];
      
      const code = await aiService.chat(messages);
      
      res.json({
        success: true,
        code,
        filename: `${page.name || 'Component'}.vue`,
      });
    } else {
      // Use basic code generation
      const code = await codeGenService.generateVue(page, tree);
      
      res.json({
        success: true,
        code,
        filename: `${page.name || 'Component'}.vue`,
        message: 'AI not configured. Using basic code generation.',
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: 'Export failed',
      message,
    });
  }
});

// POST /api/export/zip - Export as ZIP archive
router.post('/zip', (_req, res) => {
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: 'ZIP export functionality will be implemented in a future task',
  });
});

export default router;
