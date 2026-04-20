/**
 * Knowledge API Routes — 知识库 API 路由
 *
 * GET    /api/knowledge/:projectId                          — 获取项目知识库
 * POST   /api/knowledge/:projectId/rebuild                  — 重新构建知识库
 * POST   /api/knowledge/:projectId/update                   — 增量更新（指定页面）
 * GET    /api/knowledge/:projectId/context                  — 获取 AI 可读的文本上下文
 * PUT    /api/knowledge/:projectId/tokens/:tokenType/:index — 编辑 Design Token
 * POST   /api/knowledge/:projectId/tokens/:tokenType        — 添加 Design Token
 * DELETE /api/knowledge/:projectId/tokens/:tokenType/:index — 删除 Design Token
 * POST   /api/knowledge/:projectId/rescan                   — 重新扫描（保留自定义条目）
 */

import { Router } from 'express';
import {
  buildKnowledgeBase,
  getKnowledgeBase,
  updateKnowledgeBase,
  rebuildKnowledgeBase,
  saveKnowledgeBase,
  toContextString,
} from '../services/knowledgeBase.js';
import { getProject } from '../services/storage.js';

const VALID_TOKEN_TYPES = ['colors', 'typography', 'spacing', 'borderRadius', 'shadows'] as const;
type TokenType = typeof VALID_TOKEN_TYPES[number];

const router = Router();

// GET /api/knowledge/:projectId — 获取项目知识库
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    // 验证项目存在
    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    // 获取缓存的知识库
    let knowledge = getKnowledgeBase(projectId);

    // 如果没有缓存，自动构建
    if (!knowledge) {
      knowledge = await buildKnowledgeBase(projectId);
    }

    res.json({ success: true, data: knowledge });
  } catch (error: any) {
    console.error('Error getting knowledge base:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get knowledge base' });
  }
});

// POST /api/knowledge/:projectId/rebuild — 重新构建知识库
router.post('/:projectId/rebuild', async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const knowledge = await buildKnowledgeBase(projectId);
    res.json({ success: true, data: knowledge });
  } catch (error: any) {
    console.error('Error rebuilding knowledge base:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to rebuild knowledge base' });
  }
});

// POST /api/knowledge/:projectId/update — 增量更新
router.post('/:projectId/update', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { pageId } = req.body;

    if (!pageId) {
      res.status(400).json({ success: false, error: 'pageId is required' });
      return;
    }

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const knowledge = await updateKnowledgeBase(projectId, pageId);
    res.json({ success: true, data: knowledge });
  } catch (error: any) {
    console.error('Error updating knowledge base:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update knowledge base' });
  }
});

// GET /api/knowledge/:projectId/context — 获取 AI 可读的文本上下文
router.get('/:projectId/context', async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    let knowledge = getKnowledgeBase(projectId);
    if (!knowledge) {
      knowledge = await buildKnowledgeBase(projectId);
    }

    const context = toContextString(knowledge);
    res.json({ success: true, data: { context } });
  } catch (error: any) {
    console.error('Error getting knowledge context:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get knowledge context' });
  }
});

// PUT /api/knowledge/:projectId/tokens/:tokenType/:index — 编辑 Design Token
router.put('/:projectId/tokens/:tokenType/:index', async (req, res) => {
  try {
    const { projectId, tokenType, index: indexStr } = req.params;

    // 验证 tokenType
    if (!VALID_TOKEN_TYPES.includes(tokenType as TokenType)) {
      res.status(400).json({ success: false, error: `Invalid tokenType: ${tokenType}. Must be one of: ${VALID_TOKEN_TYPES.join(', ')}` });
      return;
    }

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    let knowledge = getKnowledgeBase(projectId);
    if (!knowledge) {
      knowledge = await buildKnowledgeBase(projectId);
    }

    const idx = parseInt(indexStr, 10);
    const tokenArray = knowledge[tokenType as TokenType] as any[];

    if (isNaN(idx) || idx < 0 || idx >= tokenArray.length) {
      res.status(404).json({ success: false, error: `Token index ${indexStr} out of bounds (0-${tokenArray.length - 1})` });
      return;
    }

    // Partial update: merge body fields into existing token, mark as custom
    tokenArray[idx] = { ...tokenArray[idx], ...req.body, isCustom: true };
    knowledge.updatedAt = new Date().toISOString();
    saveKnowledgeBase(projectId, knowledge);

    res.json({ success: true, data: tokenArray[idx] });
  } catch (error: any) {
    console.error('Error editing token:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to edit token' });
  }
});

// POST /api/knowledge/:projectId/tokens/:tokenType — 添加 Design Token
router.post('/:projectId/tokens/:tokenType', async (req, res) => {
  try {
    const { projectId, tokenType } = req.params;

    if (!VALID_TOKEN_TYPES.includes(tokenType as TokenType)) {
      res.status(400).json({ success: false, error: `Invalid tokenType: ${tokenType}. Must be one of: ${VALID_TOKEN_TYPES.join(', ')}` });
      return;
    }

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    let knowledge = getKnowledgeBase(projectId);
    if (!knowledge) {
      knowledge = await buildKnowledgeBase(projectId);
    }

    const newToken = { ...req.body, isCustom: true };
    const tokenArray = knowledge[tokenType as TokenType] as any[];
    tokenArray.push(newToken);
    knowledge.updatedAt = new Date().toISOString();
    saveKnowledgeBase(projectId, knowledge);

    res.json({ success: true, data: newToken });
  } catch (error: any) {
    console.error('Error adding token:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to add token' });
  }
});

// DELETE /api/knowledge/:projectId/tokens/:tokenType/:index — 删除 Design Token
router.delete('/:projectId/tokens/:tokenType/:index', async (req, res) => {
  try {
    const { projectId, tokenType, index: indexStr } = req.params;

    if (!VALID_TOKEN_TYPES.includes(tokenType as TokenType)) {
      res.status(400).json({ success: false, error: `Invalid tokenType: ${tokenType}. Must be one of: ${VALID_TOKEN_TYPES.join(', ')}` });
      return;
    }

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    let knowledge = getKnowledgeBase(projectId);
    if (!knowledge) {
      knowledge = await buildKnowledgeBase(projectId);
    }

    const idx = parseInt(indexStr, 10);
    const tokenArray = knowledge[tokenType as TokenType] as any[];

    if (isNaN(idx) || idx < 0 || idx >= tokenArray.length) {
      res.status(404).json({ success: false, error: `Token index ${indexStr} out of bounds (0-${tokenArray.length - 1})` });
      return;
    }

    tokenArray.splice(idx, 1);
    knowledge.updatedAt = new Date().toISOString();
    saveKnowledgeBase(projectId, knowledge);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting token:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete token' });
  }
});

// POST /api/knowledge/:projectId/rescan — 重新扫描（保留用户自定义条目）
router.post('/:projectId/rescan', async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const knowledge = await rebuildKnowledgeBase(projectId);
    res.json({ success: true, data: knowledge });
  } catch (error: any) {
    console.error('Error rescanning knowledge base:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to rescan knowledge base' });
  }
});

export default router;
