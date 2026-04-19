import { Router } from 'express';
import {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  getPages,
  getPage,
  updatePage,
  deletePage,
} from '../services/storage.js';
import { wsService } from '../services/websocket.js';

const router = Router();

// GET /api/projects - List all projects
router.get('/', (_req, res) => {
  try {
    const projects = getProjects();
    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({ success: false, error: 'Failed to list projects' });
  }
});

// POST /api/projects - Create a new project
router.post('/', (req, res) => {
  try {
    const { name, description = '' } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Project name is required' });
      return;
    }

    const project = createProject(name.trim(), description.trim());
    
    // Broadcast WebSocket event
    wsService.broadcastProjectCreated(project.id, project.name);
    
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

// GET /api/projects/:id - Get project details
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const project = getProject(id);
    
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const pages = getPages(id);
    
    res.json({
      success: true,
      data: {
        ...project,
        pages,
      },
    });
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({ success: false, error: 'Failed to get project' });
  }
});

// PUT /api/projects/:id - Update a project
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const updates: { name?: string; description?: string } = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    const project = updateProject(id, updates);

    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    res.json({ success: true, data: project });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ success: false, error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id - Delete a project
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const success = deleteProject(id);
    
    if (!success) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    // Broadcast WebSocket event
    wsService.broadcastProjectDeleted(id);

    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ success: false, error: 'Failed to delete project' });
  }
});

// GET /api/projects/:id/pages - Get all pages for a project
router.get('/:id/pages', (req, res) => {
  try {
    const { id } = req.params;
    const project = getProject(id);

    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const pages = getPages(id);
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error('Error getting pages:', error);
    res.status(500).json({ success: false, error: 'Failed to get pages' });
  }
});

// GET /api/projects/:id/pages/:pageId - Get a single page with full capture data
router.get('/:id/pages/:pageId', (req, res) => {
  try {
    const { id, pageId } = req.params;
    const project = getProject(id);

    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const pageData = getPage(id, pageId);

    if (!pageData) {
      res.status(404).json({ success: false, error: 'Page not found' });
      return;
    }

    res.json({ success: true, data: pageData });
  } catch (error) {
    console.error('Error getting page:', error);
    res.status(500).json({ success: false, error: 'Failed to get page' });
  }
});

// PUT /api/projects/:id/pages/:pageId - Update a page with edited data
router.put('/:id/pages/:pageId', (req, res) => {
  try {
    const { id, pageId } = req.params;
    const { editedTree } = req.body;

    if (!editedTree) {
      res.status(400).json({ success: false, error: 'editedTree is required' });
      return;
    }

    const project = getProject(id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const success = updatePage(id, pageId, editedTree);

    if (!success) {
      res.status(404).json({ success: false, error: 'Page not found' });
      return;
    }

    // Broadcast WebSocket event
    wsService.broadcastPageUpdated(id, pageId);

    res.json({ success: true, message: 'Page updated successfully' });
  } catch (error) {
    console.error('Error updating page:', error);
    res.status(500).json({ success: false, error: 'Failed to update page' });
  }
});

// DELETE /api/projects/:id/pages/:pageId - Delete a page
router.delete('/:id/pages/:pageId', (req, res) => {
  try {
    const { id, pageId } = req.params;
    const project = getProject(id);

    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const success = deletePage(id, pageId);

    if (!success) {
      res.status(404).json({ success: false, error: 'Page not found' });
      return;
    }

    // Broadcast WebSocket event
    wsService.broadcastPageDeleted(id, pageId);

    res.json({ success: true, message: 'Page deleted successfully' });
  } catch (error) {
    console.error('Error deleting page:', error);
    res.status(500).json({ success: false, error: 'Failed to delete page' });
  }
});

export default router;
