/**
 * CanvasMain — the refactored Canvas component, composed from separated layers.
 *
 * Architecture (inspired by OpenPencil's layered approach):
 *   CanvasMain (container + events)
 *     └─ viewport transform div
 *         ├─ ScreenshotLayer   (background image)
 *         ├─ ContentLayer      (DOM rendering of CaptureTree)
 *         ├─ OverlayLayer      (hit areas, selection, hover, marquee, snap guides)
 *         └─ InlineEdit        (text editing overlay)
 *     └─ zoom indicator
 *     └─ ContextMenu          (fixed position)
 *     └─ AIEditPopover         (fixed position)
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../../../stores/editorStore.ts';
import type { SnapshotNode, Rect } from '../../../types/capture.ts';

interface SnapGuide {
  orientation: 'horizontal' | 'vertical';
  position: number;
  type: 'edge' | 'center' | 'spacing';
}
import type { AIEditState } from '../AIEditPopover.tsx';
import { AIEditPopover } from '../AIEditPopover.tsx';
import { ScreenshotLayer } from './ScreenshotLayer.tsx';
import { ContentLayer } from './ContentLayer.tsx';
import { OverlayLayer } from './OverlayLayer.tsx';
import { ContextMenu } from './ContextMenu.tsx';
import type { ContextMenuState } from './ContextMenu.tsx';
import { InlineEdit } from './InlineEdit.tsx';
import type { InlineEditState } from './InlineEdit.tsx';
import '../Canvas.css';

export function CanvasMain() {
  const store = useEditorStore();
  const {
    captureTree, previewTree, screenshotUrl, zoom, panX, panY, tool,
    selectedNodeIds, hoveredNodeId,
    selectNode, hoverNode, clearSelection, setZoom, setPan,
    findNodeById, findNodeAtPoint, findNodesInRect,
    updateNodeText, updateNodeRect,
    addChildNode, addSiblingNode, duplicateNode, deleteNode,
    moveNodeUp, moveNodeDown,
    pushHistory, applyAINodeEdit, undo, setShowAIPanel,
  } = store;

  const displayTree = previewTree || captureTree;
  const rootRect = displayTree?.root?.rect;
  const rootOffsetX = rootRect?.x ?? 0;
  const rootOffsetY = rootRect?.y ?? 0;

  const containerRef = useRef<HTMLDivElement>(null);

  // --- Interaction state ---
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isMarquee, setIsMarquee] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ nodeId: string; startPos: { x: number; y: number }; startRect: Rect } | null>(null);
  const pendingDragRef = useRef<{ nodeId: string; startPos: { x: number; y: number }; startRect: Rect; sx: number; sy: number } | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, nodeId: null });
  // Inline edit
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>({ visible: false, nodeId: null, x: 0, y: 0, width: 0, height: 0, text: '' });
  // AI edit popover
  const [aiEditState, setAiEditState] = useState<AIEditState | null>(null);

  // --- Coordinate transform ---
  const screenToCanvas = useCallback((sx: number, sy: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: (sx - r.left - panX) / zoom, y: (sy - r.top - panY) / zoom };
  }, [zoom, panX, panY]);

  // --- Space key ---
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat) { setSpacePressed(true); if (containerRef.current) containerRef.current.style.cursor = 'grab'; } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') { setSpacePressed(false); if (containerRef.current) containerRef.current.style.cursor = ''; } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // --- Mouse handlers ---
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const cx = (mx - panX) / zoom, cy = (my - panY) / zoom;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const nz = Math.max(0.1, Math.min(4, zoom * factor));
    setZoom(nz);
    setPan(mx - cx * nz, my - cy * nz);
  }, [zoom, panX, panY, setZoom, setPan]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (contextMenu.visible) setContextMenu(s => ({ ...s, visible: false }));

    if (e.button === 2 || e.button === 1 || (spacePressed && e.button === 0)) {
      e.preventDefault();
      setIsPanning(true);
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;

    if (tool === 'select') {
      const cp = screenToCanvas(e.clientX, e.clientY);
      const node = findNodeAtPoint(cp.x + rootOffsetX, cp.y + rootOffsetY);
      if (node) {
        if (!selectedNodeIds.includes(node.id)) selectNode(node.id, e.shiftKey || e.ctrlKey || e.metaKey);
        pendingDragRef.current = { nodeId: node.id, startPos: cp, startRect: { ...node.rect }, sx: e.clientX, sy: e.clientY };
      } else {
        clearSelection();
        pendingDragRef.current = null;
      }
    } else if (tool === 'marquee') {
      e.preventDefault();
      const cp = screenToCanvas(e.clientX, e.clientY);
      setIsMarquee(true);
      setMarqueeRect({ x: cp.x, y: cp.y, width: 0, height: 0 });
    }
  }, [spacePressed, tool, screenToCanvas, findNodeAtPoint, clearSelection, selectNode, selectedNodeIds, contextMenu.visible, rootOffsetX, rootOffsetY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastMouseRef.current.x, dy = e.clientY - lastMouseRef.current.y;
      setPan(panX + dx, panY + dy);
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (isMarquee && marqueeRect) {
      const cp = screenToCanvas(e.clientX, e.clientY);
      setMarqueeRect({ ...marqueeRect, width: cp.x - marqueeRect.x, height: cp.y - marqueeRect.y });
      return;
    }
    if (isDragging && dragRef.current) {
      const cp = screenToCanvas(e.clientX, e.clientY);
      const dx = cp.x - dragRef.current.startPos.x, dy = cp.y - dragRef.current.startPos.y;
      updateNodeRect(dragRef.current.nodeId, { x: dragRef.current.startRect.x + dx, y: dragRef.current.startRect.y + dy });
      return;
    }
    if (pendingDragRef.current) {
      const dx = e.clientX - pendingDragRef.current.sx, dy = e.clientY - pendingDragRef.current.sy;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        const pd = pendingDragRef.current;
        dragRef.current = { nodeId: pd.nodeId, startPos: pd.startPos, startRect: pd.startRect };
        pendingDragRef.current = null;
        setIsDragging(true);
      }
    }
  }, [isPanning, isMarquee, isDragging, marqueeRect, panX, panY, setPan, screenToCanvas, updateNodeRect]);

  const handleMouseUp = useCallback(() => {
    if (isMarquee && marqueeRect) {
      const rect: Rect = {
        x: Math.min(marqueeRect.x, marqueeRect.x + marqueeRect.width) + rootOffsetX,
        y: Math.min(marqueeRect.y, marqueeRect.y + marqueeRect.height) + rootOffsetY,
        width: Math.abs(marqueeRect.width), height: Math.abs(marqueeRect.height),
      };
      if (rect.width > 5 && rect.height > 5) {
        findNodesInRect(rect).forEach(n => { if (!selectedNodeIds.includes(n.id)) selectNode(n.id, true); });
      }
    }
    if (isDragging && dragRef.current) pushHistory();
    pendingDragRef.current = null;
    dragRef.current = null;
    setIsPanning(false);
    setIsMarquee(false);
    setIsDragging(false);
    setMarqueeRect(null);
    setSnapGuides([]);
  }, [isMarquee, isDragging, marqueeRect, findNodesInRect, selectNode, selectedNodeIds, pushHistory, rootOffsetX, rootOffsetY]);

  // --- Node interaction callbacks ---
  const handleNodeDoubleClick = useCallback((node: SnapshotNode) => {
    if (node.nodeType === 3 && node.rect) {
      const tn = node as { text: string; rect: Rect };
      setInlineEdit({ visible: true, nodeId: node.id, x: tn.rect.x - rootOffsetX, y: tn.rect.y - rootOffsetY, width: Math.max(tn.rect.width, 100), height: Math.max(tn.rect.height, 30), text: tn.text });
    }
  }, [rootOffsetX, rootOffsetY]);

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, nodeId });
  }, []);

  const handleInlineEditSave = useCallback((text: string) => {
    if (inlineEdit.nodeId) updateNodeText(inlineEdit.nodeId, text);
    setInlineEdit(s => ({ ...s, visible: false, nodeId: null }));
  }, [inlineEdit.nodeId, updateNodeText]);

  const handleSelectionMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return;
    const node = findNodeById(nodeId);
    if (!node?.rect) return;
    e.preventDefault(); e.stopPropagation();
    const cp = screenToCanvas(e.clientX, e.clientY);
    setIsDragging(true);
    dragRef.current = { nodeId, startPos: cp, startRect: { ...node.rect } };
  }, [findNodeById, screenToCanvas]);

  // AI edit helpers
  const openAIEdit = useCallback((type: AIEditState['type']) => {
    if (!contextMenu.nodeId) return;
    setAiEditState({ visible: true, x: contextMenu.x, y: contextMenu.y, nodeId: contextMenu.nodeId, type, loading: false, result: null, error: null, lastRequirement: '' });
  }, [contextMenu]);

  const handleAIEditApply = useCallback((nodeId: string, modifiedNode: unknown, explanation: string) => {
    pushHistory();
    applyAINodeEdit(nodeId, modifiedNode);
    setAiEditState(prev => prev ? { ...prev, result: { explanation, applied: true } } : null);
  }, [pushHistory, applyAINodeEdit]);

  // Resolved nodes
  const selectedNodes = selectedNodeIds.map(id => findNodeById(id)).filter((n): n is SnapshotNode => n !== null);
  const hoveredNode = hoveredNodeId ? findNodeById(hoveredNodeId) : null;

  // --- Render ---
  if (!displayTree) {
    return (
      <div className="canvas-container canvas-empty" ref={containerRef}>
        <div className="canvas-placeholder"><p>暂无数据</p><p className="hint">请等待页面加载完成</p></div>
      </div>
    );
  }

  return (
    <div
      className={`canvas-container ${isPanning ? 'panning' : ''} ${isDragging ? 'dragging' : ''} ${tool === 'marquee' ? 'marquee-mode' : ''}`}
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="canvas-viewport" style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        {screenshotUrl && (
          <ScreenshotLayer
            url={screenshotUrl}
            width={displayTree.documentRect?.width || displayTree.root?.rect?.width || '100%'}
            height={displayTree.documentRect?.height || displayTree.root?.rect?.height || '100%'}
          />
        )}
        {displayTree.root && <ContentLayer root={displayTree.root} />}
        <OverlayLayer
          root={displayTree.root}
          selectedNodeIds={selectedNodeIds}
          hoveredNodeId={hoveredNodeId}
          selectedNodes={selectedNodes}
          hoveredNode={hoveredNode}
          selectNode={selectNode}
          hoverNode={hoverNode}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeContextMenu={handleNodeContextMenu}
          onSelectionMouseDown={handleSelectionMouseDown}
          marqueeRect={marqueeRect}
          snapGuides={snapGuides}
          rootOffsetX={rootOffsetX}
          rootOffsetY={rootOffsetY}
        />
        <InlineEdit state={inlineEdit} onSave={handleInlineEditSave} onCancel={() => setInlineEdit(s => ({ ...s, visible: false, nodeId: null }))} />
      </div>

      <div className="zoom-indicator">{Math.round(zoom * 100)}%</div>

      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(s => ({ ...s, visible: false }))}
        onAddChild={() => contextMenu.nodeId && addChildNode(contextMenu.nodeId)}
        onAddSibling={() => contextMenu.nodeId && addSiblingNode(contextMenu.nodeId)}
        onDuplicate={() => contextMenu.nodeId && duplicateNode(contextMenu.nodeId)}
        onDelete={() => contextMenu.nodeId && deleteNode(contextMenu.nodeId)}
        onMoveUp={() => contextMenu.nodeId && moveNodeUp(contextMenu.nodeId)}
        onMoveDown={() => contextMenu.nodeId && moveNodeDown(contextMenu.nodeId)}
        onAIEditStyle={() => openAIEdit('style')}
        onAIEditContent={() => openAIEdit('content')}
        onAIEditLayout={() => openAIEdit('layout')}
        onAIEditFree={() => openAIEdit('free')}
        onSendToAI={() => { if (contextMenu.nodeId) selectNode(contextMenu.nodeId); setShowAIPanel(true); }}
      />

      <AIEditPopover
        state={aiEditState}
        node={aiEditState?.nodeId ? findNodeById(aiEditState.nodeId) : null}
        onClose={() => setAiEditState(null)}
        onApply={handleAIEditApply}
        onUndo={() => { undo(); setAiEditState(null); }}
      />
    </div>
  );
}
