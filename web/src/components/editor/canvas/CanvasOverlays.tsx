/**
 * CanvasOverlays — selection, hover, marquee, snap guides, inline edit overlays.
 * Separated from Canvas for clarity.
 */
import React, { useRef, useEffect } from 'react';
import type { SnapshotNode, Rect } from '../../../types/capture.ts';
import type { MarqueeRect, InlineEditState } from '../../../hooks/useCanvasInteraction.ts';
import type { GuideLine } from '../../../hooks/useSnapGuides.ts';

// ── Node overlay (hit target) ──────────────────────────────────────────────

export function NodeOverlay({
  node, isSelected, isHovered, onSelect, onHover, onDoubleClick, onContextMenu, rootOffsetX, rootOffsetY,
}: {
  node: SnapshotNode; isSelected: boolean; isHovered: boolean;
  onSelect: (e: React.MouseEvent) => void; onHover: (h: boolean) => void;
  onDoubleClick?: (e: React.MouseEvent) => void; onContextMenu?: (e: React.MouseEvent) => void;
  rootOffsetX: number; rootOffsetY: number;
}) {
  const { rect } = node;
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return (
    <div
      className={`node-overlay ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${node.nodeType === 3 ? 'text-node' : ''}`}
      style={{ position: 'absolute', left: rect.x - rootOffsetX, top: rect.y - rootOffsetY, width: rect.width, height: rect.height }}
      onClick={onSelect} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}
      onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}
    />
  );
}

// ── Selection overlay ──────────────────────────────────────────────────────

export function SelectionOverlay({
  node, onMouseDown, rootOffsetX, rootOffsetY,
}: {
  node: SnapshotNode; onMouseDown?: (e: React.MouseEvent) => void;
  rootOffsetX: number; rootOffsetY: number;
}) {
  const { rect } = node;
  if (!rect) return null;
  const tag = node.nodeType === 3 ? 'text' : (node as { tag: string }).tag;
  return (
    <div
      className="selection-overlay"
      style={{ position: 'absolute', left: rect.x - rootOffsetX - 2, top: rect.y - rootOffsetY - 2, width: rect.width + 4, height: rect.height + 4 }}
      onMouseDown={onMouseDown}
    >
      <div className="selection-label">{tag} {Math.round(rect.width)}×{Math.round(rect.height)}</div>
      <div className="resize-handle nw" /><div className="resize-handle ne" />
      <div className="resize-handle sw" /><div className="resize-handle se" />
    </div>
  );
}

// ── Hover overlay ──────────────────────────────────────────────────────────

export function HoverOverlay({ node, rootOffsetX, rootOffsetY }: { node: SnapshotNode; rootOffsetX: number; rootOffsetY: number }) {
  const { rect } = node;
  if (!rect) return null;
  return (
    <div className="hover-overlay" style={{ position: 'absolute', left: rect.x - rootOffsetX - 1, top: rect.y - rootOffsetY - 1, width: rect.width + 2, height: rect.height + 2 }} />
  );
}

// ── Marquee ────────────────────────────────────────────────────────────────

export function MarqueeSelection({ rect }: { rect: MarqueeRect }) {
  return (
    <div className="marquee-selection" style={{
      position: 'absolute',
      left: Math.min(rect.x, rect.x + rect.width), top: Math.min(rect.y, rect.y + rect.height),
      width: Math.abs(rect.width), height: Math.abs(rect.height),
    }} />
  );
}

// ── Snap guides ────────────────────────────────────────────────────────────

export function SnapGuideLines({ guides, rootOffsetX, rootOffsetY }: { guides: GuideLine[]; rootOffsetX: number; rootOffsetY: number }) {
  if (guides.length === 0) return null;
  return (
    <>
      {guides.map((g, i) => (
        <div
          key={i}
          className={`snap-guide ${g.orientation}`}
          style={
            g.orientation === 'vertical'
              ? { position: 'absolute', left: g.position - rootOffsetX, top: 0, width: 1, height: '100%', backgroundColor: '#ff6b6b', pointerEvents: 'none', zIndex: 150 }
              : { position: 'absolute', top: g.position - rootOffsetY, left: 0, height: 1, width: '100%', backgroundColor: '#ff6b6b', pointerEvents: 'none', zIndex: 150 }
          }
        />
      ))}
    </>
  );
}

// ── Inline edit ────────────────────────────────────────────────────────────

export function InlineEdit({ state, onSave, onCancel }: { state: InlineEditState; onSave: (text: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  if (!state.visible) return null;
  return (
    <div className="inline-edit-overlay" style={{ position: 'absolute', left: state.x, top: state.y, width: state.width, height: state.height, zIndex: 300 }}>
      <textarea
        ref={ref} className="inline-edit-textarea" defaultValue={state.text}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(ref.current?.value || ''); } else if (e.key === 'Escape') onCancel(); }}
        onBlur={() => onSave(ref.current?.value || '')}
        style={{ width: '100%', height: '100%', resize: 'none' }}
      />
    </div>
  );
}

// ── Render all node overlays recursively ───────────────────────────────────

export function renderNodeOverlays(
  node: SnapshotNode | undefined,
  selectedNodeIds: string[],
  hoveredNodeId: string | null,
  selectNode: (id: string, multi?: boolean) => void,
  hoverNode: (id: string | null) => void,
  onDoubleClick: (node: SnapshotNode) => void,
  onContextMenu: (e: React.MouseEvent, nodeId: string) => void,
  rootOffsetX: number,
  rootOffsetY: number,
): JSX.Element[] {
  if (!node) return [];
  const overlays: JSX.Element[] = [];
  overlays.push(
    <NodeOverlay
      key={node.id} node={node}
      isSelected={selectedNodeIds.includes(node.id)}
      isHovered={hoveredNodeId === node.id}
      onSelect={(e) => { e.stopPropagation(); selectNode(node.id, e.shiftKey || e.ctrlKey || e.metaKey); }}
      onHover={(h) => hoverNode(h ? node.id : null)}
      onDoubleClick={() => onDoubleClick(node)}
      onContextMenu={(e) => onContextMenu(e, node.id)}
      rootOffsetX={rootOffsetX} rootOffsetY={rootOffsetY}
    />,
  );
  if (node.nodeType === 1) {
    const el = node as { childNodes: SnapshotNode[] };
    for (const child of el.childNodes) {
      overlays.push(...renderNodeOverlays(child, selectedNodeIds, hoveredNodeId, selectNode, hoverNode, onDoubleClick, onContextMenu, rootOffsetX, rootOffsetY));
    }
  }
  return overlays;
}
