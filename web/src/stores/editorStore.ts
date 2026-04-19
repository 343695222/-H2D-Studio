import { create } from 'zustand';
import { apiGet, apiPut } from '../api/client.ts';
import type { CaptureTree, ElementSnapshot, TextSnapshot, Rect } from '../types/capture.ts';
import type { ChatMessage } from '../components/editor/AIPanel.tsx';

export type SnapshotNode = ElementSnapshot | TextSnapshot;

export interface EditorState {
  // 数据
  projectId: string | null;
  pageId: string | null;
  captureTree: CaptureTree | null;
  screenshotUrl: string | null;
  
  // 交互状态
  selectedNodeIds: string[];
  hoveredNodeId: string | null;
  zoom: number;
  panX: number;
  panY: number;
  tool: 'select' | 'marquee';
  
  // 历史(撤销/重做)
  history: CaptureTree[];
  historyIndex: number;
  
  // 加载状态
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadPage: (projectId: string, pageId: string) => Promise<void>;
  savePage: () => Promise<void>;
  selectNode: (nodeId: string, multi?: boolean) => void;
  clearSelection: () => void;
  hoverNode: (nodeId: string | null) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setTool: (tool: 'select' | 'marquee') => void;
  
  // 编辑操作
  updateNodeStyles: (nodeId: string, styles: Record<string, string>) => void;
  updateNodeText: (nodeId: string, content: string) => void;
  updateNodeTag: (nodeId: string, tag: string) => void;
  deleteNode: (nodeId: string) => void;
  updateNodeRect: (nodeId: string, rect: Partial<Rect>) => void;
  
  // 节点操作
  addChildNode: (parentId: string) => void;
  addSiblingNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => void;
  moveNodeUp: (nodeId: string) => void;
  moveNodeDown: (nodeId: string) => void;
  
  // 保存状态
  saveStatus: 'saved' | 'saving' | 'unsaved';
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved') => void;
  
  // 历史操作
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  
  // AI相关状态
  aiMessages: ChatMessage[];
  aiLoading: boolean;
  pendingModifiedTree: CaptureTree | null;
  setAIMessages: (messages: ChatMessage[]) => void;
  setPendingModifiedTree: (tree: CaptureTree | null) => void;
  setCaptureTree: (tree: CaptureTree) => void;
  clearAIMessages: () => void;
  
  // AI节点编辑
  applyAINodeEdit: (nodeId: string, modifiedNode: unknown) => void;

  // AI面板显示状态
  showAIPanel: boolean;
  setShowAIPanel: (show: boolean) => void;

  // 设计工作流相关
  designWorkflowSessionId: string | null;
  designWorkflowStage: 'analyze' | 'clarify' | 'design' | 'done' | null;
  stateVariants: Array<{
    name: string;
    description: string;
    modifiedTree: any;
    isDefault: boolean;
  }>;
  activeVariantIndex: number;
  originalTreeBeforePreview: any | null;  // CaptureTree

  // 设计工作流方法
  setDesignWorkflow: (sessionId: string, stage: string) => void;
  setStateVariants: (variants: Array<{name: string; description: string; modifiedTree: any; isDefault: boolean}>) => void;
  previewVariant: (index: number) => void;
  applyVariant: (index: number) => void;
  exitVariantPreview: () => void;
  clearDesignWorkflow: () => void;

  // 辅助
  findNodeById: (nodeId: string) => SnapshotNode | null;
  findNodeAtPoint: (x: number, y: number) => SnapshotNode | null;
  findNodesInRect: (rect: Rect) => SnapshotNode[];
  flattenNodes: () => SnapshotNode[];
  findParentNode: (nodeId: string) => ElementSnapshot | null;
  findNodeIndexInParent: (nodeId: string) => { parent: ElementSnapshot | null; index: number };
  
  // 清理
  clear: () => void;
}

// 深拷贝工具函数
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// 验证 CaptureTree 格式是否合法（防止坏数据导致白屏）
function isValidCaptureTree(tree: unknown): boolean {
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

// 递归确保所有元素节点都有 rect 属性
function ensureNodeRects(node: unknown, parentRect?: { x: number; y: number; width: number; height: number }): void {
  if (!node || typeof node !== 'object') return;
  
  const n = node as Record<string, unknown>;
  
  if (n.nodeType === 1) {
    // 元素节点：确保有 rect
    if (!n.rect || typeof n.rect !== 'object') {
      // 基于父节点或使用默认值
      const defaultX = parentRect?.x ?? 0;
      const defaultY = parentRect?.y ?? 0;
      const defaultWidth = parentRect?.width ?? 200;
      n.rect = {
        x: defaultX,
        y: defaultY,
        width: defaultWidth,
        height: 40,
        top: defaultY,
        left: defaultX,
        bottom: defaultY + 40,
        right: defaultX + defaultWidth,
      };
    }
    // 递归处理子节点
    if (Array.isArray(n.childNodes)) {
      const currentRect = n.rect as { x: number; y: number; width: number; height: number };
      for (const child of n.childNodes) {
        ensureNodeRects(child, currentRect);
      }
    }
  }
}

// 递归查找节点
function findNodeInTree(node: SnapshotNode, nodeId: string): SnapshotNode | null {
  if (node.id === nodeId) return node;
  
  if (node.nodeType === 1) {
    const elementNode = node as ElementSnapshot;
    for (const child of elementNode.childNodes) {
      const found = findNodeInTree(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

// 递归查找并更新节点
function updateNodeInTree(node: SnapshotNode, nodeId: string, updater: (n: SnapshotNode) => SnapshotNode): SnapshotNode {
  if (node.id === nodeId) {
    return updater(deepClone(node));
  }
  
  if (node.nodeType === 1) {
    const elementNode = node as ElementSnapshot;
    const newChildNodes = elementNode.childNodes.map(child => updateNodeInTree(child, nodeId, updater));
    if (newChildNodes !== elementNode.childNodes) {
      return { ...elementNode, childNodes: newChildNodes };
    }
  }
  return node;
}

// 递归查找并删除节点
function deleteNodeInTree(node: SnapshotNode, nodeId: string): SnapshotNode | null {
  if (node.id === nodeId) return null;
  
  if (node.nodeType === 1) {
    const elementNode = node as ElementSnapshot;
    const newChildNodes = elementNode.childNodes      .map(child => deleteNodeInTree(child, nodeId))      .filter((child): child is SnapshotNode => child !== null);
    
    if (newChildNodes.length !== elementNode.childNodes.length) {
      return { ...elementNode, childNodes: newChildNodes };
    }
  }
  return node;
}

// 递归查找父节点
function findParentInTree(node: SnapshotNode, childId: string): ElementSnapshot | null {
  if (node.nodeType === 1) {
    const elementNode = node as ElementSnapshot;
    for (const child of elementNode.childNodes) {
      if (child.id === childId) {
        return elementNode;
      }
      const found = findParentInTree(child, childId);
      if (found) return found;
    }
  }
  return null;
}

// 递归查找节点在父节点中的索引
function findNodeIndexInTree(node: SnapshotNode, childId: string): { parent: ElementSnapshot | null; index: number } {
  if (node.nodeType === 1) {
    const elementNode = node as ElementSnapshot;
    const index = elementNode.childNodes.findIndex(child => child.id === childId);
    if (index !== -1) {
      return { parent: elementNode, index };
    }
    for (const child of elementNode.childNodes) {
      const result = findNodeIndexInTree(child, childId);
      if (result.index !== -1) return result;
    }
  }
  return { parent: null, index: -1 };
}

// 递归在指定父节点下添加子节点
function addChildToTree(node: SnapshotNode, parentId: string, newChild: SnapshotNode): SnapshotNode {
  if (node.id === parentId && node.nodeType === 1) {
    const elementNode = node as ElementSnapshot;
    return { ...elementNode, childNodes: [...elementNode.childNodes, newChild] };
  }
  
  if (node.nodeType === 1) {
    const elementNode = node as ElementSnapshot;
    const newChildNodes = elementNode.childNodes.map(child => addChildToTree(child, parentId, newChild));
    if (newChildNodes !== elementNode.childNodes) {
      return { ...elementNode, childNodes: newChildNodes };
    }
  }
  return node;
}

// 递归在指定节点后添加兄弟节点
function addSiblingToTree(node: SnapshotNode, siblingId: string, newNode: SnapshotNode): SnapshotNode {
  if (node.nodeType === 1) {
    const elementNode = node as ElementSnapshot;
    const index = elementNode.childNodes.findIndex(child => child.id === siblingId);
    if (index !== -1) {
      const newChildNodes = [...elementNode.childNodes];
      newChildNodes.splice(index + 1, 0, newNode);
      return { ...elementNode, childNodes: newChildNodes };
    }
    const newChildNodes = elementNode.childNodes.map(child => addSiblingToTree(child, siblingId, newNode));
    if (newChildNodes !== elementNode.childNodes) {
      return { ...elementNode, childNodes: newChildNodes };
    }
  }
  return node;
}

// 递归移动节点位置
function moveNodeInTree(node: SnapshotNode, nodeId: string, direction: 'up' | 'down'): SnapshotNode {
  if (node.nodeType === 1) {
    const elementNode = node as ElementSnapshot;
    const index = elementNode.childNodes.findIndex(child => child.id === nodeId);
    if (index !== -1) {
      const newChildNodes = [...elementNode.childNodes];
      if (direction === 'up' && index > 0) {
        [newChildNodes[index - 1], newChildNodes[index]] = [newChildNodes[index], newChildNodes[index - 1]];
      } else if (direction === 'down' && index < newChildNodes.length - 1) {
        [newChildNodes[index], newChildNodes[index + 1]] = [newChildNodes[index + 1], newChildNodes[index]];
      }
      return { ...elementNode, childNodes: newChildNodes };
    }
    const newChildNodes = elementNode.childNodes.map(child => moveNodeInTree(child, nodeId, direction));
    if (newChildNodes !== elementNode.childNodes) {
      return { ...elementNode, childNodes: newChildNodes };
    }
  }
  return node;
}

// 展平树为数组
function flattenTree(node: SnapshotNode, result: SnapshotNode[] = []): SnapshotNode[] {
  result.push(node);
  
  if (node.nodeType === 1) {
    const elementNode = node as ElementSnapshot;
    for (const child of elementNode.childNodes) {
      flattenTree(child, result);
    }
  }
  return result;
}

// 检查点是否在矩形内
function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

// 检查两个矩形是否相交
function rectsIntersect(rect1: Rect, rect2: Rect): boolean {
  return !(rect1.x + rect1.width < rect2.x ||           rect2.x + rect2.width < rect1.x ||           rect1.y + rect1.height < rect2.y ||           rect2.y + rect2.height < rect1.y);
}

// 计算矩形面积
function rectArea(rect: Rect): number {
  return rect.width * rect.height;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // 初始状态
  projectId: null,  pageId: null,  captureTree: null,  screenshotUrl: null,  selectedNodeIds: [],  hoveredNodeId: null,  zoom: 1,  panX: 0,  panY: 0,  tool: 'select',  history: [],  historyIndex: -1,  isLoading: false,  error: null,  saveStatus: 'saved' as const,
  // AI状态
  aiMessages: [],
  aiLoading: false,
  pendingModifiedTree: null,
  showAIPanel: false,
  // 设计工作流状态
  designWorkflowSessionId: null,
  designWorkflowStage: null,
  stateVariants: [],
  activeVariantIndex: -1,
  originalTreeBeforePreview: null,
  // 加载页面数据
  loadPage: async (projectId: string, pageId: string) => {
    set({ isLoading: true, error: null, projectId, pageId });
    
    try {
      // 获取捕获数据
      const captureData = await apiGet<{ page: any; captureTree: CaptureTree; editedTree?: CaptureTree }>(`/projects/${projectId}/pages/${pageId}`);
      
      // Use editedTree if available, otherwise use captureTree
      const tree = captureData.editedTree || captureData.captureTree;
      
      // 设置截图URL
      const screenshotUrl = `/data/projects/${projectId}/pages/${pageId}/screenshot.png`;
      
      const newState = {
        captureTree: tree,        screenshotUrl,        isLoading: false,        selectedNodeIds: [],        hoveredNodeId: null,        zoom: 1,        panX: 0,        panY: 0,        history: [deepClone(tree)],        historyIndex: 0,      };
      
      set(newState);
    } catch (err) {
      set({ 
        isLoading: false,         error: err instanceof Error ? err.message : '加载失败'       });
    }
  },
  // 保存页面数据
  savePage: async () => {
    const { projectId, pageId, captureTree } = get();
    if (!projectId || !pageId || !captureTree) return;
    
    // 保存前验证 captureTree 格式，防止保存坏数据
    if (!isValidCaptureTree(captureTree)) {
      console.error('savePage: captureTree 格式验证失败，跳过保存');
      return;
    }
    
    try {
      await apiPut(`/projects/${projectId}/pages/${pageId}`, { editedTree: captureTree });
    } catch (err) {
      console.error('保存失败:', err);
      throw err;
    }
  },
  // 选择节点
  selectNode: (nodeId: string, multi = false) => {
    const { selectedNodeIds } = get();
    
    if (multi) {
      // 多选模式
      if (selectedNodeIds.includes(nodeId)) {
        set({ selectedNodeIds: selectedNodeIds.filter(id => id !== nodeId) });
      } else {
        set({ selectedNodeIds: [...selectedNodeIds, nodeId] });
      }
    } else {
      // 单选模式
      set({ selectedNodeIds: [nodeId] });
    }
  },
  // 清除选择
  clearSelection: () => {
    set({ selectedNodeIds: [] });
  },
  // 悬停节点
  hoverNode: (nodeId: string | null) => {
    set({ hoveredNodeId: nodeId });
  },
  // 设置缩放
  setZoom: (zoom: number) => {
    // 限制缩放范围 0.1 - 4
    const clampedZoom = Math.max(0.1, Math.min(4, zoom));
    set({ zoom: clampedZoom });
  },
  // 设置平移
  setPan: (x: number, y: number) => {
    set({ panX: x, panY: y });
  },
  // 设置工具
  setTool: (tool: 'select' | 'marquee') => {
    set({ tool });
  },
  // 更新节点样式
  updateNodeStyles: (nodeId: string, styles: Record<string, string>) => {
    const { captureTree, pushHistory } = get();
    if (!captureTree) return;
    
    pushHistory();
    
    const newRoot = updateNodeInTree(captureTree.root, nodeId, (node) => {
      if (node.nodeType === 1) {
        return {
          ...node,          styles: { ...node.styles, ...styles }
        } as ElementSnapshot;
      }
      return node;
    });
    
    set({ 
      captureTree: { ...captureTree, root: newRoot as ElementSnapshot },      saveStatus: 'unsaved'    });
  },
  // 更新节点文本
  updateNodeText: (nodeId: string, content: string) => {
    const { captureTree, pushHistory } = get();
    if (!captureTree) return;
    
    pushHistory();
    
    const newRoot = updateNodeInTree(captureTree.root, nodeId, (node) => {
      if (node.nodeType === 3) {
        return { ...node, text: content } as TextSnapshot;
      }
      return node;
    });
    
    set({ 
      captureTree: { ...captureTree, root: newRoot as ElementSnapshot },      saveStatus: 'unsaved'    });
  },
  // 更新节点标签
  updateNodeTag: (nodeId: string, tag: string) => {
    const { captureTree, pushHistory } = get();
    if (!captureTree) return;
    
    pushHistory();
    
    const newRoot = updateNodeInTree(captureTree.root, nodeId, (node) => {
      if (node.nodeType === 1) {
        return { ...node, tag } as ElementSnapshot;
      }
      return node;
    });
    
    set({ 
      captureTree: { ...captureTree, root: newRoot as ElementSnapshot },      saveStatus: 'unsaved'    });
  },
  // 删除节点
  deleteNode: (nodeId: string) => {
    const { captureTree, pushHistory, selectedNodeIds } = get();
    if (!captureTree) return;
    
    pushHistory();
    
    const newRoot = deleteNodeInTree(captureTree.root, nodeId);
    if (newRoot) {
      set({ 
        captureTree: { ...captureTree, root: newRoot as ElementSnapshot },        selectedNodeIds: selectedNodeIds.filter(id => id !== nodeId),        saveStatus: 'unsaved'      });
    }
  },
  // 更新节点位置和尺寸
  updateNodeRect: (nodeId: string, rectUpdate: Partial<Rect>) => {
    const { captureTree, pushHistory } = get();
    if (!captureTree) return;
    
    pushHistory();
    
    const newRoot = updateNodeInTree(captureTree.root, nodeId, (node) => {
      const newRect = { ...node.rect, ...rectUpdate };
      if (node.nodeType === 1) {
        const elementNode = node as ElementSnapshot;
        // 同时更新styles中的width/height
        const newStyles = { ...elementNode.styles };
        if (rectUpdate.width !== undefined) {
          newStyles.width = `${rectUpdate.width}px`;
        }
        if (rectUpdate.height !== undefined) {
          newStyles.height = `${rectUpdate.height}px`;
        }
        return { ...elementNode, rect: newRect, styles: newStyles } as ElementSnapshot;
      }
      return { ...node, rect: newRect };
    });
    
    set({ 
      captureTree: { ...captureTree, root: newRoot as ElementSnapshot },      saveStatus: 'unsaved'    });
  },
  // 添加子节点
  addChildNode: (parentId: string) => {
    const { captureTree, pushHistory, findNodeById } = get();
    if (!captureTree) return;
    
    const parentNode = findNodeById(parentId);
    if (!parentNode || parentNode.nodeType !== 1) return;
    
    pushHistory();
    
    const parentRect = parentNode.rect;
    const newNode: ElementSnapshot = {
      nodeType: 1,
      id: `h2d-node-new-${Date.now()}`,
      tag: 'div',
      attributes: {},
      styles: {
        width: '100px',
        height: '40px',
        backgroundColor: '#f0f0f0',
        border: '1px dashed #ccc',
        position: 'absolute',
        left: '10px',
        top: '10px'
      },
      rect: { x: parentRect.x + 10, y: parentRect.y + 10, width: 100, height: 40, cssWidth: 100, cssHeight: 40 },
      childNodes: []
    };

    const newRoot = addChildToTree(captureTree.root, parentId, newNode);
    set({
      captureTree: { ...captureTree, root: newRoot as ElementSnapshot },
      selectedNodeIds: [newNode.id],
      saveStatus: 'unsaved'
    });
  },
  // 添加兄弟节点
  addSiblingNode: (nodeId: string) => {
    const { captureTree, pushHistory, findNodeById, findParentNode, findNodeIndexInParent } = get();
    if (!captureTree) return;
    
    const node = findNodeById(nodeId);
    if (!node || node.nodeType !== 1) return;
    
    const parent = findParentNode(nodeId);
    if (!parent) return;
    
    pushHistory();
    
    // 获取节点索引用于后续可能的排序操作
    findNodeIndexInParent(nodeId);
    const referenceRect = node.rect;
    
    const newNode: ElementSnapshot = {
      nodeType: 1,
      id: 'h2d-node-new-' + Date.now(),
      tag: 'div',
      attributes: {},
      styles: {
        width: '100px',
        height: '40px',
        backgroundColor: '#f0f0f0',
        border: '1px dashed #ccc',
        position: 'absolute',
        left: (referenceRect.x + 20) + 'px',
        top: (referenceRect.y + 20) + 'px'
      },
      rect: { x: referenceRect.x + 20, y: referenceRect.y + 20, width: 100, height: 40, cssWidth: 100, cssHeight: 40 },
      childNodes: []
    };

    const newRoot = addSiblingToTree(captureTree.root, nodeId, newNode);
    set({
      captureTree: { ...captureTree, root: newRoot as ElementSnapshot },
      selectedNodeIds: [newNode.id],
      saveStatus: 'unsaved'
    });
  },
  // 复制节点
  duplicateNode: (nodeId: string) => {
    const { captureTree, pushHistory, findNodeById } = get();
    if (!captureTree) return;
    
    const node = findNodeById(nodeId);
    if (!node || node.nodeType !== 1) return;
    
    pushHistory();
    
    // Deep clone and generate new ID
    const clonedNode = deepClone(node) as ElementSnapshot;
    const generateId = () => 'h2d-node-new-' + Date.now() + '-' + Math.floor(Math.random() * 1000000000);
    const generateNewIds = (n: ElementSnapshot): ElementSnapshot => {
      const newId = generateId();
      const newNode = { ...n, id: newId };
      newNode.rect = { ...n.rect, x: n.rect.x + 20, y: n.rect.y + 20 };
      // Update left/top in styles
      if (n.styles.left) {
        const leftVal = parseFloat(n.styles.left);
        if (!isNaN(leftVal)) {
          newNode.styles = { ...n.styles, left: (leftVal + 20) + 'px' };
        }
      }
      if (n.styles.top) {
        const topVal = parseFloat(n.styles.top);
        if (!isNaN(topVal)) {
          newNode.styles = { ...newNode.styles, top: (topVal + 20) + 'px' };
        }
      }
      newNode.childNodes = n.childNodes.map(child => {
        if (child.nodeType === 1) {
          return generateNewIds(child as ElementSnapshot);
        }
        return { ...child, id: generateId() };
      });
      return newNode;
    };
    
    const newNode = generateNewIds(clonedNode);
    const newRoot = addSiblingToTree(captureTree.root, nodeId, newNode);
    set({ 
      captureTree: { ...captureTree, root: newRoot as ElementSnapshot },
      selectedNodeIds: [newNode.id],
      saveStatus: 'unsaved'
    });
  },

  // 上移节点
  moveNodeUp: (nodeId: string) => {
    const { captureTree, pushHistory } = get();
    if (!captureTree) return;
    
    pushHistory();
    
    const newRoot = moveNodeInTree(captureTree.root, nodeId, 'up');
    set({ 
      captureTree: { ...captureTree, root: newRoot as ElementSnapshot },      saveStatus: 'unsaved'    });
  },
  // 下移节点
  moveNodeDown: (nodeId: string) => {
    const { captureTree, pushHistory } = get();
    if (!captureTree) return;
    
    pushHistory();
    
    const newRoot = moveNodeInTree(captureTree.root, nodeId, 'down');
    set({ 
      captureTree: { ...captureTree, root: newRoot as ElementSnapshot },      saveStatus: 'unsaved'    });
  },
  // 设置保存状态
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved') => {
    set({ saveStatus: status });
  },
  // 推入历史栈
  pushHistory: () => {
    const { captureTree, history, historyIndex } = get();
    if (!captureTree) return;
    
    // 删除当前索引之后的历史
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(deepClone(captureTree));
    
    // 限制历史栈大小为50
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    
    set({ 
      history: newHistory,       historyIndex: newHistory.length - 1     });
  },
  // 撤销
  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      set({ 
        historyIndex: newIndex,        captureTree: deepClone(history[newIndex])      });
    }
  },
  // 重做
  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      set({ 
        historyIndex: newIndex,        captureTree: deepClone(history[newIndex])      });
    }
  },
  // 根据ID查找节点
  findNodeById: (nodeId: string) => {
    const { captureTree } = get();
    if (!captureTree) return null;
    return findNodeInTree(captureTree.root, nodeId);
  },
  // 查找父节点
  findParentNode: (nodeId: string) => {
    const { captureTree } = get();
    if (!captureTree) return null;
    return findParentInTree(captureTree.root, nodeId);
  },
  // 查找节点在父节点中的索引
  findNodeIndexInParent: (nodeId: string) => {
    const { captureTree } = get();
    if (!captureTree) return { parent: null, index: -1 };
    return findNodeIndexInTree(captureTree.root, nodeId);
  },
  // 根据坐标查找节点(最内层，面积最小)
  findNodeAtPoint: (x: number, y: number) => {
    const { captureTree } = get();
    if (!captureTree) return null;
    
    const allNodes = flattenTree(captureTree.root);
    let bestNode: SnapshotNode | null = null;
    let bestArea = Infinity;
    
    for (const node of allNodes) {
      const rect = node.rect;
      // 跳过无效矩形
      if (rect.width <= 0 || rect.height <= 0) continue;
      
      if (pointInRect(x, y, rect)) {
        const area = rectArea(rect);
        // 选择面积最小的(最内层)
        if (area < bestArea) {
          bestArea = area;
          bestNode = node;
        }
      }
    }
    
    return bestNode;
  },
  // 查找与矩形相交的所有节点
  findNodesInRect: (rect: Rect) => {
    const { captureTree } = get();
    if (!captureTree) return [];
    
    const allNodes = flattenTree(captureTree.root);
    return allNodes.filter(node => {
      // 跳过无效矩形（包括缺少 rect 的情况）
      if (!node.rect || node.rect.width <= 0 || node.rect.height <= 0) return false;
      return rectsIntersect(rect, node.rect);
    });
  },
  // 展平所有节点
  flattenNodes: () => {
    const { captureTree } = get();
    if (!captureTree) return [];
    return flattenTree(captureTree.root);
  },
  // 应用AI节点编辑
  applyAINodeEdit: (nodeId: string, modifiedNode: unknown) => {
    const { captureTree, pushHistory } = get();
    if (!captureTree) return;

    pushHistory();

    const modified = modifiedNode as {
      nodeType?: number;
      id?: string;
      styles?: Record<string, string>;
      rect?: Partial<Rect>;
      text?: string;
      attributes?: Record<string, string>;
      childNodes?: unknown[];
      tag?: string;
    };

    const newRoot = updateNodeInTree(captureTree.root, nodeId, (node) => {
      const newNode = deepClone(node);

      // 更新 styles
      if (modified.styles && typeof modified.styles === 'object') {
        if (newNode.nodeType === 1) {
          (newNode as ElementSnapshot).styles = {
            ...(newNode as ElementSnapshot).styles,
            ...modified.styles,
          };
        }
      }

      // 更新 rect
      if (modified.rect && typeof modified.rect === 'object') {
        newNode.rect = { ...newNode.rect, ...modified.rect };

        // 同步更新 styles 中的 width/height
        if (newNode.nodeType === 1) {
          const elNode = newNode as ElementSnapshot;
          if (modified.rect.width !== undefined) {
            elNode.styles = { ...elNode.styles, width: `${modified.rect.width}px` };
          }
          if (modified.rect.height !== undefined) {
            elNode.styles = { ...elNode.styles, height: `${modified.rect.height}px` };
          }
          if (modified.rect.x !== undefined) {
            elNode.styles = { ...elNode.styles, left: `${modified.rect.x}px` };
          }
          if (modified.rect.y !== undefined) {
            elNode.styles = { ...elNode.styles, top: `${modified.rect.y}px` };
          }
        }
      }

      // 更新文本内容
      if (modified.text !== undefined && newNode.nodeType === 3) {
        (newNode as TextSnapshot).text = String(modified.text);
      }

      // 更新 attributes
      if (modified.attributes && typeof modified.attributes === 'object') {
        if (newNode.nodeType === 1) {
          (newNode as ElementSnapshot).attributes = {
            ...(newNode as ElementSnapshot).attributes,
            ...modified.attributes,
          };
        }
      }

      // 更新子节点
      if (modified.childNodes && Array.isArray(modified.childNodes) && newNode.nodeType === 1) {
        // 递归处理子节点更新
        const processChildNodes = (children: unknown[]): SnapshotNode[] => {
          return children.map((child) => {
            const childNode = child as {
              nodeType: number;
              id: string;
              text?: string;
              tag?: string;
              styles?: Record<string, string>;
              rect?: Rect;
              attributes?: Record<string, string>;
              childNodes?: unknown[];
            };

            if (childNode.nodeType === 3) {
              return {
                nodeType: 3,
                id: childNode.id,
                text: childNode.text || '',
                rect: childNode.rect || { x: 0, y: 0, width: 0, height: 0 },
              } as TextSnapshot;
            }

            return {
              nodeType: 1,
              id: childNode.id,
              tag: childNode.tag || 'div',
              styles: childNode.styles || {},
              rect: childNode.rect || { x: 0, y: 0, width: 0, height: 0 },
              attributes: childNode.attributes || {},
              childNodes: childNode.childNodes ? processChildNodes(childNode.childNodes) : [],
            } as ElementSnapshot;
          });
        };

        (newNode as ElementSnapshot).childNodes = processChildNodes(modified.childNodes);
      }

      // 更新 tag
      if (modified.tag && newNode.nodeType === 1) {
        (newNode as ElementSnapshot).tag = modified.tag;
      }

      return newNode;
    });

    set({
      captureTree: { ...captureTree, root: newRoot as ElementSnapshot },
      saveStatus: 'unsaved',
    });
  },

  // AI操作方法
  setAIMessages: (messages: ChatMessage[]) => {
    set({ aiMessages: messages });
  },
  setPendingModifiedTree: (tree: CaptureTree | null) => {
    set({ pendingModifiedTree: tree });
  },
  setCaptureTree: (tree: CaptureTree) => {
    // 验证树结构格式，防止坏数据导致白屏
    if (!isValidCaptureTree(tree)) {
      console.error('setCaptureTree: 拒绝设置格式不合法的 captureTree');
      return;
    }
    // 确保所有节点都有 rect
    ensureNodeRects((tree as unknown as Record<string, unknown>).root);
    set({ 
      captureTree: tree,
      saveStatus: 'unsaved'
    });
  },
  clearAIMessages: () => {
    set({ 
      aiMessages: [],
      pendingModifiedTree: null
    });
  },
  // 设置AI面板显示
  setShowAIPanel: (show: boolean) => {
    set({ showAIPanel: show });
  },

  // 设计工作流方法实现
  setDesignWorkflow: (sessionId, stage) => set({
    designWorkflowSessionId: sessionId,
    designWorkflowStage: stage as any,
  }),

  setStateVariants: (variants) => set({ stateVariants: variants }),

  previewVariant: (index) => {
    const { stateVariants, captureTree, originalTreeBeforePreview } = get();
    if (index < 0 || index >= stateVariants.length) return;

    // 首次预览时保存原始树
    if (!originalTreeBeforePreview && captureTree) {
      set({ originalTreeBeforePreview: JSON.parse(JSON.stringify(captureTree)) });
    }

    const variant = stateVariants[index];
    if (variant.modifiedTree) {
      // 直接设置 captureTree，但不入历史（不调用 pushHistory）
      // 注意要绕过 setCaptureTree 的历史逻辑，直接 set
      set({
        captureTree: variant.modifiedTree,
        activeVariantIndex: index,
        // 不改变 saveStatus，因为这只是预览
      });
    }
  },

  applyVariant: (index) => {
    const { stateVariants, originalTreeBeforePreview } = get();
    if (index < 0 || index >= stateVariants.length) return;

    const variant = stateVariants[index];
    if (variant.modifiedTree) {
      // 先恢复原始树（如果在预览中），然后正式应用
      if (originalTreeBeforePreview) {
        // pushHistory 保存原始状态
        get().pushHistory();
      }
      set({
        captureTree: variant.modifiedTree,
        activeVariantIndex: index,
        originalTreeBeforePreview: null,
        saveStatus: 'unsaved',
      });
    }
  },

  exitVariantPreview: () => {
    const { originalTreeBeforePreview } = get();
    if (originalTreeBeforePreview) {
      set({
        captureTree: originalTreeBeforePreview,
        originalTreeBeforePreview: null,
        activeVariantIndex: -1,
      });
    }
  },

  clearDesignWorkflow: () => set({
    designWorkflowSessionId: null,
    designWorkflowStage: null,
    stateVariants: [],
    activeVariantIndex: -1,
    originalTreeBeforePreview: null,
  }),

  // 清理状态
  clear: () => {
    set({
      projectId: null,
      pageId: null,
      captureTree: null,
      screenshotUrl: null,
      selectedNodeIds: [],
      hoveredNodeId: null,
      zoom: 1,
      panX: 0,
      panY: 0,
      tool: 'select',
      history: [],
      historyIndex: -1,
      isLoading: false,
      error: null,
      aiMessages: [],
      aiLoading: false,
      pendingModifiedTree: null,
      showAIPanel: false,
      // 清理设计工作流状态
      designWorkflowSessionId: null,
      designWorkflowStage: null,
      stateVariants: [],
      activeVariantIndex: -1,
      originalTreeBeforePreview: null,
    });
  },
}));
