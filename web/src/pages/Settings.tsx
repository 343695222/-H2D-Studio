import { useState, useEffect } from 'react';
import { apiGet, apiPut, apiPost } from '../api/client.ts';
import Loading from '../components/Loading.tsx';
import './Settings.css';

interface AISettings {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface AppSettings {
  ai: AISettings;
  server: {
    port: number;
    host: string;
  };
}

const AI_PROVIDERS = [
  { value: 'openai', label: 'OpenAI', placeholder: 'https://api.openai.com/v1', modelPlaceholder: 'gpt-4o' },
  { value: 'claude', label: 'Claude (Anthropic)', placeholder: 'https://api.anthropic.com', modelPlaceholder: 'claude-3-sonnet-20240229' },
  { value: 'zhipu', label: '智谱 AI', placeholder: 'https://open.bigmodel.cn/api/paas/v4', modelPlaceholder: 'glm-4' },
  { value: 'ollama', label: 'Ollama (本地)', placeholder: 'http://localhost:11434', modelPlaceholder: 'llama2' },
];

function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await apiGet<AppSettings>('/settings');
      setSettings(data);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '加载设置失败',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setIsSaving(true);
    setMessage(null);

    try {
      await apiPut('/settings', { ai: settings.ai });
      setMessage({ type: 'success', text: '设置已保存' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '保存设置失败',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!settings) return;

    setIsTesting(true);
    setMessage(null);

    try {
      await apiPost('/settings/test-ai', { ai: settings.ai });
      setMessage({ type: 'success', text: '连接测试成功！' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '连接测试失败',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const updateAISettings = (updates: Partial<AISettings>) => {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            ai: { ...prev.ai, ...updates },
          }
        : null
    );
  };

  const currentProvider = AI_PROVIDERS.find(p => p.value === settings?.ai.provider) || AI_PROVIDERS[0];

  if (isLoading) {
    return <Loading />;
  }

  return (
    <div className="settings">
      <h1 className="page-title">设置</h1>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
          <button onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      <div className="settings-container">
        <section className="settings-card">
          <div className="settings-header">
            <h2>AI 配置</h2>
            <p className="settings-desc">配置 AI 服务以启用 PRD 自动生成功能</p>
          </div>

          <form onSubmit={handleSave}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="provider">AI Provider</label>
                <select
                  id="provider"
                  value={settings?.ai.provider || 'openai'}
                  onChange={(e) => updateAISettings({ provider: e.target.value })}
                >
                  {AI_PROVIDERS.map(provider => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="model">Model</label>
                <input
                  id="model"
                  type="text"
                  value={settings?.ai.model || ''}
                  onChange={(e) => updateAISettings({ model: e.target.value })}
                  placeholder={currentProvider.modelPlaceholder}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="apiKey">API Key</label>
              <div className="input-with-button">
                <input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={settings?.ai.apiKey || ''}
                  onChange={(e) => updateAISettings({ apiKey: e.target.value })}
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  className="input-action-btn"
                  onClick={() => setShowApiKey(!showApiKey)}
                  title={showApiKey ? '隐藏' : '显示'}
                >
                  {showApiKey ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
              <span className="hint">您的 API Key 将安全存储在本地，不会上传到任何服务器</span>
            </div>

            <div className="form-group">
              <label htmlFor="baseUrl">API Base URL (可选)</label>
              <input
                id="baseUrl"
                type="text"
                value={settings?.ai.baseUrl || ''}
                onChange={(e) => updateAISettings({ baseUrl: e.target.value })}
                placeholder={currentProvider.placeholder}
              />
              <span className="hint">留空将使用默认地址</span>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleTestConnection}
                disabled={isTesting || !settings?.ai.apiKey}
              >
                {isTesting ? (
                  <>
                    <svg className="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20"></circle>
                    </svg>
                    测试中...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                    测试连接
                  </>
                )}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSaving}
              >
                {isSaving ? '保存中...' : '保存设置'}
              </button>
            </div>
          </form>
        </section>

        <section className="settings-card info-card">
          <div className="settings-header">
            <h2>服务器信息</h2>
          </div>
          <div className="info-list">
            <div className="info-item">
              <span className="info-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <line x1="8" y1="21" x2="16" y2="21"></line>
                  <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
                端口
              </span>
              <span className="info-value">{settings?.server.port}</span>
            </div>
            <div className="info-item">
              <span className="info-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                主机
              </span>
              <span className="info-value">{settings?.server.host}</span>
            </div>
          </div>
          <p className="settings-footer-hint">
            服务器配置需要通过修改 .env 文件并重启服务来更改
          </p>
        </section>
      </div>
    </div>
  );
}

export default Settings;
