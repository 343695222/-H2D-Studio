/**
 * OverlayLayer — renders interactive overlays: node hit areas,
 * selection boxes, hover highlights, marquee, snap guides.
 */
import React from 'react';
import type { SnapshotNode, ElementSnapshot } from '../../../types/capture.ts';

interface SnapGuide {
  orientation: 'horizontal' | 'vertical';
  position: number;
  type: 'edge' | 'center' | 'spacing';
}

// ---------------------------------------------------------------------------
// Node overlay (invisible hit area for each node)
// ---------------------------------------------------------------------------

interface NodeOverlayProps {
  node: SnapshotNode;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onHover: (hovered: boolean) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  rootOffsetX: number;
  rootOffsetY: number;
}

function NodeOverlay({ node, isSelected, isHovered, onSelect, onHover, onDoubleClick, onContextMenu, rootOffsetX, rootOffsetY }: NodeOverlayProps) {
  const { rect } = node;
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return (
    <div
      className={`node-overlay ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${node.nodeType === 3 ? 'text-node' : ''}`}
      style={{ position: 'absolute', left: rect.x - rootOffsetX, top: rect.y - rootOffsetY, width: rect.width, height: rect.height }}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    />
  );
}

// ---------------------------------------------------------------------------
// Selection overlay (blue border + handles + label)
// ---------------------------------------------------------------------------

interface SelectionOverlayProps {
  node: SnapshotNode;
  onMouseDown?: (e: React.MouseEvent) => void;
  rootOffsetX: number;
  rootOffsetY: number;
}

function SelectionOverlay({ node, onMouseDown, rootOffsetX, rootOffsetY }: SelectionOverlayProps) {
  const { rect } = node;
  if (!rect) return null;
  const tag = node.nodeType === 3 ? 'text' : (node as ElementSnapshot).tag;
  return (
    <div
      className="selection-overlay"
      style={{ position: 'absolute', left: rect.x - rootOffsetX - 2, top: rect.y - rootOffsetY - 2, width: rect.width + 4, height: rect.height + 4 }}
      onMouseDown={onMouseDown}
    >
      <div className="selection-label">{tag} {Math.round(rect.width)}×{Math.round(rect.height)}</div>
      <div className="resize-handle nw" />
      <div className="resize-handle ne" />
      <div className="resize-handle sw" />
      <div className="resize-handle se" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hover overlay
// ---------------------------------------------------------------------------

function HoverOverlay({ node, rootOffsetX, rootOffsetY }: { node: SnapshotNode; rootOffsetX: number; rootOffsetY: number }) {
  const { rect } = node;
  if (!rect) return null;
  return (
    <div
      className="hover-overlay"
      style={{ position: 'absolute', left: rect.x - rootOffsetX - 1, top: rect.y - rootOffsetY - 1, width: rect.width + 2, height: rect.height + 2 }}
    />
  );
}

// ---------------------------------------------------------------------------
// Marquee selection
// ---------------------------------------------------------------------------

function MarqueeSelection({ rect }: { rect: { x: number; y: number; width: number; height: number } }) {
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

// ---------------------------------------------------------------------------
// Snap guides
// ---------------------------------------------------------------------------

function SnapGuideLine({ guide, rootOffsetX, rootOffsetY }: { guide: SnapGuide; rootOffsetX: number; rootOffsetY: number }) {
  if (guide.orientation === 'vertical') {
    return (
      <div
        className="snap-guide snap-guide-vertical"
        style={{ position: 'absolute', left: guide.position - rootOffsetX, top: 0, width: 1, height: '100%', backgroundColor: '#ff4081', pointerEvents: 'none', zIndex: 400 }}
      />
    );
  }
  return (
    <div
      className="snap-guide snap-guide-horizontal"
      style={{ position: 'absolute', top: guide.position - rootOffsetY, left: 0, height: 1, width: '100%', backgroundColor: '#ff4081', pointerEvents: 'none', zIndex: 400 }}
    />
  );
}

// ---------------------------------------------------------------------------
// Recursive overlay builder
// ---------------------------------------------------------------------------

function buildNodeOverlays(
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
      key={node.id}
      node={node}
      isSelected={selectedNodeIds.includes(node.id)}
      isHovered={hoveredNodeId === node.id}
      onSelect={(e) => { e.stopPropagation(); selectNode(node.id, e.shiftKey || e.ctrlKey || e.metaKey); }}
      onHover={(h) => hoverNode(h ? node.id : null)}
      onDoubleClick={() => onDoubleClick(node)}
      onContextMenu={(e) => onContextMenu(e, node.id)}
      rootOffsetX={rootOffsetX}
      rootOffsetY={rootOffsetY}
    />,
  );
  if (node.nodeType === 1) {
    for (const child of (node as ElementSnapshot).childNodes) {
      overlays.push(...buildNodeOverlays(child, selectedNodeIds, hoveredNodeId, selectNode, hoverNode, onDoubleClick, onContextMenu, rootOffsetX, rootOffsetY));
    }
  }
  return overlays;
}

// ---------------------------------------------------------------------------
// Composite export
// ---------------------------------------------------------------------------

export interface OverlayLayerProps {
  root: SnapshotNode | undefined;
  selectedNodeIds: string[];
  hoveredNodeId: string | null;
  selectedNodes: SnapshotNode[];
  hoveredNode: SnapshotNode | null;
  selectNode: (id: string, multi?: boolean) => void;
  hoverNode: (id: string | null) => void;
  onNodeDoubleClick: (node: SnapshotNode) => void;
  onNodeContextMenu: (e: React.MouseEvent, nodeId: string) => void;
  onSelectionMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  marqueeRect: { x: number; y: number; width: number; height: number } | null;
  snapGuides: SnapGuide[];
  rootOffsetX: number;
  rootOffsetY: number;
}

export function OverlayLayer(props: OverlayLayerProps) {
  const {
    root, selectedNodeIds, hoveredNodeId, selectedNodes, hoveredNode,
    selectNode, hoverNode, onNodeDoubleClick, onNodeContextMenu,
    onSelectionMouseDown, marqueeRect, snapGuides, rootOffsetX, rootOffsetY,
  } = props;

  return (
    <>
      {/* Hit-area overlays */}
      <div className="node-overlays-container">
        {buildNodeOverlays(root, selectedNodeIds, hoveredNodeId, selectNode, hoverNode, onNodeDoubleClick, onNodeContextMenu, rootOffsetX, rootOffsetY)}
      </div>

      {/* Selection boxes */}
      {selectedNodes.map(node => (
        <SelectionOverlay
          key={node.id}
          node={node}
          onMouseDown={(e) => onSelectionMouseDown(e, node.id)}
          rootOffsetX={rootOffsetX}
          rootOffsetY={rootOffsetY}
        />
      ))}

      {/* Hover highlight */}
      {hoveredNode && <HoverOverlay node={hoveredNode} rootOffsetX={rootOffsetX} rootOffsetY={rootOffsetY} />}

      {/* Marquee */}
      {marqueeRect && <MarqueeSelection rect={marqueeRect} />}

      {/* Snap guides */}
      {snapGuides.map((g, i) => (
        <SnapGuideLine key={i} guide={g} rootOffsetX={rootOffsetX} rootOffsetY={rootOffsetY} />
      ))}
    </>
  );
}
