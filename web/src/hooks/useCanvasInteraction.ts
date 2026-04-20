/**
 * useCanvasInteraction — state machine for canvas mouse interactions.
 * Handles: select, pan, marquee, drag, inline-edit, context-menu.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore.ts';
import type { Rect } from '../types/capture.ts';
import type { SnapshotNode } from '../engine/sceneGraph.ts';

export interface MarqueeRect { x: number; y: number; width: number; height: number }

export interface ContextMenuState {
  visible: boolean; x: number; y: number; nodeId: string | null;
}

export interface InlineEditState {
  visible: boolean; nodeId: string | null;
  x: number; y: number; width: number; height: number; text: string;
}

interface DragState {
  active: boolean;
  nodeId: string | null;
  startCanvas: { x: number; y: number };
  startRect: Rect | null;
}

export function useCanvasInteraction(
  screenToCanvas: (sx: number, sy: number) => { x: number; y: number },
  rootOffsetX: number,
  rootOffsetY: number,
) {
  const {
    tool, selectedNodeIds, selectNode, clearSelection,
    hoverNode, findNodeAtPoint, findNodesInRect, findNodeById,
    updateNodeRect, pushHistory,
  } = useEditorStore();

  // ── panning ──
  const [isPanning, setIsPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // ── marquee ──
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [isMarquee, setIsMarquee] = useState(false);

  // ── drag ──
  const [drag, setDrag] = useState<DragState>({ active: false, nodeId: null, startCanvas: { x: 0, y: 0 }, startRect: null });
  const pendingDragRef = useRef<{ nodeId: string; startCanvas: { x: number; y: number }; startRect: Rect; screenX: number; screenY: number } | null>(null);

  // ── context menu ──
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, nodeId: null });

  // ── inline edit ──
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>({ visible: false, nodeId: null, x: 0, y: 0, width: 0, height: 0, text: '' });

  // ── space key ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat) setSpacePressed(true); };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpacePressed(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ── mouse down ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (contextMenu.visible) setContextMenu({ ...contextMenu, visible: false });

    if (e.button === 2 || e.button === 1 || (spacePressed && e.button === 0)) {
      e.preventDefault();
      setIsPanning(true);
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (e.button === 0 && tool === 'select') {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const node = findNodeAtPoint(pos.x + rootOffsetX, pos.y + rootOffsetY);
      if (node) {
        if (!selectedNodeIds.includes(node.id)) selectNode(node.id, e.shiftKey || e.ctrlKey || e.metaKey);
        pendingDragRef.current = { nodeId: node.id, startCanvas: pos, startRect: { ...node.rect }, screenX: e.clientX, screenY: e.clientY };
      } else {
        clearSelection();
        pendingDragRef.current = null;
      }
    } else if (e.button === 0 && tool === 'marquee') {
      e.preventDefault();
      const pos = screenToCanvas(e.clientX, e.clientY);
      setIsMarquee(true);
      setMarqueeRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
    }
  }, [spacePressed, tool, screenToCanvas, findNodeAtPoint, clearSelection, selectNode, selectedNodeIds, contextMenu, rootOffsetX, rootOffsetY]);

  // ── mouse move ──
  const handleMouseMove = useCallback((e: React.MouseEvent, panX: number, panY: number, setPan: (x: number, y: number) => void) => {
    if (isPanning) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      setPan(panX + dx, panY + dy);
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (isMarquee && marqueeRect) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setMarqueeRect({ ...marqueeRect, width: pos.x - marqueeRect.x, height: pos.y - marqueeRect.y });
      return;
    }
    if (drag.active && drag.nodeId && drag.startRect) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const dx = pos.x - drag.startCanvas.x;
      const dy = pos.y - drag.startCanvas.y;
      updateNodeRect(drag.nodeId, { x: drag.startRect.x + dx, y: drag.startRect.y + dy });
      return;
    }
    if (pendingDragRef.current) {
      const dx = e.clientX - pendingDragRef.current.screenX;
      const dy = e.clientY - pendingDragRef.current.screenY;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        const pd = pendingDragRef.current;
        setDrag({ active: true, nodeId: pd.nodeId, startCanvas: pd.startCanvas, startRect: pd.startRect });
        pendingDragRef.current = null;
      }
    }
  }, [isPanning, isMarquee, marqueeRect, drag, screenToCanvas, updateNodeRect]);

  // ── mouse up ──
  const handleMouseUp = useCallback(() => {
    if (isMarquee && marqueeRect) {
      const r: Rect = {
        x: Math.min(marqueeRect.x, marqueeRect.x + marqueeRect.width),
        y: Math.min(marqueeRect.y, marqueeRect.y + marqueeRect.height),
        width: Math.abs(marqueeRect.width),
        height: Math.abs(marqueeRect.height),
      };
      if (r.width > 5 && r.height > 5) {
        const adjusted: Rect = { x: r.x + rootOffsetX, y: r.y + rootOffsetY, width: r.width, height: r.height };
        const nodes = findNodesInRect(adjusted);
        nodes.forEach((n) => { if (!selectedNodeIds.includes(n.id)) selectNode(n.id, true); });
      }
    }
    if (drag.active && drag.nodeId) pushHistory();
    pendingDragRef.current = null;
    setIsPanning(false);
    setIsMarquee(false);
    setDrag({ active: false, nodeId: null, startCanvas: { x: 0, y: 0 }, startRect: null });
    setMarqueeRect(null);
  }, [isMarquee, marqueeRect, drag, findNodesInRect, selectNode, selectedNodeIds, pushHistory, rootOffsetX, rootOffsetY]);

  // ── double click (inline edit) ──
  const handleNodeDoubleClick = useCallback((node: SnapshotNode) => {
    if (node.nodeType === 3 && node.rect) {
      setInlineEdit({
        visible: true, nodeId: node.id,
        x: node.rect.x - rootOffsetX, y: node.rect.y - rootOffsetY,
        width: Math.max(node.rect.width, 100), height: Math.max(node.rect.height, 30),
        text: (node as { text: string }).text,
      });
    }
  }, [rootOffsetX, rootOffsetY]);

  // ── context menu ──
  const handleNodeContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, nodeId });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu((s) => ({ ...s, visible: false })), []);

  // ── selection drag (from overlay) ──
  const handleSelectionDragStart = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return;
    const node = findNodeById(nodeId);
    if (!node || !node.rect) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = screenToCanvas(e.clientX, e.clientY);
    setDrag({ active: true, nodeId, startCanvas: pos, startRect: { ...node.rect } });
  }, [findNodeById, screenToCanvas]);

  // ── inline edit actions ──
  const closeInlineEdit = useCallback(() => setInlineEdit((s) => ({ ...s, visible: false, nodeId: null })), []);

  return {
    isPanning, spacePressed, isMarquee, marqueeRect,
    drag, contextMenu, inlineEdit,
    handleMouseDown, handleMouseMove, handleMouseUp,
    handleNodeDoubleClick, handleNodeContextMenu, closeContextMenu,
    handleSelectionDragStart, closeInlineEdit, setInlineEdit,
  };
}
