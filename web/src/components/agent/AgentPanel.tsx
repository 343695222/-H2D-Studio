import { useState, useRef, useEffect } from 'react';
import {
  createAgentSession,
  sendAgentMessage,
  advanceAgentStage,
  getAgentPRD,
} from '../../api/client.ts';
import './AgentPanel.css';

interface AgentPanelProps {
  projectId: string;
  projectName: string;
  pages: Array<{ id: string; name: string; url: string }>;
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

type AgentStage = 'discovery' | 'clarifying' | 'requirement' | 'prd' | 'prototype' | 'done';

const STAGES: { id: AgentStage; label: string }[] = [
  { id: 'discovery', label: 'Discovery' },
  { id: 'clarifying', label: 'Clarify' },
  { id: 'requirement', label: 'Requirement' },
  { id: 'prd', label: 'PRD' },
  { id: 'prototype', label: 'Prototype' },
];

// 简单的 Markdown 渲染函数
function renderMarkdown(markdown: string): string {
  return markdown
    .replace(/^###### (.*$)/gim, '<h6>$1</h6>')
    .replace(/^##### (.*$)/gim, '<h5>$1</h5>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>')
    .replace(/\n\n/gim, '</p><p>')
    .replace(/\n/gim, '<br>');
}

export default function AgentPanel({
  projectId,
  projectName,
  pages,
  isOpen,
  onClose,
}: AgentPanelProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stage, setStage] = useState<AgentStage>('discovery');
  const [prd, setPrd] = useState<string>('');
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPrdPreview, setShowPrdPreview] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 面板打开时聚焦输入框
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue('');

    // 添加用户消息到列表
    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      let response;

      if (!sessionId) {
        // 首次发送，创建会话
        response = await createAgentSession(projectId, userMessage);
        setSessionId(response.sessionId);
        
        // 添加 AI 回复
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.response,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, aiMessage]);
        setStage('clarifying');
      } else {
        // 后续发送
        response = await sendAgentMessage(sessionId, userMessage);
        
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.response,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, aiMessage]);
        setStage(response.stage as AgentStage);

        // 如果生成了 PRD，获取并显示
        if (response.prd) {
          setPrd(response.prd);
          setShowPrdPreview(true);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，处理消息时出现了错误。请稍后重试。',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleAdvanceStage = async () => {
    if (!sessionId || isLoading) return;

    setIsLoading(true);
    try {
      const response = await advanceAgentStage(sessionId);
      
      const aiMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMessage]);
      setStage(response.stage as AgentStage);

      if (response.prd) {
        setPrd(response.prd);
        setShowPrdPreview(true);
      }
    } catch (error) {
      console.error('Error advancing stage:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPRD = async () => {
    if (!sessionId) return;

    try {
      let prdContent = prd;
      if (!prdContent) {
        const response = await getAgentPRD(sessionId);
        prdContent = response.prd || '';
      }

      if (prdContent) {
        const blob = new Blob([prdContent], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PRD-${projectName}-${new Date().toISOString().split('T')[0]}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting PRD:', error);
    }
  };

  const getStageIndex = (s: AgentStage) => {
    return STAGES.findIndex((st) => st.id === s);
  };

  const currentStageIndex = getStageIndex(stage);

  return (
    <div className="agent-panel-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="agent-panel">
        {/* Header */}
        <div className="agent-panel-header">
          <div className="agent-panel-header-left">
            <button className="agent-panel-back-btn" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              返回
            </button>
            <h2 className="agent-panel-title">AI 产品助手 - {projectName}</h2>
          </div>

          {/* 进度条 */}
          <div className="agent-panel-progress">
            {STAGES.map((s, index) => (
              <span key={s.id}>
                <span
                  className={`progress-step ${
                    index < currentStageIndex
                      ? 'completed'
                      : index === currentStageIndex
                      ? 'active'
                      : ''
                  }`}
                >
                  {index < currentStageIndex ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  ) : null}
                  {s.label}
                </span>
                {index < STAGES.length - 1 && (
                  <span className="progress-arrow">→</span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="agent-panel-body">
          {/* 左侧对话区域 */}
          <div className="agent-panel-chat">
            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="chat-empty">
                  <svg className="chat-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                  </svg>
                  <h3 className="chat-empty-title">开始你的产品构思</h3>
                  <p className="chat-empty-desc">
                    描述你想要的产品功能或改进想法，AI 助手会帮你逐步完善需求并生成 PRD
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`chat-message ${msg.role}`}>
                    <div className={`message-avatar ${msg.role === 'assistant' ? 'ai' : 'user'}`}>
                      {msg.role === 'assistant' ? '🤖' : '👤'}
                    </div>
                    <div>
                      <div
                        className="message-content"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                      <div className="message-time">{msg.timestamp}</div>
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="chat-message assistant">
                  <div className="message-avatar ai">🤖</div>
                  <div className="chat-loading">
                    <div className="chat-loading-spinner"></div>
                    <span>思考中...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 输入区域 */}
            <div className="chat-input-area">
              <div className="chat-input-container">
                <textarea
                  ref={inputRef}
                  className="chat-input"
                  placeholder={
                    sessionId
                      ? '输入你的回复...'
                      : '描述你的产品想法，例如：我想为竞拍工作台添加一个一键报价功能...'
                  }
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={isLoading}
                />
                <button
                  className="chat-send-btn"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                  发送
                </button>
              </div>

              <div className="chat-actions">
                {sessionId && stage !== 'done' && stage !== 'prototype' && (
                  <button
                    className="chat-action-btn"
                    onClick={handleAdvanceStage}
                    disabled={isLoading}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                    跳到下一阶段
                  </button>
                )}
                {(prd || stage === 'prd' || stage === 'prototype' || stage === 'done') && (
                  <button
                    className="chat-action-btn primary"
                    onClick={handleExportPRD}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                      <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    导出 PRD
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 右侧上下文面板 */}
          <div className="agent-panel-context">
            {/* 当前阶段 */}
            <div className="context-section">
              <h3 className="context-section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                当前阶段
              </h3>
              <span className={`context-stage-badge ${stage}`}>
                {STAGES.find((s) => s.id === stage)?.label || stage}
              </span>
            </div>

            {/* 项目页面 */}
            <div className="context-section">
              <h3 className="context-section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="9" y1="9" x2="15" y2="9"></line>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
                项目页面 ({pages.length})
              </h3>
              <div className="context-pages-list">
                {pages.length === 0 ? (
                  <span className="context-empty">暂无页面</span>
                ) : (
                  pages.map((page) => (
                    <div key={page.id} className="context-page-item">
                      <svg className="context-page-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="9" x2="15" y2="9"></line>
                        <line x1="9" y1="15" x2="15" y2="15"></line>
                      </svg>
                      <span className="context-page-name" title={page.name}>
                        {page.name}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* PRD 预览 */}
            {(prd || showPrdPreview) && (
              <div className="context-section">
                <h3 className="context-section-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  PRD 预览
                </h3>
                {prd ? (
                  <div
                    className="prd-preview"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(prd) }}
                  />
                ) : (
                  <span className="context-empty">PRD 生成中...</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
