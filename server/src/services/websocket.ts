import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface WSMessage {
  type: string;
  data: any;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  // 初始化: 附加到现有HTTP server
  init(server: Server) {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws) => {
      console.log('[WS] Client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        console.log('[WS] Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error('[WS] Error:', err.message);
        this.clients.delete(ws);
      });

      // 发送欢迎消息
      ws.send(JSON.stringify({ type: 'connected', data: { message: 'H2D Studio WebSocket connected' } }));
    });

    console.log('[WS] WebSocket server initialized');
  }

  // 广播消息给所有连接的客户端
  broadcast(message: WSMessage) {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  // 具体事件广播方法
  broadcastPageCaptured(projectId: string, pageId: string, pageName: string, url: string) {
    this.broadcast({
      type: 'page:captured',
      data: { projectId, pageId, pageName, url, timestamp: new Date().toISOString() }
    });
  }

  broadcastPageUpdated(projectId: string, pageId: string) {
    this.broadcast({
      type: 'page:updated',
      data: { projectId, pageId, timestamp: new Date().toISOString() }
    });
  }

  broadcastPageDeleted(projectId: string, pageId: string) {
    this.broadcast({
      type: 'page:deleted',
      data: { projectId, pageId, timestamp: new Date().toISOString() }
    });
  }

  broadcastProjectCreated(projectId: string, projectName: string) {
    this.broadcast({
      type: 'project:created',
      data: { projectId, projectName, timestamp: new Date().toISOString() }
    });
  }

  broadcastProjectDeleted(projectId: string) {
    this.broadcast({
      type: 'project:deleted',
      data: { projectId, timestamp: new Date().toISOString() }
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const wsService = new WebSocketService();
