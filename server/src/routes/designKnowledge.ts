/**
 * Design Knowledge API Routes — 设计知识库 API 路由
 *
 * GET    /api/design-knowledge/:projectId                       — 获取设计知识库
 * POST   /api/design-knowledge/:projectId/components            — 添加组件模板
 * PUT    /api/design-knowledge/:projectId/components/:id        — 更新组件模板
 * DELETE /api/design-knowledge/:projectId/components/:id        — 删除组件模板
 * POST   /api/design-knowledge/:projectId/interactions          — 添加交互模式
 * PUT    /api/design-knowledge/:projectId/interactions/:id      — 更新交互模式
 * DELETE /api/design-knowledge/:projectId/interactions/:id      — 删除交互模式
 * POST   /api/design-knowledge/:projectId/principles            — 添加设计原则
 * PUT    /api/design-knowledge/:projectId/principles/:id        — 更新设计原则
 * DELETE /api/design-knowledge/:projectId/principles/:id        — 删除设计原则
 * GET    /api/design-knowledge/:projectId/search?q=xxx          — 模糊搜索
 * POST   /api/design-knowledge/:projectId/extract               — 从捕获页面提取组件为模板
 */

import { Router } from 'express';
import {
  getDesignKnowledgeBase,
  addComponentTemplate,
  updateComponentTemplate,
  deleteComponentTemplate,
  addInteractionPattern,
  updateInteractionPattern,
  deleteInteractionPattern,
  addDesignPrinciple,
  updateDesignPrinciple,
  deleteDesignPrinciple,
  searchDesignKnowledge,
  extractComponentAsTemplate,
} from '../services/designKnowledgeBase.js';
import { getProject } from '../services/storage.js';

const router = Router();

// GET /:projectId — 获取设计知识库
router.get('/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const kb = getDesignKnowledgeBase(projectId);
    res.json({ success: true, data: kb });
  } catch (error: any) {
    console.error('Error getting design knowledge base:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get design knowledge base' });
  }
});

// GET /:projectId/search?q=xxx — 模糊搜索
router.get('/:projectId/search', (req, res) => {
  try {
    const { projectId } = req.params;
    const q = (req.query.q as string) || '';

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const results = searchDesignKnowledge(projectId, q);
    res.json({ success: true, data: results });
  } catch (error: any) {
    console.error('Error searching design knowledge:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to search design knowledge' });
  }
});

// --- 组件模板 CRUD ---

// POST /:projectId/components — 添加组件模板
router.post('/:projectId/components', (req, res) => {
  try {
    const { projectId } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const { name, description, applicableScenes, htmlTemplate, previewImagePath } = req.body;
    if (!name || !description) {
      res.status(400).json({ success: false, error: 'name and description are required' });
      return;
    }

    const template = addComponentTemplate(projectId, {
      name,
      description,
      applicableScenes: applicableScenes || [],
      htmlTemplate: htmlTemplate || '',
      previewImagePath,
    });
    res.json({ success: true, data: template });
  } catch (error: any) {
    console.error('Error adding component template:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to add component template' });
  }
});

// PUT /:projectId/components/:id — 更新组件模板
router.put('/:projectId/components/:id', (req, res) => {
  try {
    const { projectId, id } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const updated = updateComponentTemplate(projectId, id, req.body);
    if (!updated) {
      res.status(404).json({ success: false, error: 'Component template not found' });
      return;
    }

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Error updating component template:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update component template' });
  }
});

// DELETE /:projectId/components/:id — 删除组件模板
router.delete('/:projectId/components/:id', (req, res) => {
  try {
    const { projectId, id } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const deleted = deleteComponentTemplate(projectId, id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Component template not found' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting component template:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete component template' });
  }
});

// --- 交互模式 CRUD ---

// POST /:projectId/interactions — 添加交互模式
router.post('/:projectId/interactions', (req, res) => {
  try {
    const { projectId } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const { name, description, triggerCondition, interactionFlow, applicableComponents } = req.body;
    if (!name || !description) {
      res.status(400).json({ success: false, error: 'name and description are required' });
      return;
    }

    const pattern = addInteractionPattern(projectId, {
      name,
      description,
      triggerCondition: triggerCondition || '',
      interactionFlow: interactionFlow || '',
      applicableComponents: applicableComponents || [],
    });
    res.json({ success: true, data: pattern });
  } catch (error: any) {
    console.error('Error adding interaction pattern:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to add interaction pattern' });
  }
});

// PUT /:projectId/interactions/:id — 更新交互模式
router.put('/:projectId/interactions/:id', (req, res) => {
  try {
    const { projectId, id } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const updated = updateInteractionPattern(projectId, id, req.body);
    if (!updated) {
      res.status(404).json({ success: false, error: 'Interaction pattern not found' });
      return;
    }

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Error updating interaction pattern:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update interaction pattern' });
  }
});

// DELETE /:projectId/interactions/:id — 删除交互模式
router.delete('/:projectId/interactions/:id', (req, res) => {
  try {
    const { projectId, id } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const deleted = deleteInteractionPattern(projectId, id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Interaction pattern not found' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting interaction pattern:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete interaction pattern' });
  }
});

// --- 设计原则 CRUD ---

// POST /:projectId/principles — 添加设计原则
router.post('/:projectId/principles', (req, res) => {
  try {
    const { projectId } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const { name, description, rules } = req.body;
    if (!name || !description) {
      res.status(400).json({ success: false, error: 'name and description are required' });
      return;
    }

    const principle = addDesignPrinciple(projectId, {
      name,
      description,
      rules: rules || [],
    });
    res.json({ success: true, data: principle });
  } catch (error: any) {
    console.error('Error adding design principle:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to add design principle' });
  }
});

// PUT /:projectId/principles/:id — 更新设计原则
router.put('/:projectId/principles/:id', (req, res) => {
  try {
    const { projectId, id } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const updated = updateDesignPrinciple(projectId, id, req.body);
    if (!updated) {
      res.status(404).json({ success: false, error: 'Design principle not found' });
      return;
    }

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Error updating design principle:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update design principle' });
  }
});

// DELETE /:projectId/principles/:id — 删除设计原则
router.delete('/:projectId/principles/:id', (req, res) => {
  try {
    const { projectId, id } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const deleted = deleteDesignPrinciple(projectId, id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Design principle not found' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting design principle:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete design principle' });
  }
});

// POST /:projectId/extract — 从捕获页面提取组件为模板
router.post('/:projectId/extract', (req, res) => {
  try {
    const { projectId } = req.params;

    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const { pageId, nodeId } = req.body;
    if (!pageId || !nodeId) {
      res.status(400).json({ success: false, error: 'pageId and nodeId are required' });
      return;
    }

    const template = extractComponentAsTemplate(projectId, pageId, nodeId);
    if (!template) {
      res.status(404).json({ success: false, error: 'Page or node not found' });
      return;
    }

    res.json({ success: true, data: template });
  } catch (error: any) {
    console.error('Error extracting component:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to extract component' });
  }
});

export default router;
