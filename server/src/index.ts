import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import projectsRouter from './routes/projects.js';
import captureRouter from './routes/capture.js';
import aiRouter from './routes/ai.js';
import settingsRouter from './routes/settings.js';
import exportRouter from './routes/export.js';
import skillsRouter from './routes/skills.js';

import { ensureDataDir } from './services/storage.js';
import { initBuiltinSkills } from './services/skillStorage.js';
import { wsService } from './services/websocket.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Try multiple .env locations
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), 'server', '.env') });

const app = express();
const PORT = parseInt(process.env.PORT || '3200', 10);
const HOST = process.env.HOST || '127.0.0.1';

// Middleware
app.use(cors({ origin: true }));
app.use(express.json({ limit: '100mb' }));

// Static files for data (screenshots, etc.)
const dataPath = path.join(__dirname, '..', 'data');
app.use('/data', express.static(dataPath));

// Routes
app.use('/api/projects', projectsRouter);
app.use('/api/capture', captureRouter);
app.use('/api/ai', aiRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/export', exportRouter);
app.use('/api/skills', skillsRouter);
// 动态加载 agent 路由，防止初始化失败导致整个 server 崩溃
import('./routes/agent.js')
  .then(mod => {
    app.use('/api/agent', mod.default);
    console.log('Agent routes registered successfully');
  })
  .catch(err => {
    console.error('Failed to load agent routes (non-fatal):', err.message);
    // 注册一个降级路由
    app.use('/api/agent', (_req, res) => {
      res.status(503).json({ success: false, error: 'Agent service is not available' });
    });
  });

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket service
wsService.init(httpServer);

// Ensure data directory exists
ensureDataDir();

// Initialize builtin skills
initBuiltinSkills();

// Start server
httpServer.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   H2D Studio Server                                      ║
║   Running on http://${HOST}:${PORT}                      ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});
