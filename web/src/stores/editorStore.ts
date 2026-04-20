/**
 * EditorStore — Zustand store, refactored to use Command system.
 * Public interface is 100% backward-compatible with original.
 */
import { create } from 'zustand';
import { apiGet, apiPut } from '../api/client.ts';
import type { CaptureTree, ElementSnapshot, TextSnapshot, Rect } from '../types/capture.ts';
import type { ChatMessage } from '../components/editor/AIPanel.tsx';
import { executeCommand, type EditorCommand } from '../engine/commands.ts';
import {
  deepClone, isValidCaptureTree, ensureNodeRects,
  findNode, findParent, findNodeIndex,
  flattenTree, pointInRect, rectsIntersect, rectArea,
} from '../engine/sceneGraph.ts';

export type SnapshotNode = ElementSnapshot | TextSnapshot;

export interface EditorState {
  projectId: string | null;
  pageId: string | null;
  captureTree: CaptureTree | null;
  screenshotUrl: string | null;
  selectedNodeIds: string[];
  hoveredNodeId: string | null;
  zoom: number;
  panX: number;
  panY: number;
  tool: 'select' | 'marquee';
  history: CaptureTree[];
  historyIndex: number;
  isLoading: boolean;
  error: string | null;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  setSaveStatus: (s: 'saved' | 'saving' | 'unsaved') => void;
  loadPage: (pid: string, pgid: string) => Promise<void>;
  savePage: () => Promise<void>;
  selectNode: (nid: string, multi?: boolean) => void;
  clearSelection: () => void;
  hoverNode: (nid: string | null) => void;
  setZoom: (z: number) => void;
  setPan: (x: number, y: number) => void;
  setTool: (t: 'select' | 'marquee') => void;
  updateNodeStyles: (nid: string, styles: Record<string, string>) => void;
  updateNodeText: (nid: string, content: string) => void;
  updateNodeTag: (nid: string, tag: string) => void;
  deleteNode: (nid: string) => void;
  updateNodeRect: (nid: string, rect: Partial<Rect>) => void;
  addChildNode: (pid: string) => void;
  addSiblingNode: (nid: string) => void;
  duplicateNode: (nid: string) => void;
  moveNodeUp: (nid: string) => void;
  moveNodeDown: (nid: string) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  exec: (cmd: EditorCommand) => void;
  execWithHistory: (cmd: EditorCommand) => void;
  aiMessages: ChatMessage[];
  aiLoading: boolean;
  pendingModifiedTree: CaptureTree | null;
  previewTree: CaptureTree | null;
  setAIMessages: (m: ChatMessage[]) => void;
  setPendingModifiedTree: (t: CaptureTree | null) => void;
  setPreviewTree: (t: CaptureTree | null) => void;
  setCaptureTree: (t: CaptureTree) => void;
  clearAIMessages: () => void;
  applyAINodeEdit: (nid: string, mod: unknown) => void;
  showAIPanel: boolean;
  setShowAIPanel: (s: boolean) => void;
  designWorkflowSessionId: string | null;
  designWorkflowStage: 'analyze' | 'clarify' | 'design' | 'done' | null;
  stateVariants: Array<{ name: string; description: string; modifiedTree: any; isDefault: boolean }>;
  activeVariantIndex: number;
  originalTreeBeforePreview: any | null;
  setDesignWorkflow: (sid: string, stage: string) => void;
  setStateVariants: (v: Array<{ name: string; description: string; modifiedTree: any; isDefault: boolean }>) => void;
  previewVariant: (i: number) => void;
  applyVariant: (i: number) => void;
  exitVariantPreview: () => void;
  clearDesignWorkflow: () => void;
  findNodeById: (nid: string) => SnapshotNode | null;
  findNodeAtPoint: (x: number, y: number) => SnapshotNode | null;
  findNodesInRect: (rect: Rect) => SnapshotNode[];
  flattenNodes: () => SnapshotNode[];
  findParentNode: (nid: string) => ElementSnapshot | null;
  findNodeIndexInParent: (nid: string) => { parent: ElementSnapshot | null; index: number };
  clear: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  projectId: null, pageId: null, captureTree: null, screenshotUrl: null,
  selectedNodeIds: [], hoveredNodeId: null,
  zoom: 1, panX: 0, panY: 0, tool: 'select' as const,
  history: [], historyIndex: -1, isLoading: false, error: null,
  saveStatus: 'saved' as const,
  aiMessages: [], aiLoading: false, pendingModifiedTree: null, previewTree: null, showAIPanel: false,
  designWorkflowSessionId: null, designWorkflowStage: null,
  stateVariants: [], activeVariantIndex: -1, originalTreeBeforePreview: null,

  exec: (cmd: EditorCommand) => {
    const { captureTree } = get();
    if (!captureTree) return;
    const r = executeCommand(captureTree, cmd);
    set({ captureTree: r.tree, saveStatus: 'unsaved' });
    if (r.createdNodeId) set({ selectedNodeIds: [r.createdNodeId] });
  },
  execWithHistory: (cmd: EditorCommand) => { get().pushHistory(); get().exec(cmd); },

  loadPage: async (projectId: string, pageId: string) => {
    set({ isLoading: true, error: null, projectId, pageId });
    try {
      const d = await apiGet<{ page: any; captureTree: CaptureTree; editedTree?: CaptureTree }>(`/projects/${projectId}/pages/${pageId}`);
      const tree = d.editedTree || d.captureTree;
      set({ captureTree: tree, screenshotUrl: `/data/projects/${projectId}/pages/${pageId}/screenshot.png`, isLoading: false, selectedNodeIds: [], hoveredNodeId: null, zoom: 1, panX: 0, panY: 0, history: [deepClone(tree)], historyIndex: 0 });
    } catch (e: any) { set({ isLoading: false, error: e?.message || '加载失败' }); }
  },
  savePage: async () => {
    const { projectId, pageId, captureTree } = get();
    if (!projectId || !pageId || !captureTree || !isValidCaptureTree(captureTree)) return;
    await apiPut(`/projects/${projectId}/pages/${pageId}`, { editedTree: captureTree });
  },

  selectNode: (nodeId: string, multi = false) => {
    const { selectedNodeIds } = get();
    if (multi) { set({ selectedNodeIds: selectedNodeIds.includes(nodeId) ? selectedNodeIds.filter(id => id !== nodeId) : [...selectedNodeIds, nodeId] }); }
    else { set({ selectedNodeIds: [nodeId] }); }
  },
  clearSelection: () => set({ selectedNodeIds: [] }),
  hoverNode: (nodeId: string | null) => set({ hoveredNodeId: nodeId }),
  setZoom: (z: number) => set({ zoom: Math.max(0.1, Math.min(4, z)) }),
  setPan: (x: number, y: number) => set({ panX: x, panY: y }),
  setTool: (tool: 'select' | 'marquee') => set({ tool }),
  setSaveStatus: (s: 'saved' | 'saving' | 'unsaved') => set({ saveStatus: s }),

  updateNodeStyles: (nid: string, styles: Record<string, string>) => get().execWithHistory({ type: 'updateStyles', nodeId: nid, styles }),
  updateNodeText: (nid: string, content: string) => get().execWithHistory({ type: 'updateText', nodeId: nid, text: content }),
  updateNodeTag: (nid: string, tag: string) => get().execWithHistory({ type: 'updateTag', nodeId: nid, tag }),
  deleteNode: (nid: string) => { get().execWithHistory({ type: 'deleteNode', nodeId: nid }); set((s) => ({ selectedNodeIds: s.selectedNodeIds.filter(id => id !== nid) })); },
  updateNodeRect: (nid: string, rect: Partial<Rect>) => get().exec({ type: 'updateRect', nodeId: nid, rect }),
  addChildNode: (pid: string) => get().execWithHistory({ type: 'addChild', parentId: pid }),
  addSiblingNode: (nid: string) => get().execWithHistory({ type: 'addSibling', siblingId: nid }),
  duplicateNode: (nid: string) => get().execWithHistory({ type: 'duplicateNode', nodeId: nid }),
  moveNodeUp: (nid: string) => get().execWithHistory({ type: 'moveNode', nodeId: nid, direction: 'up' }),
  moveNodeDown: (nid: string) => get().execWithHistory({ type: 'moveNode', nodeId: nid, direction: 'down' }),

  pushHistory: () => {
    const { captureTree, history, historyIndex } = get();
    if (!captureTree) return;
    const h = history.slice(0, historyIndex + 1);
    h.push(deepClone(captureTree));
    if (h.length > 50) h.shift();
    set({ history: h, historyIndex: h.length - 1 });
  },
  undo: () => { const { historyIndex, history } = get(); if (historyIndex > 0) set({ historyIndex: historyIndex - 1, captureTree: deepClone(history[historyIndex - 1]) }); },
  redo: () => { const { historyIndex, history } = get(); if (historyIndex < history.length - 1) set({ historyIndex: historyIndex + 1, captureTree: deepClone(history[historyIndex + 1]) }); },

  setAIMessages: (m: ChatMessage[]) => set({ aiMessages: m }),
  setPendingModifiedTree: (t: CaptureTree | null) => set({ pendingModifiedTree: t }),
  setPreviewTree: (t: CaptureTree | null) => set({ previewTree: t }),
  setCaptureTree: (tree: CaptureTree) => { if (!isValidCaptureTree(tree)) return; ensureNodeRects((tree as any).root); set({ captureTree: tree, saveStatus: 'unsaved' }); },
  clearAIMessages: () => set({ aiMessages: [], pendingModifiedTree: null, previewTree: null }),
  setShowAIPanel: (show: boolean) => set({ showAIPanel: show }),
  applyAINodeEdit: (nodeId: string, modifiedNode: unknown) => get().execWithHistory({ type: 'applyAINodeEdit', nodeId, modifiedNode: modifiedNode as Record<string, unknown> }),

  setDesignWorkflow: (sid: string, stage: string) => set({ designWorkflowSessionId: sid, designWorkflowStage: stage as any }),
  setStateVariants: (v) => set({ stateVariants: v }),
  previewVariant: (index: number) => {
    const { stateVariants, captureTree, originalTreeBeforePreview } = get();
    if (index < 0 || index >= stateVariants.length) return;
    if (!originalTreeBeforePreview && captureTree) set({ originalTreeBeforePreview: deepClone(captureTree) });
    if (stateVariants[index].modifiedTree) set({ captureTree: stateVariants[index].modifiedTree, activeVariantIndex: index });
  },
  applyVariant: (index: number) => {
    const { stateVariants, originalTreeBeforePreview } = get();
    if (index < 0 || index >= stateVariants.length) return;
    if (stateVariants[index].modifiedTree) { if (originalTreeBeforePreview) get().pushHistory(); set({ captureTree: stateVariants[index].modifiedTree, activeVariantIndex: index, originalTreeBeforePreview: null, saveStatus: 'unsaved' }); }
  },
  exitVariantPreview: () => { const { originalTreeBeforePreview } = get(); if (originalTreeBeforePreview) set({ captureTree: originalTreeBeforePreview, originalTreeBeforePreview: null, activeVariantIndex: -1 }); },
  clearDesignWorkflow: () => set({ designWorkflowSessionId: null, designWorkflowStage: null, stateVariants: [], activeVariantIndex: -1, originalTreeBeforePreview: null }),

  findNodeById: (nodeId: string) => { const { captureTree } = get(); return captureTree ? findNode(captureTree.root, nodeId) : null; },
  findParentNode: (nodeId: string) => { const { captureTree } = get(); return captureTree ? findParent(captureTree.root, nodeId) : null; },
  findNodeIndexInParent: (nodeId: string) => { const { captureTree } = get(); return captureTree ? findNodeIndex(captureTree.root, nodeId) : { parent: null, index: -1 }; },
  findNodeAtPoint: (x: number, y: number) => {
    const { captureTree } = get();
    if (!captureTree) return null;
    let best: SnapshotNode | null = null, bestA = Infinity;
    for (const n of flattenTree(captureTree.root)) {
      if (!n.rect || n.rect.width <= 0 || n.rect.height <= 0) continue;
      if (pointInRect(x, y, n.rect)) { const a = rectArea(n.rect); if (a < bestA) { bestA = a; best = n; } }
    }
    return best;
  },
  findNodesInRect: (rect: Rect) => { const { captureTree } = get(); if (!captureTree) return []; return flattenTree(captureTree.root).filter(n => n.rect && n.rect.width > 0 && n.rect.height > 0 && rectsIntersect(rect, n.rect)); },
  flattenNodes: () => { const { captureTree } = get(); return captureTree ? flattenTree(captureTree.root) : []; },

  clear: () => set({ projectId: null, pageId: null, captureTree: null, screenshotUrl: null, selectedNodeIds: [], hoveredNodeId: null, zoom: 1, panX: 0, panY: 0, tool: 'select', history: [], historyIndex: -1, isLoading: false, error: null, aiMessages: [], aiLoading: false, pendingModifiedTree: null, previewTree: null, showAIPanel: false, designWorkflowSessionId: null, designWorkflowStage: null, stateVariants: [], activeVariantIndex: -1, originalTreeBeforePreview: null }),
}));
