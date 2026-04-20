const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);

  let result: ApiResponse<T>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`服务器响应解析失败 (HTTP ${response.status})，请检查服务是否正常运行`);
  }

  if (!response.ok || !result.success) {
    throw new Error(result.message || result.error || `HTTP ${response.status}`);
  }

  return result.data as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let result: ApiResponse<T>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`服务器响应解析失败 (HTTP ${response.status})，请检查服务是否正常运行`);
  }

  if (!response.ok || !result.success) {
    throw new Error(result.error || result.message || `HTTP ${response.status}`);
  }

  return result.data as T;
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let result: ApiResponse<T>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`服务器响应解析失败 (HTTP ${response.status})，请检查服务是否正常运行`);
  }

  if (!response.ok || !result.success) {
    throw new Error(result.error || result.message || `HTTP ${response.status}`);
  }

  return result.data as T;
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
  });

  let result: ApiResponse<unknown>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`服务器响应解析失败 (HTTP ${response.status})，请检查服务是否正常运行`);
  }

  if (!response.ok || !result.success) {
    throw new Error(result.error || result.message || `HTTP ${response.status}`);
  }
}

// Agent API
export async function createAgentSession(projectId: string, idea: string) {
  return apiPost<{ sessionId: string; response: string }>('/agent/sessions', { projectId, idea });
}

export async function sendAgentMessage(sessionId: string, message: string) {
  return apiPost<{ response: string; stage: string; prd?: string }>(`/agent/sessions/${sessionId}/message`, { message });
}

export async function getAgentSession(sessionId: string) {
  return apiGet<{ meta: any; messages: Array<{ role: string; content: string }> }>(`/agent/sessions/${sessionId}`);
}

export async function advanceAgentStage(sessionId: string) {
  return apiPost<{ response: string; stage: string; prd?: string }>(`/agent/sessions/${sessionId}/advance`);
}

export async function getAgentPRD(sessionId: string) {
  return apiGet<{ prd: string | null }>(`/agent/sessions/${sessionId}/prd`);
}

export async function listAgentSessions(projectId: string) {
  return apiGet<any[]>(`/agent/sessions?projectId=${projectId}`);
}

export async function rollbackAgentStage(sessionId: string, targetStage: string) {
  return apiPost<{ response: string; stage: string }>(`/agent/sessions/${sessionId}/rollback`, { targetStage });
}

// ========== Design Workflow API ==========

export async function startDesignWorkflow(params: {
  projectId: string;
  pageId: string;
  selectedNodeId: string;
  selectedNodeContext: string;
  pageContext: string;
  requirement: string;
}): Promise<{ sessionId: string; response: string; stage: string }> {
  return apiPost('/ai/design-workflow/start', params);
}

export async function sendDesignWorkflowMessage(
  sessionId: string,
  message: string
): Promise<{ response: string; stage: string; stateVariants?: any[] }> {
  return apiPost(`/ai/design-workflow/${sessionId}/message`, { message });
}

export async function advanceDesignWorkflow(
  sessionId: string
): Promise<{ response: string; stage: string; stateVariants?: any[] }> {
  return apiPost(`/ai/design-workflow/${sessionId}/advance`, {});
}

// ========== Knowledge Base API ==========

export async function getKnowledgeBase(projectId: string) {
  return apiGet<any>(`/knowledge/${projectId}`);
}

export async function rebuildKnowledgeBase(projectId: string) {
  return apiPost<any>(`/knowledge/${projectId}/rebuild`);
}

export async function updateKnowledgeBase(projectId: string, pageId: string) {
  return apiPost<any>(`/knowledge/${projectId}/update`, { pageId });
}

export async function getKnowledgeContext(projectId: string) {
  return apiGet<{ context: string }>(`/knowledge/${projectId}/context`);
}
