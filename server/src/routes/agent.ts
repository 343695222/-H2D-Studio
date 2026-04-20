import { Router } from 'express';

const router = Router();

// 延迟加载 productAgent，避免初始化错误导致整个 server 崩溃
let _service: any = null;
async function getAgentService() {
  if (!_service) {
    try {
      const mod = await import('../services/productAgent.js');
      _service = mod.productAgentService;
    } catch (err) {
      console.error('Failed to load productAgent service:', err);
      throw new Error('Agent service is not available: ' + (err instanceof Error ? err.message : String(err)));
    }
  }
  return _service;
}

// POST /api/agent/sessions — 创建新会话
router.post('/sessions', async (req, res) => {
  try {
    const { projectId, idea } = req.body;
    if (!projectId || !idea) {
      res.status(400).json({ success: false, error: 'projectId and idea are required' });
      return;
    }
    const service = await getAgentService();
    const result = await service.createSession(projectId, idea);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error creating agent session:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create session' });
  }
});

// POST /api/agent/sessions/:id/message — 发送消息
router.post('/sessions/:id/message', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      res.status(400).json({ success: false, error: 'message is required' });
      return;
    }
    const service = await getAgentService();
    const result = await service.sendMessage(req.params.id, message);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to send message' });
  }
});

// GET /api/agent/sessions/:id — 获取会话状态
router.get('/sessions/:id', async (req, res) => {
  try {
    const service = await getAgentService();
    const session = await service.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }
    res.json({ success: true, data: session });
  } catch (error: any) {
    console.error('Error getting session:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get session' });
  }
});

// POST /api/agent/sessions/:id/advance — 手动推进阶段
router.post('/sessions/:id/advance', async (req, res) => {
  try {
    const service = await getAgentService();
    const result = await service.advanceStage(req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error advancing stage:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to advance stage' });
  }
});

// GET /api/agent/sessions/:id/prd — 获取 PRD
router.get('/sessions/:id/prd', async (req, res) => {
  try {
    const service = await getAgentService();
    const prd = await service.getPRD(req.params.id);
    res.json({ success: true, data: { prd } });
  } catch (error: any) {
    console.error('Error getting PRD:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get PRD' });
  }
});

// GET /api/agent/sessions?projectId=xxx — 列出项目会话
router.get('/sessions', async (req, res) => {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) {
      res.status(400).json({ success: false, error: 'projectId is required' });
      return;
    }
    const service = await getAgentService();
    const sessions = service.listSessions(projectId);
    res.json({ success: true, data: sessions });
  } catch (error: any) {
    console.error('Error listing sessions:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to list sessions' });
  }
});

// POST /api/agent/sessions/:id/rollback — 回退到指定阶段
router.post('/sessions/:id/rollback', async (req, res) => {
  try {
    const { targetStage } = req.body;
    if (!targetStage) {
      res.status(400).json({ success: false, error: 'targetStage is required' });
      return;
    }
    const service = await getAgentService();
    const result = await service.rollbackStage(req.params.id, targetStage);
    res.json({ success: true, data: { response: result.response, stage: result.stage } });
  } catch (error: any) {
    console.error('Error rolling back stage:', error);
    const msg = error.message || 'Failed to rollback stage';
    const status = msg.includes('not found') ? 404
      : msg.includes('Invalid target stage') || msg.includes('Cannot rollback') ? 400
      : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

// POST /api/agent/sessions/:id/update-prd — 局部更新 PRD
router.post('/sessions/:id/update-prd', async (req, res) => {
  try {
    const { section, modification } = req.body;
    if (!section || !modification) {
      res.status(400).json({ success: false, error: 'section and modification are required' });
      return;
    }
    const service = await getAgentService();
    const result = await service.updatePRDSection(req.params.id, section, modification);
    res.json({ success: true, data: { response: result.response, prd: result.prd } });
  } catch (error: any) {
    console.error('Error updating PRD section:', error);
    const msg = error.message || 'Failed to update PRD section';
    const status = msg.includes('not found') ? 404
      : msg.includes('No PRD document found') ? 400
      : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

export default router;
