import { useState, useRef, useEffect } from 'react';
import { apiPost } from '../../api/client.ts';
import type { SnapshotNode } from '../../stores/editorStore.ts';
import './AIEditPopover.css';

export interface AIEditState {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string | null;
  type: 'style' | 'content' | 'layout' | 'free';
  loading: boolean;
  result: { explanation: string; applied: boolean } | null;
  error: string | null;
  lastRequirement: string;
}

interface AIEditPopoverProps {
  state: AIEditState | null;
  node: SnapshotNode | null;
  onClose: () => void;
  onApply: (nodeId: string, modifiedNode: unknown, explanation: string) => void;
  onUndo: () => void;
}

// 快捷建议配置
const SUGGESTIONS: Record<AIEditState['type'], string[]> = {
  style: ['深色主题', '圆角 8px', '加阴影', '透明背景', '加边框'],
  content: ['翻译成英文', '缩短文字', '换个标题', '加副标题'],
  layout: ['水平排列', '垂直排列', '居中对齐', '等间距分布'],
  free: [],
};

const PLACEHOLDERS: Record<AIEditState['type'], string> = {
  style: '描述样式修改，如：改成深色主题、加圆角...',
  content: '描述内容修改，如：把文字改成英文、更换标题...',
  layout: '描述布局修改，如：改成横排、居中对齐...',
  free: '描述你想要的修改...',
};

const TYPE_LABELS: Record<AIEditState['type'], string> = {
  style: '🎨 修改样式',
  content: '📝 修改内容',
  layout: '📐 修改布局',
  free: '✨ 自由编辑',
};

// 精简节点数据发给 AI
function simplifyNode(node: SnapshotNode, depth = 0, maxDepth = 3): unknown {
  if (node.nodeType === 3) {
    return { 
      nodeType: 3, 
      id: node.id, 
      text: (node as { text?: string }).text, 
      rect: node.rect 
    };
  }
  const el = node as {
    id: string;
    tag: string;
    styles: Record<string, string>;
    rect: { x: number; y: number; width: number; height: number };
    attributes: Record<string, string>;
    childNodes?: SnapshotNode[];
  };
  const simplified: Record<string, unknown> = {
    nodeType: 1,
    id: el.id,
    tag: el.tag,
    styles: el.styles,
    rect: el.rect,
    attributes: el.attributes,
  };
  if (depth < maxDepth && el.childNodes) {
    simplified.childNodes = el.childNodes.map((c) => simplifyNode(c, depth + 1, maxDepth));
  } else if (el.childNodes && el.childNodes.length > 0) {
    simplified.childCount = el.childNodes.length;
  }
  return simplified;
}

export function AIEditPopover({ state, node, onClose, onApply, onUndo }: AIEditPopoverProps) {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequirement, setLastRequirement] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 自动聚焦输入框
  useEffect(() => {
    if (state?.visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [state?.visible]);

  // 点击外部关闭
  useEffect(() => {
    if (!state?.visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [state?.visible, onClose]);

  if (!state?.visible || !state.nodeId) return null;

  const handleSubmit = async () => {
    if (!inputValue.trim() || !node) return;

    await handleAIEdit(inputValue.trim());
  };

  const handleQuickEdit = async (suggestion: string) => {
    setInputValue(suggestion);
    await handleAIEdit(suggestion);
  };

  const handleAIEdit = async (requirement: string) => {
    if (!node) return;

    setIsLoading(true);
    setError(null);
    setLastRequirement(requirement);

    try {
      const simplifiedNode = simplifyNode(node);
      
      const response = await apiPost<{ modifiedNode: unknown; explanation: string }>(
        '/ai/edit-node',
        {
          node: simplifiedNode,
          requirement,
          editType: state.type,
        }
      );

      onApply(state.nodeId!, response.modifiedNode, response.explanation);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'AI 编辑失败';
      setError(errorMessage);
      console.error('AI edit error:', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (lastRequirement) {
      handleAIEdit(lastRequirement);
    }
  };

  // 计算位置，确保不超出视口
  const calculatePosition = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popoverWidth = 340;
    const popoverHeight = 200; // 估计高度

    let x = state.x;
    let y = state.y;

    // 右边界检查
    if (x + popoverWidth > viewportWidth) {
      x = viewportWidth - popoverWidth - 10;
    }

    // 下边界检查
    if (y + popoverHeight > viewportHeight) {
      y = viewportHeight - popoverHeight - 10;
    }

    // 左边界检查
    if (x < 10) {
      x = 10;
    }

    // 上边界检查
    if (y < 10) {
      y = 10;
    }

    return { x, y };
  };

  const position = calculatePosition();
  const suggestions = SUGGESTIONS[state.type];
  const placeholder = PLACEHOLDERS[state.type];
  const typeLabel = TYPE_LABELS[state.type];
  const nodeTag = node ? ((node as { tag?: string }).tag || 'text') : 'unknown';

  return (
    <div
      ref={popoverRef}
      className="ai-edit-popover"
      style={{ left: position.x, top: position.y }}
    >
      <div className="ai-edit-header">
        <span className="ai-edit-icon">
          {state.type === 'style' && '🎨'}
          {state.type === 'content' && '📝'}
          {state.type === 'layout' && '📐'}
          {state.type === 'free' && '✨'}
        </span>
        <span>{typeLabel}: &lt;{nodeTag}&gt;</span>
      </div>

      {!isLoading && !state.result && (
        <>
          <div className="ai-edit-input-row">
            <input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              disabled={isLoading}
            />
            <button onClick={handleSubmit} disabled={!inputValue.trim() || isLoading}>
              →
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="ai-edit-suggestions">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="suggestion-chip"
                  onClick={() => handleQuickEdit(s)}
                  disabled={isLoading}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {isLoading && !state.result && (
        <div className="ai-edit-loading">
          <span className="spinner">⟳</span>
          <span>AI 正在处理...</span>
        </div>
      )}

      {state.result && (
        <div className="ai-edit-result">
          <p className="ai-edit-summary">{state.result.explanation}</p>
          <div className="ai-edit-actions">
            <button className="btn-keep" onClick={onClose}>
              ✓ 保留
            </button>
            <button className="btn-undo" onClick={onUndo}>
              ↶ 撤销
            </button>
            <button className="btn-retry" onClick={handleRetry}>
              🔄 重试
            </button>
          </div>
        </div>
      )}

      {error && <p className="ai-edit-error">{error}</p>}
    </div>
  );
}
