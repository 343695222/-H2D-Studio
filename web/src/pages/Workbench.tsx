/**
 * Workbench — 需求工作台页面
 *
 * 左侧对话区 + 右侧预览区 + 底部进度条
 * 使用 InteractionEngine 管理卡片式 AI 对话
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { InteractionEngine } from '../components/interaction/InteractionEngine';
import type {
  InteractionMessage,
  InteractionResponse,
  InteractionStage,
} from '../types/interaction';
import {
  createAgentSession,
  sendAgentMessage,
  listAgentSessions,
} from '../api/client';
import './Workbench.css';

// 阶段配置
const STAGES: Array<{ key: InteractionStage; label: string; icon: string }> = [
  { key: 'discovery', label: '需求发现', icon: '💡' },
  { key: 'clarifying', label: '需求澄清', icon: '❓' },
  { key: 'requirement', label: '需求分析', icon: '📋' },
  { key: 'prd', label: 'PRD 文档', icon: '📄' },
  { key: 'designPrinciples', label: '设计原则', icon: '🎨' },
  { key: 'wireframe', label: '线框生成', icon: '📐' },
  { key: 'hifi', label: '高保真设计', icon: '🖼️' },
  { key: 'codeExport', label: '代码导出', icon: '💻' },
];

// 预览标签页
type PreviewTab = 'arch' | 'prd' | 'wireframe' | 'hifi' | 'code';

export default function Workbench() {
  const { projectId } = useParams<{ projectId: string }>();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InteractionMessage[]>([]);
  const [stage, setStage] = useState<InteractionStage>('discovery');
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [loading, setLoading] = useState(false);
  const [prdContent, setPrdContent] = useState<string>('');
  const [activeTab, setActiveTab] = useState<PreviewTab>('arch');
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);


  // 加载已有会话列表
  useEffect(() => {
    if (!projectId) return;
    listAgentSessions(projectId)
      .then((data: any) => {
        setSessions(
          (Array.isArray(data) ? data : []).map((s: any) => ({
            id: s.id,
            title: s.title || '未命名会话',
            updatedAt: s.updatedAt,
          }))
        );
      })
      .catch(() => {});
  }, [projectId]);

  // 创建新会话
  const handleStartSession = async (idea: string) => {
    if (!projectId || !idea.trim()) return;
    setLoading(true);
    try {
      const result = await createAgentSession(projectId, idea);
      setSessionId(result.sessionId);

      // 将 AI 回复包装为 InteractionMessage
      const aiMsg: InteractionMessage = {
        id: `msg_${Date.now()}`,
        type: 'text',
        content: result.response,
      };
      setMessages([aiMsg]);
      setStage('clarifying');
      setCurrentStep(1);
      setTotalSteps(4);
    } catch (err: any) {
      setMessages([
        {
          id: 'error',
          type: 'text',
          content: `❌ 创建会话失败: ${err.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // 发送消息
  const handleRespond = async (response: InteractionResponse) => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const result = await sendAgentMessage(sessionId, response.customInput || response.selectedOptions.join(', '));

      // 更新阶段
      if (result.stage) {
        setStage(result.stage as InteractionStage);
      }

      // 如果有 PRD，保存
      if (result.prd) {
        setPrdContent(result.prd);
        setActiveTab('prd');
      }

      // 添加 AI 回复
      const aiMsg: InteractionMessage = {
        id: `msg_${Date.now()}`,
        type: 'text',
        content: result.response,
      };
      setMessages(prev => [...prev, aiMsg]);
      setCurrentStep(prev => prev + 1);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `error_${Date.now()}`,
          type: 'text',
          content: `❌ 发送失败: ${err.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // 文字输入处理
  const handleTextSubmit = async (text: string) => {
    if (!sessionId) {
      // 没有会话，创建新会话
      await handleStartSession(text);
      return;
    }
    // 已有会话，发送消息
    await handleRespond({
      messageId: `text_${Date.now()}`,
      selectedOptions: [],
      customInput: text,
    });
  };

  // 获取当前阶段索引
  const stageIndex = STAGES.findIndex(s => s.key === stage);

  return (
    <div className="workbench">
      {/* 顶部导航 */}
      <div className="workbench-header">
        <div className="workbench-nav">
          <Link to="/" className="nav-link">项目列表</Link>
          <span className="nav-separator">›</span>
          <Link to={`/project/${projectId}`} className="nav-link">项目详情</Link>
          <span className="nav-separator">›</span>
          <span className="nav-current">需求工作台</span>
        </div>
        <div className="workbench-actions">
          {sessions.length > 0 && (
            <select
              className="session-select"
              value={sessionId || ''}
              onChange={(_e) => {
                // TODO: 加载已有会话
              }}
            >
              <option value="">新建会话</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* 主内容区 */}
      <div className="workbench-content">
        {/* 左侧对话区 */}
        <div className="workbench-chat">
          <InteractionEngine
            messages={messages}
            stage={stage}
            currentStep={currentStep}
            totalSteps={totalSteps}
            onRespond={handleRespond}
            loading={loading}
            onTextSubmit={handleTextSubmit}
            textPlaceholder={
              sessionId
                ? '继续描述你的需求...'
                : '描述你想做的功能，开始需求分析...'
            }
          />
        </div>

        {/* 右侧预览区 */}
        <div className="workbench-preview">
          {/* 标签页 */}
          <div className="preview-tabs">
            <button
              className={`preview-tab ${activeTab === 'arch' ? 'active' : ''}`}
              onClick={() => setActiveTab('arch')}
            >
              架构概要
            </button>
            <button
              className={`preview-tab ${activeTab === 'prd' ? 'active' : ''}`}
              onClick={() => setActiveTab('prd')}
              disabled={!prdContent}
            >
              PRD 文档
            </button>
            <button
              className={`preview-tab ${activeTab === 'wireframe' ? 'active' : ''}`}
              onClick={() => setActiveTab('wireframe')}
              disabled={stageIndex < 5}
            >
              线框图
            </button>
            <button
              className={`preview-tab ${activeTab === 'hifi' ? 'active' : ''}`}
              onClick={() => setActiveTab('hifi')}
              disabled={stageIndex < 6}
            >
              设计稿
            </button>
            <button
              className={`preview-tab ${activeTab === 'code' ? 'active' : ''}`}
              onClick={() => setActiveTab('code')}
              disabled={stageIndex < 7}
            >
              代码
            </button>
          </div>

          {/* 预览内容 */}
          <div className="preview-body">
            {activeTab === 'arch' && (
              <div className="preview-placeholder">
                <div className="placeholder-icon">💡</div>
                <div className="placeholder-text">
                  在左侧描述你的需求，AI 将帮你梳理架构
                </div>
              </div>
            )}
            {activeTab === 'prd' && prdContent && (
              <div className="preview-prd">
                <div className="prd-content" dangerouslySetInnerHTML={{
                  __html: markdownToHtml(prdContent),
                }} />
              </div>
            )}
            {activeTab === 'wireframe' && (
              <div className="preview-placeholder">
                <div className="placeholder-icon">📐</div>
                <div className="placeholder-text">
                  线框图将在需求确认后自动生成
                </div>
              </div>
            )}
            {activeTab === 'hifi' && (
              <div className="preview-placeholder">
                <div className="placeholder-icon">🖼️</div>
                <div className="placeholder-text">
                  高保真设计将在线框确认后自动生成
                </div>
              </div>
            )}
            {activeTab === 'code' && (
              <div className="preview-placeholder">
                <div className="placeholder-icon">💻</div>
                <div className="placeholder-text">
                  代码将在设计确认后自动生成
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部阶段进度条 */}
      <div className="workbench-stages">
        {STAGES.map((s, i) => (
          <div
            key={s.key}
            className={`stage-item ${
              i < stageIndex ? 'completed' : i === stageIndex ? 'current' : 'pending'
            }`}
            onClick={() => {
              // TODO: 回溯到之前的阶段
            }}
          >
            <span className="stage-icon">
              {i < stageIndex ? '✓' : s.icon}
            </span>
            <span className="stage-label">{s.label}</span>
            {i < STAGES.length - 1 && <span className="stage-connector" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// 简单的 Markdown → HTML 转换
function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}
