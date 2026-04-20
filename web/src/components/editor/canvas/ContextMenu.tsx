/**
 * ContextMenu — right-click menu for canvas nodes.
 * Extracted from Canvas.tsx for separation of concerns.
 */
// Context menu component

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string | null;
}

interface Props {
  state: ContextMenuState;
  onClose: () => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAIEditStyle: () => void;
  onAIEditContent: () => void;
  onAIEditLayout: () => void;
  onAIEditFree: () => void;
  onSendToAI: () => void;
}

export function ContextMenu({ state, onClose, onAddChild, onAddSibling, onDuplicate, onDelete, onMoveUp, onMoveDown, onAIEditStyle, onAIEditContent, onAIEditLayout, onAIEditFree, onSendToAI }: Props) {
  if (!state.visible || !state.nodeId) return null;

  const item = (label: string, icon: string, onClick: () => void, className = '') => (
    <div className={`context-menu-item ${className}`} onClick={() => { onClick(); onClose(); }}>
      <span>{icon}</span> {label}
    </div>
  );

  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} />
      <div className="context-menu" style={{ left: state.x, top: state.y }}>
        {item('添加子元素', '➕', onAddChild)}
        {item('添加兄弟元素', '➕', onAddSibling)}
        <div className="context-menu-divider" />
        {item('复制', '📋', onDuplicate)}
        {item('删除', '🗑', onDelete, 'danger')}
        <div className="context-menu-divider" />
        {item('AI 修改样式', '🎨', onAIEditStyle, 'ai-item')}
        {item('AI 修改内容', '📝', onAIEditContent, 'ai-item')}
        {item('AI 修改布局', '📐', onAIEditLayout, 'ai-item')}
        <div className="context-menu-divider" />
        {item('AI 自由编辑', '✨', onAIEditFree, 'ai-item ai-free')}
        <div className="context-menu-divider" />
        {item('在 AI 助手中编辑', '🤖', onSendToAI, 'ai-item')}
        <div className="context-menu-divider" />
        {item('移到上方', '⬆', onMoveUp)}
        {item('移到下方', '⬇', onMoveDown)}
      </div>
    </>
  );
}
