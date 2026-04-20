import { useState, useRef, useEffect, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore.ts';
import type { SnapshotNode } from '../../stores/editorStore.ts';
import { apiPost } from '../../api/client.ts';
import type { CaptureTree } from '../../types/capture.ts';
import { InteractionCard } from '../interaction/InteractionCard.tsx';
import type { InteractionMessage, InteractionResponse } from '../../types/interaction.ts';
import './AIPanel.css';

// 设计工作流 API
import {
  startDesignWorkflow,
  sendDesignWorkflowMessage,
  advanceDesignWorkflow,
} from '../../api/client';

// 验证 CaptureTree 格式
function validateCaptureTreeFormat(tree: unknown): { valid: boolean; reason: string } {
  if (!tree || typeof tree !== 'object') {
    return { valid: false, reason: '返回值为空或非对象' };
  }
  const t = tree as Record<string, unknown>;
  const root = t.root;
  if (!root || typeof root !== 'object') {
    return { valid: false, reason: '缺少 root 字段' };
  }
  const r = root as Record<string, unknown>;
  if (r.nodeType === undefined || r.nodeType === null) {
    return { valid: false, reason: 'root 缺少 nodeType' };
  }
  if (r.nodeType === 1) {
    if (!r.tag || typeof r.tag !== 'string') {
      return { valid: false, reason: 'root 元素节点缺少 tag' };
    }
    if (!Array.isArray(r.childNodes)) {
      return { valid: false, reason: 'root 元素节点缺少 childNodes 数组' };
    }
    if (!r.rect || typeof r.rect !== 'object') {
      return { valid: false, reason: 'root 元素节点缺少 rect' };
    }
  }
  return { valid: true, reason: '' };
}

// 生成节点摘要文本
function getNodeSummary(node: SnapshotNode): string {
  if (node.nodeType === 3) {
    const text = (node as any).text || '';
    return `文本: "${text.slice(0, 30)}${text.length > 30 ? '...' : ''}"`;
  }
  const el = node as any;
  const childCount = el.childNodes?.length || 0;
  const w = Math.round(el.rect?.width || el.rect?.cssWidth || 0);
  const h = Math.round(el.rect?.height || el.rect?.cssHeight || 0);
  return `${el.tag} (${el.id}) | ${w}×${h} | ${childCount} 个子元素`;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  modifiedTree?: CaptureTree;
  applied?: boolean;
}

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIPanel({ isOpen, onClose }: AIPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 工作流模式状态
  const [mode, setMode] = useState<'quick' | 'workflow' | 'cards'>('quick');
  const [workflowMessages, setWorkflowMessages] = useState<Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>>([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);

  // 卡片交互模式状态
  const [cardsMessages, setCardsMessages] = useState<InteractionMessage[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);

  const {
    projectId,
    pageId,
    captureTree,
    aiMessages,
    pendingModifiedTree,
    setAIMessages,
    setPendingModifiedTree,
    setPreviewTree,
    pushHistory,
    setCaptureTree,
    selectedNodeIds,
    selectNode,
    findNodeById,
    // 设计工作流状态
    designWorkflowSessionId,
    designWorkflowStage,
    stateVariants,
    activeVariantIndex,
    setDesignWorkflow,
    setStateVariants,
    previewVariant,
    applyVariant,
    exitVariantPreview,
  } = useEditorStore();

  // 获取选中节点
  const selectedNode = useMemo(() => {
    if (!selectedNodeIds.length) return null;
    return findNodeById(selectedNodeIds[0]);
  }, [selectedNodeIds, findNodeById]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, isLoading, workflowMessages, workflowLoading, cardsMessages, cardsLoading]);

  // 面板关闭时退出预览模式
  useEffect(() => {
    if (!isOpen) {
      exitVariantPreview();
    }
  }, [isOpen, exitVariantPreview]);

  // 聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleSend = async () => {
    if (!inputValue.trim() || !projectId || !pageId || isLoading) return;

    const requirement = inputValue.trim();
    setInputValue('');

    // 构建完整消息（对用户透明地附带选中节点上下文）
    let fullMessage = requirement;
    if (selectedNode) {
      const nodeContext = buildSelectedNodeContext(selectedNode);
      fullMessage = `${nodeContext}\n\n用户需求: ${requirement}`;
    }

    // 添加用户消息（显示原始输入，不显示上下文前缀）
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: requirement,
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...aiMessages, userMessage];
    setAIMessages(newMessages);
    setIsLoading(true);

    try {
      // 调用后端API
      const response = await apiPost<{
        modifiedTree: CaptureTree;
        explanation: string;
      }>('/ai/generate-modified', {
        projectId,
        pageId,
        requirement: fullMessage,
        captureTree,
      });

      // 添加AI回复
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.explanation || '已为您生成修改方案',
        timestamp: new Date().toISOString(),
        modifiedTree: response.modifiedTree,
        applied: false,
      };

      setAIMessages([...newMessages, assistantMessage]);
      setPendingModifiedTree(response.modifiedTree);
      setPreviewTree(response.modifiedTree);  // 立即在 Canvas 中预览修改
    } catch (err) {
      // 添加错误消息
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `抱歉，生成修改方案时出错: ${err instanceof Error ? err.message : '未知错误'}`,
        timestamp: new Date().toISOString(),
      };
      setAIMessages([...newMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 构建选中节点的详细上下文信息（供 AI 保持原样式使用）
  const buildSelectedNodeContext = (node: SnapshotNode | null): string => {
    if (!node) return '';
    const el = node as any;
    const w = Math.round(el.rect?.width || el.rect?.cssWidth || 0);
    const h = Math.round(el.rect?.height || el.rect?.cssHeight || 0);
    const x = Math.round(el.rect?.x || 0);
    const y = Math.round(el.rect?.y || 0);
    const styles = el.styles || {};
    const childCount = el.childNodes?.length || 0;

    const parts = [
      `[用户选中了以下区域进行修改，请严格保持该区域的原始视觉风格]`,
      `选中节点: ${el.tag || '文本'} (${el.id})`,
      `尺寸: ${w}×${h}`,
      `位置: (${x}, ${y})`,
      `子元素数: ${childCount}`,
    ];

    if (Object.keys(styles).length > 0) {
      parts.push(`原始样式: ${JSON.stringify(styles)}`);
    }

    // 提取选中节点的子树结构（控制大小避免 token 过多）
    const subtree = JSON.stringify(el, (key, val) => {
      if (key === 'parentElement') return undefined;
      return val;
    }, 2);
    if (subtree.length < 8000) {
      parts.push(`选中节点完整结构:\n${subtree}`);
    }

    parts.push(`\n重要要求: 请仅修改选中节点(${el.id})及其子节点，不要改变页面其他部分。必须严格保持选中节点的原始样式风格（颜色、字体、圆角、间距、布局等），在原有样式基础上进行修改。`);

    return parts.join('\n');
  };

  // 卡片交互模式发送处理
  const handleCardsSend = async () => {
    if (!inputValue.trim() || cardsLoading || !projectId || !pageId) return;
    const requirement = inputValue.trim();
    setInputValue('');

    // 添加用户消息
    const userMsg: InteractionMessage = {
      id: `msg-${Date.now()}`,
      type: 'text',
      content: requirement,
    };
    setCardsMessages(prev => [...prev, userMsg]);
    setCardsLoading(true);

    try {
      // 构建带选中节点详细上下文的消息
      let fullMessage = requirement;
      if (selectedNode) {
        const nodeContext = buildSelectedNodeContext(selectedNode);
        fullMessage = `${nodeContext}\n\n用户需求: ${requirement}`;
      }

      const response = await apiPost<{
        modifiedTree: CaptureTree;
        explanation: string;
      }>('/ai/generate-modified', {
        projectId,
        pageId,
        requirement: fullMessage,
        captureTree,
      });

      // 将 AI 回复包装为 summary 类型的交互消息
      const aiMsg: InteractionMessage = {
        id: `msg-${Date.now()}-ai`,
        type: 'summary',
        content: response.explanation || '已为您生成修改方案',
        preview: {
          type: 'diff',
          diff: [{
            nodeId: selectedNode?.id || 'unknown',
            action: 'modify' as const,
            description: response.explanation || 'AI 修改',
          }],
        },
      };
      setCardsMessages(prev => [...prev, aiMsg]);
      setPendingModifiedTree(response.modifiedTree);
      setPreviewTree(response.modifiedTree);  // 卡片模式也启用预览
    } catch (err) {
      const errorMsg: InteractionMessage = {
        id: `msg-${Date.now()}-err`,
        type: 'text',
        content: `❌ 出错: ${err instanceof Error ? err.message : '未知错误'}`,
      };
      setCardsMessages(prev => [...prev, errorMsg]);
    } finally {
      setCardsLoading(false);
    }
  };

  // 卡片交互响应处理（独立于快速编辑模式的消息状态）
  const handleCardsRespond = async (response: InteractionResponse) => {
    if (response.selectedOptions.includes('apply') || response.selectedOptions.includes('confirm')) {
      if (!pendingModifiedTree) return;

      const validation = validateCaptureTreeFormat(pendingModifiedTree);
      if (!validation.valid) {
        const errorMsg: InteractionMessage = {
          id: `msg-${Date.now()}-val`,
          type: 'text',
          content: `结构格式不兼容(${validation.reason})，无法应用。`,
        };
        setCardsMessages(prev => [...prev, errorMsg]);
        setPendingModifiedTree(null);
        setPreviewTree(null);
        return;
      }

      // 保存当前状态到历史（用于撤销）
      pushHistory();
      // 应用修改
      setCaptureTree(pendingModifiedTree);
      setPendingModifiedTree(null);
      setPreviewTree(null);

      // 在卡片消息中显示已应用状态
      const appliedMsg: InteractionMessage = {
        id: `msg-${Date.now()}-applied`,
        type: 'text',
        content: '✅ 修改已应用，可通过工具栏「撤销」按钮或 Ctrl+Z 回退。',
      };
      setCardsMessages(prev => [...prev, appliedMsg]);
    } else if (response.selectedOptions.includes('cancel')) {
      // 取消：清除预览和待应用状态，Canvas 自动恢复显示 captureTree
      setPendingModifiedTree(null);
      setPreviewTree(null);

      const cancelMsg: InteractionMessage = {
        id: `msg-${Date.now()}-cancel`,
        type: 'text',
        content: '已取消应用修改，画布已恢复原状。',
      };
      setCardsMessages(prev => [...prev, cancelMsg]);
    } else if (response.selectedOptions.includes('adjust')) {
      // 再调整：清除当前预览，重新发送
      setPendingModifiedTree(null);
      setPreviewTree(null);

      // 找最后一条用户文本消息
      const lastUserMsg = [...cardsMessages].reverse().find(m => m.type === 'text');
      if (lastUserMsg) {
        setInputValue(lastUserMsg.content);
        const adjustMsg: InteractionMessage = {
          id: `msg-${Date.now()}-adjust`,
          type: 'text',
          content: '正在重新生成...',
        };
        setCardsMessages(prev => [...prev, adjustMsg]);
        setTimeout(() => handleCardsSend(), 0);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (mode === 'quick') {
        handleSend();
      } else if (mode === 'cards') {
        handleCardsSend();
      } else {
        handleWorkflowSend();
      }
    }
  };

  const handleApply = () => {
    if (!pendingModifiedTree) return;

    // 严格验证 modifiedTree 格式
    const validation = validateCaptureTreeFormat(pendingModifiedTree);
    if (!validation.valid) {
      const errorMsg: ChatMessage = {
        id: generateId(),
        role: 'system',
        content: `AI 返回的结构格式不兼容(${validation.reason})，无法应用。请重新描述需求。`,
        timestamp: new Date().toISOString(),
      };
      setAIMessages([...aiMessages, errorMsg]);
      setPendingModifiedTree(null);
      setPreviewTree(null);
      return;
    }

    // 保存当前状态到历史（用于撤销）
    pushHistory();

    // 应用修改 — 将预览树设为正式的 captureTree
    setCaptureTree(pendingModifiedTree);

    // 标记消息为已应用
    const updatedMessages = aiMessages.map(msg =>
      msg.modifiedTree && !msg.applied ? { ...msg, applied: true } : msg
    );
    setAIMessages(updatedMessages);
    setPendingModifiedTree(null);
    setPreviewTree(null);  // 清除预览（已应用到 captureTree）
  };

  const handleDiscard = () => {
    setPendingModifiedTree(null);
    setPreviewTree(null);  // 清除预览，Canvas 恢复显示原始 captureTree
    // 标记最后一条AI消息为已取消（通过添加系统消息）
    const systemMessage: ChatMessage = {
      id: generateId(),
      role: 'system',
      content: '已取消应用修改',
      timestamp: new Date().toISOString(),
    };
    setAIMessages([...aiMessages, systemMessage]);
  };

  const handleRegenerate = async () => {
    // 找到最后一条用户消息
    const lastUserMessage = [...aiMessages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) return;

    // 移除之前的AI回复和待处理状态
    const filteredMessages = aiMessages.filter(m =>
      !(m.role === 'assistant' && m.modifiedTree && !m.applied)
    );
    setAIMessages(filteredMessages);
    setPendingModifiedTree(null);
    setPreviewTree(null);

    // 重新发送
    setInputValue(lastUserMessage.content);
    setTimeout(() => {
      handleSend();
    }, 0);
  };

  // 工作流发送处理
  const handleWorkflowSend = async () => {
    if (!inputValue.trim() || workflowLoading) return;
    const msg = inputValue.trim();
    setInputValue('');

    const userMsg = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: msg,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setWorkflowMessages(prev => [...prev, userMsg]);
    setWorkflowLoading(true);

    try {
      let result;
      if (!designWorkflowSessionId) {
        // 首次：启动工作流
        // 获取选中节点的上下文
        const nodeContext = selectedNode ? JSON.stringify({
          id: selectedNode.id,
          tag: (selectedNode as any).tag,
          rect: selectedNode.rect,
          styles: (selectedNode as any).styles,
          childNodes: ((selectedNode as any).childNodes || []).slice(0, 5).map((c: any) => ({
            nodeType: c.nodeType, tag: c.tag, text: c.text?.slice(0, 50)
          }))
        }) : '';

        // 页面上下文（精简版）
        const pageCtx = captureTree ? JSON.stringify({
          documentTitle: (captureTree as any).documentTitle,
          rootTag: (captureTree as any).root?.tag,
          childCount: (captureTree as any).root?.childNodes?.length || 0,
        }) : '';

        result = await startDesignWorkflow({
          projectId: projectId || '',
          pageId: pageId || '',
          selectedNodeId: selectedNode?.id || '',
          selectedNodeContext: nodeContext,
          pageContext: pageCtx,
          requirement: msg,
        });
        setDesignWorkflow(result.sessionId, result.stage);
      } else {
        // 后续消息
        result = await sendDesignWorkflowMessage(designWorkflowSessionId, msg);
        setDesignWorkflow(designWorkflowSessionId, result.stage);
      }

      const aiMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: result.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setWorkflowMessages(prev => [...prev, aiMsg]);

      // 如果有状态变体
      const variants = (result as any).stateVariants;
      if (variants && variants.length > 0) {
        setStateVariants(variants);
      }
    } catch (error: any) {
      const errMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: `出错了: ${error.message || '请求失败'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setWorkflowMessages(prev => [...prev, errMsg]);
    } finally {
      setWorkflowLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  // 检查是否有未应用的修改
  const hasPendingModification = pendingModifiedTree !== null;
  const lastAssistantMessage = [...aiMessages].reverse().find(m => m.role === 'assistant' && m.modifiedTree);

  if (!isOpen) return null;

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
          <span>AI 助手</span>
        </div>
        <button className="ai-panel-close" onClick={onClose} title="关闭">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* 模式切换 */}
      <div className="ai-mode-switcher">
        <button
          className={`ai-mode-btn ${mode === 'quick' ? 'active' : ''}`}
          onClick={() => setMode('quick')}
        >
          快速编辑
        </button>
        <button
          className={`ai-mode-btn ${mode === 'cards' ? 'active' : ''}`}
          onClick={() => setMode('cards')}
        >
          🃏 卡片交互
        </button>
        <button
          className={`ai-mode-btn ${mode === 'workflow' ? 'active' : ''}`}
          onClick={() => setMode('workflow')}
        >
          设计工作流
        </button>
      </div>

      {/* 工作流阶段进度条 */}
      {mode === 'workflow' && designWorkflowStage && (
        <div className="workflow-progress">
          {['analyze', 'clarify', 'design', 'done'].map((s, i) => {
            const stages = ['analyze', 'clarify', 'design', 'done'];
            const currentIdx = stages.indexOf(designWorkflowStage || '');
            return (
              <span key={s} className="workflow-progress-item">
                <span className={`workflow-step ${i < currentIdx ? 'completed' : i === currentIdx ? 'active' : ''}`}>
                  {i < currentIdx ? '✓ ' : ''}
                  {s === 'analyze' ? '分析' : s === 'clarify' ? '澄清' : s === 'design' ? '设计' : '完成'}
                </span>
                {i < stages.length - 1 && <span className="workflow-arrow">→</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* 状态变体切换器 */}
      {mode === 'workflow' && stateVariants.length > 0 && (
        <div className="variant-switcher">
          <div className="variant-switcher-label">状态预览:</div>
          <div className="variant-tabs">
            {stateVariants.map((v, i) => (
              <button
                key={i}
                className={`variant-tab ${activeVariantIndex === i ? 'active' : ''}`}
                onClick={() => previewVariant(i)}
                title={v.description}
              >
                {v.name}
                {v.isDefault && <span className="variant-default-badge">默认</span>}
              </button>
            ))}
          </div>
          <div className="variant-actions">
            <button className="variant-apply-btn" onClick={() => {
              if (activeVariantIndex >= 0) {
                applyVariant(activeVariantIndex);
              }
            }} disabled={activeVariantIndex < 0}>
              应用此状态
            </button>
            <button className="variant-exit-btn" onClick={exitVariantPreview}>
              退出预览
            </button>
          </div>
        </div>
      )}

      <div className="ai-panel-messages">
        {/* 快速编辑模式欢迎界面 */}
        {mode === 'quick' && aiMessages.length === 0 && (
          <div className="ai-welcome">
            <div className="ai-welcome-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <h4>AI 原型编辑助手</h4>
            <p>用自然语言描述您想要的修改，AI 将自动调整页面结构。</p>
            <div className="ai-examples">
              <div className="ai-example" onClick={() => setInputValue('把顶部导航栏的背景色改为深蓝色')}>
                "把顶部导航栏的背景色改为深蓝色"
              </div>
              <div className="ai-example" onClick={() => setInputValue('在页面底部添加一个版权信息栏')}>
                "在页面底部添加一个版权信息栏"
              </div>
              <div className="ai-example" onClick={() => setInputValue('把所有按钮改成圆角样式')}>
                "把所有按钮改成圆角样式"
              </div>
            </div>
          </div>
        )}

        {/* 工作流模式欢迎界面 */}
        {mode === 'workflow' && workflowMessages.length === 0 && (
          <div className="ai-welcome">
            <div className="ai-welcome-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <h4>AI 设计工作流</h4>
            <p>描述您的设计需求，AI 将引导您完成从分析到设计的全过程。</p>
            <div className="ai-examples">
              <div className="ai-example" onClick={() => setInputValue('设计一个用户登录表单页面')}>
                "设计一个用户登录表单页面"
              </div>
              <div className="ai-example" onClick={() => setInputValue('创建一个商品详情页，包含图片、价格和购买按钮')}>
                "创建一个商品详情页，包含图片、价格和购买按钮"
              </div>
              <div className="ai-example" onClick={() => setInputValue('设计一个数据仪表盘，展示销售统计图表')}>
                "设计一个数据仪表盘，展示销售统计图表"
              </div>
            </div>
          </div>
        )}

        {/* 卡片交互模式欢迎界面 */}
        {mode === 'cards' && cardsMessages.length === 0 && (
          <div className="ai-welcome">
            <div className="ai-welcome-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="18" rx="2"/>
                <path d="M8 7h8M8 11h8M8 15h4"/>
              </svg>
            </div>
            <h4>🃏 卡片交互模式</h4>
            <p>用自然语言描述修改需求，AI 将以卡片形式呈现方案，您可以逐步确认或调整。</p>
            <div className="ai-examples">
              <div className="ai-example" onClick={() => setInputValue('优化这个页面的配色方案')}>
                "优化这个页面的配色方案"
              </div>
              <div className="ai-example" onClick={() => setInputValue('重新设计导航栏的布局')}>
                "重新设计导航栏的布局"
              </div>
              <div className="ai-example" onClick={() => setInputValue('把卡片列表改成网格布局')}>
                "把卡片列表改成网格布局"
              </div>
            </div>
          </div>
        )}

        {/* 快速编辑模式消息列表 */}
        {mode === 'quick' && aiMessages.map((message) => (
          <div
            key={message.id}
            className={`ai-message ${message.role} ${message.applied ? 'applied' : ''}`}
          >
            <div className="ai-message-header">
              <span className="ai-message-role">
                {message.role === 'user' && '您'}
                {message.role === 'assistant' && '🤖 AI'}
                {message.role === 'system' && '系统'}
              </span>
              <span className="ai-message-time">{formatTime(message.timestamp)}</span>
            </div>
            <div className="ai-message-content">
              {message.content}
              {message.modifiedTree && (
                <div className="ai-message-actions">
                  {message.applied ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="applied-badge">✓ 已应用</span>
                      <button className="ai-btn ai-btn-ghost" onClick={() => {
                        // 真正的撤销：调用 editorStore 的 undo
                        const store = useEditorStore.getState();
                        store.undo();
                        // 标记此消息为未应用
                        const updatedMsgs = aiMessages.map(msg =>
                          msg.id === message.id ? { ...msg, applied: false } : msg
                        );
                        setAIMessages(updatedMsgs);
                      }}>
                        ↩ 撤销
                      </button>
                    </div>
                  ) : hasPendingModification && message === lastAssistantMessage ? (
                    <>
                      <button className="ai-btn ai-btn-primary" onClick={handleApply}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        应用修改
                      </button>
                      <button className="ai-btn ai-btn-secondary" onClick={handleDiscard}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        取消
                      </button>
                      <button className="ai-btn ai-btn-ghost" onClick={handleRegenerate}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="23 4 23 10 17 10"/>
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                        </svg>
                        重新生成
                      </button>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* 工作流模式消息列表 */}
        {mode === 'workflow' && workflowMessages.map((message) => (
          <div
            key={message.id}
            className={`ai-message ${message.role}`}
          >
            <div className="ai-message-header">
              <span className="ai-message-role">
                {message.role === 'user' ? '您' : '🤖 AI'}
              </span>
              <span className="ai-message-time">{message.timestamp}</span>
            </div>
            <div className="ai-message-content">
              {message.content}
            </div>
          </div>
        ))}

        {/* 卡片交互模式消息列表 */}
        {mode === 'cards' && cardsMessages.map((msg) => (
          <InteractionCard
            key={msg.id}
            message={msg}
            onRespond={handleCardsRespond}
            disabled={cardsLoading}
          />
        ))}

        {/* 快速编辑模式加载状态 */}
        {mode === 'quick' && isLoading && (
          <div className="ai-message assistant loading">
            <div className="ai-message-header">
              <span className="ai-message-role">🤖 AI</span>
            </div>
            <div className="ai-message-content">
              <div className="ai-loading">
                <span className="ai-loading-dot"></span>
                <span className="ai-loading-dot"></span>
                <span className="ai-loading-dot"></span>
              </div>
            </div>
          </div>
        )}

        {/* 工作流模式加载状态 */}
        {mode === 'workflow' && workflowLoading && (
          <div className="ai-message assistant loading">
            <div className="ai-message-header">
              <span className="ai-message-role">🤖 AI</span>
            </div>
            <div className="ai-message-content">
              <div className="ai-loading">
                <span className="ai-loading-dot"></span>
                <span className="ai-loading-dot"></span>
                <span className="ai-loading-dot"></span>
              </div>
            </div>
          </div>
        )}

        {/* 卡片交互模式加载状态 */}
        {mode === 'cards' && cardsLoading && (
          <div className="ai-message assistant loading">
            <div className="ai-message-header">
              <span className="ai-message-role">🤖 AI</span>
            </div>
            <div className="ai-message-content">
              <div className="ai-loading">
                <span className="ai-loading-dot"></span>
                <span className="ai-loading-dot"></span>
                <span className="ai-loading-dot"></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="ai-panel-input">
        {/* 选中节点上下文 */}
        {selectedNode && (
          <div className="ai-selected-context">
            <div className="context-badge">
              <span className="context-icon">📌</span>
              <span className="context-text">选中区域: {getNodeSummary(selectedNode)}</span>
              <button className="context-remove" onClick={() => selectNode('')} title="移除选中">×</button>
            </div>
          </div>
        )}
        <div className="ai-input-wrapper">
          <textarea
            className="ai-input-textarea"
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'quick' ? "描述您想要的修改..." :
              mode === 'cards' ? "描述修改需求，AI 将以卡片方式呈现..." :
              "描述您的设计需求..."
            }
            rows={2}
disabled={
  mode === 'quick' ? isLoading :
  mode === 'cards' ? cardsLoading :
  workflowLoading
}
          />
          <button
            className="ai-send-btn"
            onClick={
              mode === 'quick' ? handleSend :
              mode === 'cards' ? handleCardsSend :
              handleWorkflowSend
            }
disabled={
  !inputValue.trim() ||
  (mode === 'quick' ? isLoading :
   mode === 'cards' ? cardsLoading :
   workflowLoading)
}
            title="发送 (Enter)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>

        {/* 跳过澄清按钮 */}
        {mode === 'workflow' && designWorkflowSessionId && designWorkflowStage === 'clarify' && (
          <button className="workflow-advance-btn" onClick={async () => {
            if (!designWorkflowSessionId || workflowLoading) return;
            setWorkflowLoading(true);
            try {
              const result = await advanceDesignWorkflow(designWorkflowSessionId);
              setDesignWorkflow(designWorkflowSessionId, result.stage);
              const aiMsg = {
                id: Date.now().toString(),
                role: 'assistant' as const,
                content: result.response,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              };
              setWorkflowMessages(prev => [...prev, aiMsg]);
              if (result.stateVariants?.length) {
                setStateVariants(result.stateVariants);
              }
            } catch (e: any) {
              console.error(e);
            } finally {
              setWorkflowLoading(false);
            }
          }} disabled={workflowLoading}>
            跳过澄清，直接设计 →
          </button>
        )}

        <div className="ai-input-hint">
          {mode === 'quick' ? '按 Enter 发送，Shift+Enter 换行' :
           mode === 'cards' ? '按 Enter 发送，AI 将以卡片方式呈现修改方案' :
           '按 Enter 发送，AI 将引导您完成设计'}
        </div>
      </div>
    </div>
  );
}
