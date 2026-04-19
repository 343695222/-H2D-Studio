import { Router } from 'express';
import { savePage, getProject } from '../services/storage.js';
import { wsService } from '../services/websocket.js';

const router = Router();

// POST /api/capture/receive - Receive capture data from browser extension
router.post('/receive', (req, res) => {
  try {
    const {
      projectId,
      name,
      url,
      description,
      captureTree: rawCaptureTree,
      screenshotBase64,
      screenshot,
    } = req.body;

    // captureTree can be a JSON string or an object
    let captureTree = rawCaptureTree;
    if (typeof rawCaptureTree === 'string') {
      try {
        captureTree = JSON.parse(rawCaptureTree);
      } catch {
        res.status(400).json({ success: false, error: 'captureTree is not valid JSON' });
        return;
      }
    }

    // screenshot field can come as either "screenshotBase64" or "screenshot"
    const screenshotData = screenshotBase64 || screenshot || '';

    // Validate required fields
    if (!projectId || typeof projectId !== 'string') {
      res.status(400).json({ success: false, error: 'projectId is required' });
      return;
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: 'name is required' });
      return;
    }

    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      res.status(400).json({ success: false, error: 'url is required' });
      return;
    }

    if (!captureTree || typeof captureTree !== 'object') {
      res.status(400).json({ success: false, error: 'captureTree is required and must be a valid JSON object or string' });
      return;
    }

    // Verify project exists
    const project = getProject(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: `Project ${projectId} not found` });
      return;
    }

    // Save the page capture
    const page = savePage(
      projectId,
      {
        name: name.trim(),
        url: url.trim(),
        description: description?.trim(),
      },
      captureTree,
      screenshotData
    );

    // Broadcast WebSocket event for real-time updates
    wsService.broadcastPageCaptured(projectId, page.id, page.name, page.url);

    res.status(201).json({
      success: true,
      pageId: page.id,
      pageName: page.name,
      message: 'Capture saved successfully',
    });
  } catch (error) {
    console.error('Error receiving capture:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    
    res.status(500).json({ success: false, error: 'Failed to save capture' });
  }
});

export default router;
