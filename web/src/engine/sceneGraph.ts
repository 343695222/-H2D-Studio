/**
 * SceneGraph — pure functions for operating on CaptureTree / SnapshotNode.
 * All functions are immutable — they return new objects, never mutate.
 */
import type {
  CaptureTree, ElementSnapshot, TextSnapshot, SnapshotNode, Rect,
} from '../types/capture.ts';

export type { SnapshotNode } from '../types/capture.ts';

// ── Deep clone ─────────────────────────────────────────────────────────────

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ── Validation ─────────────────────────────────────────────────────────────

export function isValidCaptureTree(tree: unknown): boolean {
  if (!tree || typeof tree !== 'object') return false;
  const t = tree as Record<string, unknown>;
  if (!t.root || typeof t.root !== 'object') return false;
  const r = t.root as Record<string, unknown>;
  if (r.nodeType === undefined || r.nodeType === null) return false;
  if (r.nodeType === 1) {
    if (!r.tag || typeof r.tag !== 'string') return false;
    if (!Array.isArray(r.childNodes)) return false;
    if (!r.rect || typeof r.rect !== 'object') return false;
  }
  return true;
}

export function ensureNodeRects(
  node: unknown,
  parentRect?: { x: number; y: number; width: number; height: number },
): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  if (n.nodeType === 1) {
    if (!n.rect || typeof n.rect !== 'object') {
      const dx = parentRect?.x ?? 0;
      const dy = parentRect?.y ?? 0;
      const dw = parentRect?.width ?? 200;
      n.rect = { x: dx, y: dy, width: dw, height: 40, top: dy, left: dx, bottom: dy + 40, right: dx + dw };
    }
    if (Array.isArray(n.childNodes)) {
      const cr = n.rect as { x: number; y: number; width: number; height: number };
      for (const child of n.childNodes) ensureNodeRects(child, cr);
    }
  }
}

// ── Find ───────────────────────────────────────────────────────────────────

export function findNode(node: SnapshotNode, nodeId: string): SnapshotNode | null {
  if (node.id === nodeId) return node;
  if (node.nodeType === 1) {
    for (const child of (node as ElementSnapshot).childNodes) {
      const found = findNode(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

export function findParent(node: SnapshotNode, childId: string): ElementSnapshot | null {
  if (node.nodeType === 1) {
    const el = node as ElementSnapshot;
    for (const child of el.childNodes) {
      if (child.id === childId) return el;
      const found = findParent(child, childId);
      if (found) return found;
    }
  }
  return null;
}

export function findNodeIndex(node: SnapshotNode, childId: string): { parent: ElementSnapshot | null; index: number } {
  if (node.nodeType === 1) {
    const el = node as ElementSnapshot;
    const idx = el.childNodes.findIndex((c) => c.id === childId);
    if (idx !== -1) return { parent: el, index: idx };
    for (const child of el.childNodes) {
      const r = findNodeIndex(child, childId);
      if (r.index !== -1) return r;
    }
  }
  return { parent: null, index: -1 };
}

// ── Flatten ────────────────────────────────────────────────────────────────

export function flattenTree(node: SnapshotNode, result: SnapshotNode[] = []): SnapshotNode[] {
  result.push(node);
  if (node.nodeType === 1) {
    for (const child of (node as ElementSnapshot).childNodes) flattenTree(child, result);
  }
  return result;
}

// ── Geometry ───────────────────────────────────────────────────────────────

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
}

export function rectArea(rect: Rect): number {
  return rect.width * rect.height;
}

// ── Tree mutations (immutable) ─────────────────────────────────────────────

export function updateNode(
  node: SnapshotNode, nodeId: string, updater: (n: SnapshotNode) => SnapshotNode,
): SnapshotNode {
  if (node.id === nodeId) return updater(deepClone(node));
  if (node.nodeType === 1) {
    const el = node as ElementSnapshot;
    const nc = el.childNodes.map((c) => updateNode(c, nodeId, updater));
    return { ...el, childNodes: nc };
  }
  return node;
}

export function deleteNode(node: SnapshotNode, nodeId: string): SnapshotNode | null {
  if (node.id === nodeId) return null;
  if (node.nodeType === 1) {
    const el = node as ElementSnapshot;
    const nc = el.childNodes.map((c) => deleteNode(c, nodeId)).filter((c): c is SnapshotNode => c !== null);
    if (nc.length !== el.childNodes.length) return { ...el, childNodes: nc };
  }
  return node;
}

export function addChild(node: SnapshotNode, parentId: string, newChild: SnapshotNode): SnapshotNode {
  if (node.id === parentId && node.nodeType === 1) {
    const el = node as ElementSnapshot;
    return { ...el, childNodes: [...el.childNodes, newChild] };
  }
  if (node.nodeType === 1) {
    const el = node as ElementSnapshot;
    return { ...el, childNodes: el.childNodes.map((c) => addChild(c, parentId, newChild)) };
  }
  return node;
}

export function addSibling(node: SnapshotNode, siblingId: string, newNode: SnapshotNode): SnapshotNode {
  if (node.nodeType === 1) {
    const el = node as ElementSnapshot;
    const idx = el.childNodes.findIndex((c) => c.id === siblingId);
    if (idx !== -1) {
      const arr = [...el.childNodes];
      arr.splice(idx + 1, 0, newNode);
      return { ...el, childNodes: arr };
    }
    return { ...el, childNodes: el.childNodes.map((c) => addSibling(c, siblingId, newNode)) };
  }
  return node;
}

export function moveNode(node: SnapshotNode, nodeId: string, direction: 'up' | 'down'): SnapshotNode {
  if (node.nodeType === 1) {
    const el = node as ElementSnapshot;
    const idx = el.childNodes.findIndex((c) => c.id === nodeId);
    if (idx !== -1) {
      const arr = [...el.childNodes];
      if (direction === 'up' && idx > 0) [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      else if (direction === 'down' && idx < arr.length - 1) [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return { ...el, childNodes: arr };
    }
    return { ...el, childNodes: el.childNodes.map((c) => moveNode(c, nodeId, direction)) };
  }
  return node;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function applyRootUpdate(tree: CaptureTree, newRoot: SnapshotNode): CaptureTree {
  return { ...tree, root: newRoot as ElementSnapshot };
}

let _counter = 0;
export function generateNodeId(): string {
  return `h2d-node-${Date.now()}-${++_counter}`;
}
