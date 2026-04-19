import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore.ts';
import type { SnapshotNode, Rect, ElementSnapshot, TextSnapshot } from '../../types/capture.ts';
import { AIEditPopover } from './AIEditPopover.tsx';
import type { AIEditState } from './AIEditPopover.tsx';
import './Canvas.css';

interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string | null;
}

interface InlineEditState {
  visible: boolean;
  nodeId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

// 节点叠加层组件
function NodeOverlay({ 
  node, 
  isSelected, 
  isHovered,
  onSelect, 
  onHover,
  onDoubleClick,
  onContextMenu,
  rootOffsetX,
  rootOffsetY
}: { 
  node: SnapshotNode;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onHover: (hovered: boolean) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  rootOffsetX: number;
  rootOffsetY: number;
}) {
  const { rect } = node;
  
  // 跳过无效矩形（包括缺失 rect 的情况）
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  
  const isTextNode = node.nodeType === 3;
  
  return (
    <div
      className={`node-overlay ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${isTextNode ? 'text-node' : ''}`}
      style={{
        position: 'absolute',
        left: rect.x - rootOffsetX,
        top: rect.y - rootOffsetY,
        width: rect.width,
        height: rect.height,
      }}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    />
  );
}

// 选中高亮框组件
function SelectionOverlay({ 
  node, 
  onMouseDown,
  rootOffsetX,
  rootOffsetY
}: { 
  node: SnapshotNode;
  onMouseDown?: (e: React.MouseEvent) => void;
  rootOffsetX: number;
  rootOffsetY: number;
}) {
  const { rect } = node;
  // 跳过无效矩形
  if (!rect) return null;
  const isTextNode = node.nodeType === 3;
  const tag = isTextNode ? 'text' : (node as { tag: string }).tag;
  
  return (
    <div
      className="selection-overlay"
      style={{
        position: 'absolute',
        left: rect.x - rootOffsetX - 2,
        top: rect.y - rootOffsetY - 2,
        width: rect.width + 4,
        height: rect.height + 4,
      }}
      onMouseDown={onMouseDown}
    >
      {/* 标签 */}
      <div className="selection-label">
        {tag} {Math.round(rect.width)}×{Math.round(rect.height)}
      </div>
      
      {/* 四角手柄 */}
      <div className="resize-handle nw" />
      <div className="resize-handle ne" />
      <div className="resize-handle sw" />
      <div className="resize-handle se" />
    </div>
  );
}

// Hover高亮组件
function HoverOverlay({ node, rootOffsetX, rootOffsetY }: { node: SnapshotNode; rootOffsetX: number; rootOffsetY: number }) {
  const { rect } = node;
  
  // 跳过无效矩形
  if (!rect) return null;
  
  return (
    <div
      className="hover-overlay"
      style={{
        position: 'absolute',
        left: rect.x - rootOffsetX - 1,
        top: rect.y - rootOffsetY - 1,
        width: rect.width + 2,
        height: rect.height + 2,
      }}
    />
  );
}

// 框选矩形组件
function MarqueeSelection({ rect }: { rect: MarqueeRect }) {
  return (
    <div
      className="marquee-selection"
      style={{
        position: 'absolute',
        left: Math.min(rect.x, rect.x + rect.width),
        top: Math.min(rect.y, rect.y + rect.height),
        width: Math.abs(rect.width),
        height: Math.abs(rect.height),
      }}
    />
  );
}

// 上下文菜单组件
function ContextMenu({
  state,
  onClose,
  onAddChild,
  onAddSibling,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAIEditStyle,
  onAIEditContent,
  onAIEditLayout,
  onAIEditFree,
  onSendToAI
}: {
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
}) {
  if (!state.visible || !state.nodeId) return null;

  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} />
      <div
        className="context-menu"
        style={{ left: state.x, top: state.y }}
      >
        <div className="context-menu-item" onClick={() => { onAddChild(); onClose(); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
          </svg>
          添加子元素
        </div>
        <div className="context-menu-item" onClick={() => { onAddSibling(); onClose(); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
          </svg>
          添加兄弟元素
        </div>
        <div className="context-menu-divider" />
        <div className="context-menu-item" onClick={() => { onDuplicate(); onClose(); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
            <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
          </svg>
          复制
        </div>
        <div className="context-menu-item danger" onClick={() => { onDelete(); onClose(); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
            <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
          </svg>
          删除
        </div>
        <div className="context-menu-divider" />
        <div className="context-menu-item ai-item" onClick={() => { onAIEditStyle(); onClose(); }}>
          <span>🎨</span>
          AI 修改样式
        </div>
        <div className="context-menu-item ai-item" onClick={() => { onAIEditContent(); onClose(); }}>
          <span>📝</span>
          AI 修改内容
        </div>
        <div className="context-menu-item ai-item" onClick={() => { onAIEditLayout(); onClose(); }}>
          <span>📐</span>
          AI 修改布局
        </div>
        <div className="context-menu-divider" />
        <div className="context-menu-item ai-item ai-free" onClick={() => { onAIEditFree(); onClose(); }}>
          <span>✨</span>
          AI 自由编辑
        </div>
        <div className="context-menu-divider" />
        <div className="context-menu-item ai-item" onClick={() => { onSendToAI(); onClose(); }}>
          <span>🤖</span>
          在 AI 助手中编辑
        </div>
        <div className="context-menu-divider" />
        <div className="context-menu-item" onClick={() => { onMoveUp(); onClose(); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0v-9A.5.5 0 0 1 8 3z"/>
            <path d="M4.854 6.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708l3-3a.5.5 0 0 1 .708 0z"/>
            <path d="M11.146 6.146a.5.5 0 0 0 0 .708l3 3a.5.5 0 0 0 .708-.708l-3-3a.5.5 0 0 0-.708 0z"/>
          </svg>
          移到上方
        </div>
        <div className="context-menu-item" onClick={() => { onMoveDown(); onClose(); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 13a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 1 0v9a.5.5 0 0 1-.5.5z"/>
            <path d="M4.854 9.854a.5.5 0 0 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8 7.207 4.854 9.854z"/>
          </svg>
          移到下方
        </div>
      </div>
    </>
  );
}

// 行内编辑组件
function InlineEdit({
  state,
  onSave,
  onCancel
}: {
  state: InlineEditState;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, []);
  
  if (!state.visible) return null;
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSave(textareaRef.current?.value || '');
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };
  
  const handleBlur = () => {
    onSave(textareaRef.current?.value || '');
  };
  
  return (
    <div
      className="inline-edit-overlay"
      style={{
        position: 'absolute',
        left: state.x,
        top: state.y,
        width: state.width,
        height: state.height,
      }}
    >
      <textarea
        ref={textareaRef}
        className="inline-edit-textarea"
        defaultValue={state.text}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          width: '100%',
          height: '100%',
          resize: 'none',
        }}
      />
    </div>
  );
}

// CaptureNodeRenderer - renders the actual content of captureTree nodes
const CaptureNodeRenderer = React.memo(({ node }: { node: SnapshotNode }) => {
  // Text node: render text content
  if (node.nodeType === 3) {
    const textNode = node as TextSnapshot;
    if (!textNode.text || !textNode.text.trim()) return null;
    return <>{textNode.text}</>;
  }

  // Element node
  const el = node as ElementSnapshot;

  // Build style from el.styles (already camelCase JS object format)
  const style: React.CSSProperties = { ...(el.styles as React.CSSProperties) };

  // Convert position:fixed to position:absolute (fixed doesn't work in transformed container)
  if (style.position === 'fixed') {
    style.position = 'absolute';
  }

  // SVG content node: render SVG content via dangerouslySetInnerHTML
  if (el.content && el.tag === 'SVG') {
    return <div style={style} dangerouslySetInnerHTML={{ __html: el.content }} />;
  }

  // IMG element: render as img tag with src from attributes
  if (el.tag === 'IMG' && el.attributes?.src) {
    return <img style={style} src={el.attributes.src} alt={el.attributes.alt || ''} draggable={false} />;
  }

  // Recursively render child nodes
  return (
    <div style={style}>
      {el.childNodes?.map((child, i) => (
        <CaptureNodeRenderer key={child.id || i} node={child} />
      ))}
    </div>
  );
});

// 递归渲染节点叠加层
function renderNodeOverlays(
  node: SnapshotNode | undefined,
  selectedNodeIds: string[],
  hoveredNodeId: string | null,
  selectNode: (id: string, multi?: boolean) => void,
  hoverNode: (id: string | null) => void,
  onNodeDoubleClick: (node: SnapshotNode) => void,
  onNodeContextMenu: (e: React.MouseEvent, nodeId: string) => void,
  rootOffsetX: number,
  rootOffsetY: number
): JSX.Element[] {
  if (!node) return [];
  
  const overlays: JSX.Element[] = [];
  
  // 渲染当前节点
  overlays.push(
    <NodeOverlay
      key={node.id}
      node={node}
      isSelected={selectedNodeIds.includes(node.id)}
      isHovered={hoveredNodeId === node.id}
      onSelect={(e) => {
        e.stopPropagation();
        selectNode(node.id, e.shiftKey || e.ctrlKey || e.metaKey);
      }}
      onHover={(hovered) => hoverNode(hovered ? node.id : null)}
      onDoubleClick={() => onNodeDoubleClick(node)}
      onContextMenu={(e) => onNodeContextMenu(e, node.id)}
      rootOffsetX={rootOffsetX}
      rootOffsetY={rootOffsetY}
    />
  );
  
  // 递归渲染子节点
  if (node.nodeType === 1) {
    const elementNode = node as { childNodes: SnapshotNode[] };
    for (const child of elementNode.childNodes) {
      overlays.push(...renderNodeOverlays(child, selectedNodeIds, hoveredNodeId, selectNode, hoverNode, onNodeDoubleClick, onNodeContextMenu, rootOffsetX, rootOffsetY));
    }
  }
  
  return overlays;
}

export function Canvas() {
  const {
    captureTree,
    screenshotUrl,
    zoom,
    panX,
    panY,
    selectedNodeIds,
    hoveredNodeId,
    tool,
    selectNode,
    hoverNode,
    clearSelection,
    findNodeAtPoint,
    findNodesInRect,
    setZoom,
    setPan,
    findNodeById,
    updateNodeText,
    updateNodeRect,
    addChildNode,
    addSiblingNode,
    duplicateNode,
    deleteNode,
    moveNodeUp,
    moveNodeDown,
    pushHistory,
    applyAINodeEdit,
    undo,
    setShowAIPanel
  } = useEditorStore();

  // 计算根节点偏移，用于对齐 overlay 与内容层
  const rootRect = captureTree?.root?.rect;
  const rootOffsetX = rootRect?.x ?? 0;
  const rootOffsetY = rootRect?.y ?? 0;

  const canvasRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState(false);
  const dragThresholdRef = useRef(0);
  const pendingDragRef = useRef<{ nodeId: string; startPos: { x: number; y: number }; startRect: Rect; screenX: number; screenY: number } | null>(null);
  
  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [dragNodeStartRect, setDragNodeStartRect] = useState<Rect | null>(null);
  
  // 上下文菜单状态
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    nodeId: null
  });
  
  // 行内编辑状态
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>({
    visible: false,
    nodeId: null,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    text: ''
  });

  // AI 编辑状态
  const [aiEditState, setAiEditState] = useState<AIEditState | null>(null);

  // AI 编辑处理函数
  const openAIEdit = useCallback((type: AIEditState['type']) => {
    if (!contextMenu.nodeId) return;
    setAiEditState({
      visible: true,
      x: contextMenu.x,
      y: contextMenu.y,
      nodeId: contextMenu.nodeId,
      type,
      loading: false,
      result: null,
      error: null,
      lastRequirement: ''
    });
  }, [contextMenu]);

  const handleAIEditStyle = useCallback(() => openAIEdit('style'), [openAIEdit]);
  const handleAIEditContent = useCallback(() => openAIEdit('content'), [openAIEdit]);
  const handleAIEditLayout = useCallback(() => openAIEdit('layout'), [openAIEdit]);
  const handleAIEditFree = useCallback(() => openAIEdit('free'), [openAIEdit]);

  const handleAIEditClose = useCallback(() => {
    setAiEditState(null);
  }, []);

  const handleAIEditApply = useCallback((nodeId: string, modifiedNode: unknown, explanation: string) => {
    pushHistory();
    applyAINodeEdit(nodeId, modifiedNode);
    setAiEditState(prev => prev ? { ...prev, result: { explanation, applied: true } } : null);
  }, [pushHistory, applyAINodeEdit]);

  const handleAIEditUndo = useCallback(() => {
    undo();
    setAiEditState(null);
  }, [undo]);

  // 将屏幕坐标转换为画布坐标
  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (screenX - rect.left - panX) / zoom,
      y: (screenY - rect.top - panY) / zoom,
    };
  }, [zoom, panX, panY]);

  // 处理鼠标滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // 计算鼠标在缩放前的画布坐标
    const canvasX = (mouseX - panX) / zoom;
    const canvasY = (mouseY - panY) / zoom;
    
    // 计算新缩放值
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(4, zoom * delta));
    
    // 计算新的平移值，使鼠标位置保持不变
    const newPanX = mouseX - canvasX * newZoom;
    const newPanY = mouseY - canvasY * newZoom;
    
    setZoom(newZoom);
    setPan(newPanX, newPanY);
  }, [zoom, panX, panY, setZoom, setPan]);

  // 处理鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 隐藏上下文菜单
    if (contextMenu.visible) {
      setContextMenu({ ...contextMenu, visible: false });
    }
    
    if (e.button === 2 || e.button === 1 || (spacePressed && e.button === 0)) {
      // 右键、中键或 Space+左键 = 平移画布
      e.preventDefault();
      setIsPanning(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    } else if (e.button === 0) {
      if (tool === 'select') {
        const canvasPos = screenToCanvas(e.clientX, e.clientY);
        const node = findNodeAtPoint(canvasPos.x + rootOffsetX, canvasPos.y + rootOffsetY);
        if (node) {
          // 点击节点：选中并准备拖拽
          if (!selectedNodeIds.includes(node.id)) {
            selectNode(node.id, e.shiftKey || e.ctrlKey || e.metaKey);
          }
          // 设置待拖拽状态（需要超过阈值才真正开始拖拽）
          pendingDragRef.current = {
            nodeId: node.id,
            startPos: canvasPos,
            startRect: { ...node.rect },
            screenX: e.clientX,
            screenY: e.clientY
          };
          dragThresholdRef.current = 0;
        } else {
          // 点击空白处清除选择
          clearSelection();
          pendingDragRef.current = null;
        }
      } else if (tool === 'marquee') {
        // 框选工具：开始框选
        e.preventDefault();
        const canvasPos = screenToCanvas(e.clientX, e.clientY);
        setIsMarqueeSelecting(true);
        setMarqueeRect({
          x: canvasPos.x,
          y: canvasPos.y,
          width: 0,
          height: 0,
        });
      }
    }
  }, [spacePressed, tool, screenToCanvas, findNodeAtPoint, clearSelection, selectNode, selectedNodeIds, contextMenu, rootOffsetX, rootOffsetY]);

  // 处理鼠标移动
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setPan(panX + dx, panY + dy);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    } else if (isMarqueeSelecting && marqueeRect) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      setMarqueeRect({
        ...marqueeRect,
        width: canvasPos.x - marqueeRect.x,
        height: canvasPos.y - marqueeRect.y,
      });
    } else if (isDragging && dragNodeId && dragNodeStartRect) {
      // 拖拽移动节点
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const dx = canvasPos.x - dragStartPos.x;
      const dy = canvasPos.y - dragStartPos.y;
      
      updateNodeRect(dragNodeId, {
        x: dragNodeStartRect.x + dx,
        y: dragNodeStartRect.y + dy
      });
    } else if (pendingDragRef.current) {
      // 检测是否超过拖拽阈值(5px)，超过则开始拖拽
      const dx = e.clientX - pendingDragRef.current.screenX;
      const dy = e.clientY - pendingDragRef.current.screenY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 5) {
        const pd = pendingDragRef.current;
        setIsDragging(true);
        setDragNodeId(pd.nodeId);
        setDragStartPos(pd.startPos);
        setDragNodeStartRect(pd.startRect);
        pendingDragRef.current = null;
      }
    }
  }, [isPanning, isMarqueeSelecting, isDragging, marqueeRect, lastMousePos, panX, panY, setPan, screenToCanvas, dragNodeId, dragStartPos, dragNodeStartRect, updateNodeRect]);

  // 处理鼠标松开
  const handleMouseUp = useCallback(() => {
    if (isMarqueeSelecting && marqueeRect) {
      // 完成框选
      const rect: Rect = {
        x: Math.min(marqueeRect.x, marqueeRect.x + marqueeRect.width),
        y: Math.min(marqueeRect.y, marqueeRect.y + marqueeRect.height),
        width: Math.abs(marqueeRect.width),
        height: Math.abs(marqueeRect.height),
      };
      
      if (rect.width > 5 && rect.height > 5) {
        // 将框选矩形从内容层坐标转换为页面绝对坐标，与节点 rect 一致
        const adjustedRect: Rect = {
          x: rect.x + rootOffsetX,
          y: rect.y + rootOffsetY,
          width: rect.width,
          height: rect.height,
        };
        const nodes = findNodesInRect(adjustedRect);
        // 选中所有相交的节点
        nodes.forEach(node => {
          if (!selectedNodeIds.includes(node.id)) {
            selectNode(node.id, true);
          }
        });
      }
    }
    
    if (isDragging && dragNodeId) {
      // 结束拖拽，推入历史
      pushHistory();
    }
    
    pendingDragRef.current = null;
    setIsPanning(false);
    setIsMarqueeSelecting(false);
    setIsDragging(false);
    setDragNodeId(null);
    setDragNodeStartRect(null);
    setMarqueeRect(null);
  }, [isMarqueeSelecting, isDragging, marqueeRect, findNodesInRect, selectNode, selectedNodeIds, dragNodeId, pushHistory, rootOffsetX, rootOffsetY]);

  // 监听Space键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        setSpacePressed(true);
        if (canvasRef.current) {
          canvasRef.current.style.cursor = 'grab';
        }
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
        if (canvasRef.current) {
          canvasRef.current.style.cursor = '';
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // 处理节点双击 - 行内编辑
  const handleNodeDoubleClick = useCallback((node: SnapshotNode) => {
    if (node.nodeType === 3 && node.rect) {
      // 文本节点：显示行内编辑
      const textNode = node as { text: string };
      setInlineEdit({
        visible: true,
        nodeId: node.id,
        x: node.rect.x - rootOffsetX,
        y: node.rect.y - rootOffsetY,
        width: Math.max(node.rect.width, 100),
        height: Math.max(node.rect.height, 30),
        text: textNode.text
      });
    }
  }, [rootOffsetX, rootOffsetY]);

  // 处理节点右键菜单
  const handleNodeContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      nodeId
    });
  }, []);

  // 处理行内编辑保存
  const handleInlineEditSave = useCallback((text: string) => {
    if (inlineEdit.nodeId) {
      updateNodeText(inlineEdit.nodeId, text);
    }
    setInlineEdit({ ...inlineEdit, visible: false, nodeId: null });
  }, [inlineEdit, updateNodeText]);

  // 处理行内编辑取消
  const handleInlineEditCancel = useCallback(() => {
    setInlineEdit({ ...inlineEdit, visible: false, nodeId: null });
  }, [inlineEdit]);

  // 处理选中节点的拖拽开始
  const handleSelectionMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return;
    
    const node = findNodeById(nodeId);
    if (!node || !node.rect) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    
    setIsDragging(true);
    setDragNodeId(nodeId);
    setDragStartPos(canvasPos);
    setDragNodeStartRect({ ...node.rect });
  }, [findNodeById, screenToCanvas]);

  // 获取选中的节点
  const selectedNodes = selectedNodeIds
    .map(id => findNodeById(id))
    .filter((node): node is SnapshotNode => node !== null);

  // 获取hover的节点
  const hoveredNode = hoveredNodeId ? findNodeById(hoveredNodeId) : null;

  if (!captureTree) {
    return (
      <div className="canvas-container canvas-empty" ref={canvasRef}>
        <div className="canvas-placeholder">
          <p>暂无数据</p>
          <p className="hint">请等待页面加载完成</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`canvas-container ${isPanning ? 'panning' : ''} ${tool === 'marquee' ? 'marquee-mode' : ''} ${isDragging ? 'dragging' : ''}`}
      ref={canvasRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="canvas-viewport"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {/* 截图底图 */}
        {screenshotUrl && (
          <img
            src={screenshotUrl}
            alt="Page Screenshot"
            className="canvas-screenshot"
            style={{
              width: captureTree.documentRect?.width || captureTree.root?.rect?.width || '100%',
              height: captureTree.documentRect?.height || captureTree.root?.rect?.height || '100%',
            }}
            draggable={false}
          />
        )}
        
        {/* 内容渲染层 - 渲染 captureTree 实际内容 */}
        {captureTree.root && captureTree.root.rect && (
          <div className="capture-content-layer" style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: captureTree.root.rect.cssWidth || captureTree.root.rect.width,
            height: captureTree.root.rect.cssHeight || captureTree.root.rect.height,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}>
            <CaptureNodeRenderer node={captureTree.root} />
          </div>
        )}
        
        {/* 节点叠加层容器 */}
        <div className="node-overlays-container">
          {renderNodeOverlays(
            captureTree.root,
            selectedNodeIds,
            hoveredNodeId,
            selectNode,
            hoverNode,
            handleNodeDoubleClick,
            handleNodeContextMenu,
            rootOffsetX,
            rootOffsetY
          )}
        </div>
        
        {/* 选中节点的高亮框 */}
        {selectedNodes.map(node => (
          <SelectionOverlay 
            key={node.id} 
            node={node} 
            onMouseDown={(e) => handleSelectionMouseDown(e, node.id)}
            rootOffsetX={rootOffsetX}
            rootOffsetY={rootOffsetY}
          />
        ))}
        
        {/* Hover高亮 */}
        {hoveredNode && <HoverOverlay node={hoveredNode} rootOffsetX={rootOffsetX} rootOffsetY={rootOffsetY} />}
        
        {/* 框选矩形 */}
        {marqueeRect && <MarqueeSelection rect={marqueeRect} />}
        
        {/* 行内编辑框 */}
        <InlineEdit
          state={inlineEdit}
          onSave={handleInlineEditSave}
          onCancel={handleInlineEditCancel}
        />
      </div>
      
      {/* 缩放指示器 */}
      <div className="zoom-indicator">
        {Math.round(zoom * 100)}%
      </div>
      
      {/* 上下文菜单 */}
      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu({ ...contextMenu, visible: false })}
        onAddChild={() => contextMenu.nodeId && addChildNode(contextMenu.nodeId)}
        onAddSibling={() => contextMenu.nodeId && addSiblingNode(contextMenu.nodeId)}
        onDuplicate={() => contextMenu.nodeId && duplicateNode(contextMenu.nodeId)}
        onDelete={() => contextMenu.nodeId && deleteNode(contextMenu.nodeId)}
        onMoveUp={() => contextMenu.nodeId && moveNodeUp(contextMenu.nodeId)}
        onMoveDown={() => contextMenu.nodeId && moveNodeDown(contextMenu.nodeId)}
        onAIEditStyle={handleAIEditStyle}
        onAIEditContent={handleAIEditContent}
        onAIEditLayout={handleAIEditLayout}
        onAIEditFree={handleAIEditFree}
        onSendToAI={() => {
          if (contextMenu.nodeId) {
            selectNode(contextMenu.nodeId);
          }
          setShowAIPanel(true);
        }}
      />

      {/* AI 编辑 Popover */}
      <AIEditPopover
        state={aiEditState}
        node={aiEditState?.nodeId ? findNodeById(aiEditState.nodeId) : null}
        onClose={handleAIEditClose}
        onApply={handleAIEditApply}
        onUndo={handleAIEditUndo}
      />
    </div>
  );
}
