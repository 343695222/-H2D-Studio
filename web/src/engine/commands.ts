import type { CaptureTree, ElementSnapshot, TextSnapshot, SnapshotNode, Rect } from '../types/capture.ts';
import { deepClone, updateNode, deleteNode, addChild, addSibling, moveNode, generateNodeId, findNode, isValidCaptureTree, ensureNodeRects } from './sceneGraph.ts';

export type EditorCommand =
  | { type: 'updateStyles'; nodeId: string; styles: Record<string, string> }
  | { type: 'updateText'; nodeId: string; text: string }
  | { type: 'updateTag'; nodeId: string; tag: string }
  | { type: 'updateRect'; nodeId: string; rect: Partial<Rect> }
  | { type: 'deleteNode'; nodeId: string }
  | { type: 'addChild'; parentId: string; node?: ElementSnapshot }
  | { type: 'addSibling'; siblingId: string; node?: ElementSnapshot }
  | { type: 'duplicateNode'; nodeId: string }
  | { type: 'moveNode'; nodeId: string; direction: 'up' | 'down' }
  | { type: 'replaceTree'; tree: CaptureTree }
  | { type: 'applyAINodeEdit'; nodeId: string; modifiedNode: Record<string, unknown> }
  | { type: 'batch'; commands: EditorCommand[]; label?: string };

export interface CommandResult {
  tree: CaptureTree;
  affectedNodeIds: string[];
  createdNodeId?: string;
}

function mkDefault(ref: Rect, offset = 10): ElementSnapshot {
  return {
    nodeType: 1, id: generateNodeId(), tag: 'div', attributes: {},
    styles: { width: '100px', height: '40px', backgroundColor: '#f0f0f0', border: '1px dashed #ccc', position: 'absolute', left: offset + 'px', top: offset + 'px' },
    rect: { x: ref.x + offset, y: ref.y + offset, width: 100, height: 40, cssWidth: 100, cssHeight: 40 },
    childNodes: [],
  };
}

function dupTree(node: ElementSnapshot): ElementSnapshot {
  const cloned = deepClone(node);
  const reId = (el: ElementSnapshot): ElementSnapshot => {
    const o = { ...el, id: generateNodeId(), rect: { ...el.rect, x: el.rect.x + 20, y: el.rect.y + 20 } };
    o.childNodes = el.childNodes.map((c: SnapshotNode) =>
      c.nodeType === 1 ? reId(c as ElementSnapshot) : { ...c, id: generateNodeId() }
    );
    return o;
  };
  return reId(cloned);
}

function aiKids(children: unknown[]): (ElementSnapshot | TextSnapshot)[] {
  return children.map((child) => {
    const c = child as Record<string, unknown>;
    if (c.nodeType === 3) {
      return { nodeType: 3, id: c.id as string, text: (c.text as string) || '', rect: (c.rect as Rect) || { x: 0, y: 0, width: 0, height: 0 } } as TextSnapshot;
    }
    return {
      nodeType: 1, id: c.id as string, tag: (c.tag as string) || 'div',
      styles: (c.styles as Record<string, string>) || {},
      rect: (c.rect as Rect) || { x: 0, y: 0, width: 0, height: 0 },
      attributes: (c.attributes as Record<string, string>) || {},
      childNodes: c.childNodes ? aiKids(c.childNodes as unknown[]) : [],
    } as ElementSnapshot;
  });
}

export function executeCommand(tree: CaptureTree, cmd: EditorCommand): CommandResult {
  switch (cmd.type) {
    case 'updateStyles': {
      const r = updateNode(tree.root, cmd.nodeId, (n: SnapshotNode) =>
        n.nodeType === 1 ? { ...n, styles: { ...(n as ElementSnapshot).styles, ...cmd.styles } } as ElementSnapshot : n);
      return { tree: { ...tree, root: r as ElementSnapshot }, affectedNodeIds: [cmd.nodeId] };
    }
    case 'updateText': {
      const r = updateNode(tree.root, cmd.nodeId, (n: SnapshotNode) =>
        n.nodeType === 3 ? { ...n, text: cmd.text } as TextSnapshot : n);
      return { tree: { ...tree, root: r as ElementSnapshot }, affectedNodeIds: [cmd.nodeId] };
    }
    case 'updateTag': {
      const r = updateNode(tree.root, cmd.nodeId, (n: SnapshotNode) =>
        n.nodeType === 1 ? { ...n, tag: cmd.tag } as ElementSnapshot : n);
      return { tree: { ...tree, root: r as ElementSnapshot }, affectedNodeIds: [cmd.nodeId] };
    }
    case 'updateRect': {
      const ru = cmd.rect;
      const r = updateNode(tree.root, cmd.nodeId, (n: SnapshotNode) => {
        const rect = { ...n.rect, ...ru };
        if (n.nodeType === 1) {
          const s = { ...(n as ElementSnapshot).styles };
          if (ru.width !== undefined) s.width = ru.width + 'px';
          if (ru.height !== undefined) s.height = ru.height + 'px';
          return { ...n, rect, styles: s } as ElementSnapshot;
        }
        return { ...n, rect };
      });
      return { tree: { ...tree, root: r as ElementSnapshot }, affectedNodeIds: [cmd.nodeId] };
    }
    case 'deleteNode': {
      const r = deleteNode(tree.root, cmd.nodeId);
      if (!r) return { tree, affectedNodeIds: [] };
      return { tree: { ...tree, root: r as ElementSnapshot }, affectedNodeIds: [cmd.nodeId] };
    }
    case 'addChild': {
      const p = findNode(tree.root, cmd.parentId);
      if (!p || p.nodeType !== 1) return { tree, affectedNodeIds: [] };
      const nn = cmd.node || mkDefault(p.rect);
      const r = addChild(tree.root, cmd.parentId, nn);
      return { tree: { ...tree, root: r as ElementSnapshot }, affectedNodeIds: [cmd.parentId, nn.id], createdNodeId: nn.id };
    }
    case 'addSibling': {
      const s = findNode(tree.root, cmd.siblingId);
      if (!s || s.nodeType !== 1) return { tree, affectedNodeIds: [] };
      const nn = cmd.node || mkDefault(s.rect, 20);
      const r = addSibling(tree.root, cmd.siblingId, nn);
      return { tree: { ...tree, root: r as ElementSnapshot }, affectedNodeIds: [cmd.siblingId, nn.id], createdNodeId: nn.id };
    }
    case 'duplicateNode': {
      const n = findNode(tree.root, cmd.nodeId);
      if (!n || n.nodeType !== 1) return { tree, affectedNodeIds: [] };
      const dup = dupTree(n as ElementSnapshot);
      const r = addSibling(tree.root, cmd.nodeId, dup);
      return { tree: { ...tree, root: r as ElementSnapshot }, affectedNodeIds: [cmd.nodeId, dup.id], createdNodeId: dup.id };
    }
    case 'moveNode': {
      const r = moveNode(tree.root, cmd.nodeId, cmd.direction);
      return { tree: { ...tree, root: r as ElementSnapshot }, affectedNodeIds: [cmd.nodeId] };
    }
    case 'replaceTree': {
      if (!isValidCaptureTree(cmd.tree)) return { tree: cmd.tree, affectedNodeIds: [] };
      ensureNodeRects((cmd.tree as unknown as Record<string, unknown>).root);
      return { tree: cmd.tree, affectedNodeIds: ['__all__'] };
    }
    case 'applyAINodeEdit': {
      const m = cmd.modifiedNode as {
        styles?: Record<string, string>; rect?: Partial<Rect>; text?: string;
        attributes?: Record<string, string>; childNodes?: unknown[]; tag?: string;
      };
      const r = updateNode(tree.root, cmd.nodeId, (node: SnapshotNode) => {
        const n = deepClone(node);
        if (m.styles && n.nodeType === 1) (n as ElementSnapshot).styles = { ...(n as ElementSnapshot).styles, ...m.styles };
        if (m.rect) {
          n.rect = { ...n.rect, ...m.rect };
          if (n.nodeType === 1) {
            const el = n as ElementSnapshot;
            if (m.rect.width !== undefined) el.styles = { ...el.styles, width: m.rect.width + 'px' };
            if (m.rect.height !== undefined) el.styles = { ...el.styles, height: m.rect.height + 'px' };
            if (m.rect.x !== undefined) el.styles = { ...el.styles, left: m.rect.x + 'px' };
            if (m.rect.y !== undefined) el.styles = { ...el.styles, top: m.rect.y + 'px' };
          }
        }
        if (m.text !== undefined && n.nodeType === 3) (n as TextSnapshot).text = String(m.text);
        if (m.attributes && n.nodeType === 1) (n as ElementSnapshot).attributes = { ...(n as ElementSnapshot).attributes, ...m.attributes };
        if (m.tag && n.nodeType === 1) (n as ElementSnapshot).tag = m.tag;
        if (m.childNodes && Array.isArray(m.childNodes) && n.nodeType === 1) {
          (n as ElementSnapshot).childNodes = aiKids(m.childNodes);
        }
        return n;
      });
      return { tree: { ...tree, root: r as ElementSnapshot }, affectedNodeIds: [cmd.nodeId] };
    }
    case 'batch': {
      let cur = tree;
      const all: string[] = [];
      let last: string | undefined;
      for (const c of cmd.commands) {
        const res = executeCommand(cur, c);
        cur = res.tree;
        all.push(...res.affectedNodeIds);
        if (res.createdNodeId) last = res.createdNodeId;
      }
      return { tree: cur, affectedNodeIds: [...new Set(all)], createdNodeId: last };
    }
    default:
      return { tree, affectedNodeIds: [] };
  }
}
