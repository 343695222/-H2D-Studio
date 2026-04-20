/**
 * useSnapGuides — calculates alignment guides when dragging nodes.
 * Shows horizontal/vertical snap lines relative to sibling nodes.
 */
import { useState, useCallback } from 'react';
import type { Rect } from '../types/capture.ts';
import type { SnapshotNode } from '../engine/sceneGraph.ts';
import { flattenTree } from '../engine/sceneGraph.ts';

export interface GuideLine {
  orientation: 'horizontal' | 'vertical';
  position: number; // canvas coordinate
}

const SNAP_THRESHOLD = 5; // px in canvas space

export function useSnapGuides() {
  const [guides, setGuides] = useState<GuideLine[]>([]);

  /** Call during drag to compute snap guides. Returns snapped rect. */
  const computeSnap = useCallback(
    (
      dragRect: Rect,
      dragNodeId: string,
      rootNode: SnapshotNode | null,
    ): { snappedRect: Rect; guides: GuideLine[] } => {
      if (!rootNode) return { snappedRect: dragRect, guides: [] };

      const allNodes = flattenTree(rootNode);
      const others = allNodes.filter(
        (n) => n.id !== dragNodeId && n.rect && n.rect.width > 0 && n.rect.height > 0,
      );

      const dragCenterX = dragRect.x + dragRect.width / 2;
      const dragCenterY = dragRect.y + dragRect.height / 2;
      const dragRight = dragRect.x + dragRect.width;
      const dragBottom = dragRect.y + dragRect.height;

      let snapDx = 0;
      let snapDy = 0;
      const newGuides: GuideLine[] = [];
      let bestDistX = SNAP_THRESHOLD + 1;
      let bestDistY = SNAP_THRESHOLD + 1;

      for (const other of others) {
        const r = other.rect;
        const oCenterX = r.x + r.width / 2;
        const oCenterY = r.y + r.height / 2;
        const oRight = r.x + r.width;
        const oBottom = r.y + r.height;

        // Vertical snaps (x-axis alignment)
        const xEdges = [
          { drag: dragRect.x, other: r.x },
          { drag: dragRect.x, other: oRight },
          { drag: dragRight, other: r.x },
          { drag: dragRight, other: oRight },
          { drag: dragCenterX, other: oCenterX },
        ];
        for (const { drag, other: o } of xEdges) {
          const dist = Math.abs(drag - o);
          if (dist < bestDistX) {
            bestDistX = dist;
            snapDx = o - drag;
          }
        }

        // Horizontal snaps (y-axis alignment)
        const yEdges = [
          { drag: dragRect.y, other: r.y },
          { drag: dragRect.y, other: oBottom },
          { drag: dragBottom, other: r.y },
          { drag: dragBottom, other: oBottom },
          { drag: dragCenterY, other: oCenterY },
        ];
        for (const { drag, other: o } of yEdges) {
          const dist = Math.abs(drag - o);
          if (dist < bestDistY) {
            bestDistY = dist;
            snapDy = o - drag;
          }
        }
      }

      if (bestDistX > SNAP_THRESHOLD) snapDx = 0;
      if (bestDistY > SNAP_THRESHOLD) snapDy = 0;

      const snappedRect = {
        ...dragRect,
        x: dragRect.x + snapDx,
        y: dragRect.y + snapDy,
      };

      // Generate guide lines for active snaps
      if (snapDx !== 0) {
        // Find which edge snapped
        const snappedX = snappedRect.x;
        const snappedRight = snappedX + snappedRect.width;
        const snappedCenterX = snappedX + snappedRect.width / 2;
        for (const other of others) {
          const r = other.rect;
          const edges = [r.x, r.x + r.width, r.x + r.width / 2];
          for (const e of edges) {
            if (
              Math.abs(snappedX - e) < 1 ||
              Math.abs(snappedRight - e) < 1 ||
              Math.abs(snappedCenterX - e) < 1
            ) {
              newGuides.push({ orientation: 'vertical', position: e });
            }
          }
        }
      }
      if (snapDy !== 0) {
        const snappedY = snappedRect.y;
        const snappedBottom = snappedY + snappedRect.height;
        const snappedCenterY = snappedY + snappedRect.height / 2;
        for (const other of others) {
          const r = other.rect;
          const edges = [r.y, r.y + r.height, r.y + r.height / 2];
          for (const e of edges) {
            if (
              Math.abs(snappedY - e) < 1 ||
              Math.abs(snappedBottom - e) < 1 ||
              Math.abs(snappedCenterY - e) < 1
            ) {
              newGuides.push({ orientation: 'horizontal', position: e });
            }
          }
        }
      }

      // Deduplicate
      const unique = newGuides.filter(
        (g, i, arr) =>
          arr.findIndex((o) => o.orientation === g.orientation && Math.abs(o.position - g.position) < 1) === i,
      );

      setGuides(unique);
      return { snappedRect, guides: unique };
    },
    [],
  );

  const clearGuides = useCallback(() => setGuides([]), []);

  return { guides, computeSnap, clearGuides };
}
