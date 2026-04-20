import { useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiPut } from '../../api/client.ts';
import './PageTree.css';

interface PageHierarchyNode {
  id: string;
  name: string;
  url: string;
  parentId: string | null;
  children: PageHierarchyNode[];
  screenshotPath: string;
  hasEdited: boolean;
}

interface PageTreeProps {
  projectId: string;
  nodes: PageHierarchyNode[];
  onHierarchyChange: () => void;
}

/** Check if `targetId` is a descendant of `draggedId` in the tree */
function isDescendant(nodes: PageHierarchyNode[], draggedId: string, targetId: string): boolean {
  function findNode(list: PageHierarchyNode[], id: string): PageHierarchyNode | null {
    for (const node of list) {
      if (node.id === id) return node;
      const found = findNode(node.children, id);
      if (found) return found;
    }
    return null;
  }

  function hasDescendant(node: PageHierarchyNode, id: string): boolean {
    for (const child of node.children) {
      if (child.id === id) return true;
      if (hasDescendant(child, id)) return true;
    }
    return false;
  }

  const draggedNode = findNode(nodes, draggedId);
  if (!draggedNode) return false;
  return hasDescendant(draggedNode, targetId);
}

function PageTree({ projectId, nodes, onHierarchyChange }: PageTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Expand all nodes with children by default
    const ids = new Set<string>();
    function collect(list: PageHierarchyNode[]) {
      for (const node of list) {
        if (node.children.length > 0) ids.add(node.id);
        collect(node.children);
      }
    }
    collect(nodes);
    return ids;
  });

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<'node' | 'root' | null>(null);
  const [updating, setUpdating] = useState(false);
  const dragCounter = useRef<Map<string, number>>(new Map());

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, nodeId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', nodeId);
    setDraggedId(nodeId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTargetId(null);
    setDropZone(null);
    dragCounter.current.clear();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const count = (dragCounter.current.get(targetId) || 0) + 1;
    dragCounter.current.set(targetId, count);
    if (count === 1) {
      setDropTargetId(targetId);
      setDropZone('node');
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const count = (dragCounter.current.get(targetId) || 0) - 1;
    dragCounter.current.set(targetId, count);
    if (count <= 0) {
      dragCounter.current.delete(targetId);
      if (dropTargetId === targetId) {
        setDropTargetId(null);
        setDropZone(null);
      }
    }
  }, [dropTargetId]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData('text/plain');

    setDraggedId(null);
    setDropTargetId(null);
    setDropZone(null);
    dragCounter.current.clear();

    if (!sourceId || sourceId === targetId || updating) return;

    // Cycle detection: reject if target is a descendant of source
    if (targetId && isDescendant(nodes, sourceId, targetId)) return;

    setUpdating(true);
    try {
      await apiPut(`/projects/${projectId}/pages/${sourceId}/parent`, {
        parentId: targetId,
      });
      onHierarchyChange();
    } catch (err) {
      console.error('Failed to update page hierarchy:', err);
    } finally {
      setUpdating(false);
    }
  }, [nodes, projectId, onHierarchyChange, updating]);

  // Root drop zone handlers
  const handleRootDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropZone('root');
  }, []);

  const handleRootDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (dropZone === 'root') setDropZone(null);
  }, [dropZone]);

  const handleRootDrop = useCallback((e: React.DragEvent) => {
    handleDrop(e, null);
  }, [handleDrop]);

  const renderNode = (node: PageHierarchyNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isDragging = draggedId === node.id;
    const isDropTarget = dropTargetId === node.id && dropZone === 'node';
    const isInvalid = draggedId !== null && draggedId !== node.id && isDescendant(nodes, draggedId, node.id);

    return (
      <div key={node.id} className="page-tree-branch">
        <div
          className={[
            'page-tree-node',
            isDragging ? 'dragging' : '',
            isDropTarget ? 'drop-target' : '',
            isInvalid ? 'drop-invalid' : '',
          ].filter(Boolean).join(' ')}
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
          draggable={!updating}
          onDragStart={(e) => handleDragStart(e, node.id)}
          onDragEnd={handleDragEnd}
          onDragEnter={(e) => handleDragEnter(e, node.id)}
          onDragLeave={(e) => handleDragLeave(e, node.id)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, node.id)}
        >
          {/* Expand/collapse toggle */}
          <button
            className="tree-toggle"
            onClick={() => hasChildren && toggleExpand(node.id)}
            style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
            aria-label={isExpanded ? '折叠' : '展开'}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* Thumbnail */}
          <div className="tree-thumb">
            {node.screenshotPath ? (
              <img src={node.screenshotPath} alt="" />
            ) : (
              <div className="tree-thumb-placeholder">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </svg>
              </div>
            )}
          </div>

          {/* Page info */}
          <div className="tree-info">
            <Link to={`/editor/${projectId}/${node.id}`} className="tree-name">
              {node.name}
            </Link>
            {node.hasEdited && <span className="tree-edited-badge">已编辑</span>}
          </div>

          {/* Drag handle indicator */}
          <div className="tree-drag-handle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="6" r="1" fill="currentColor" />
              <circle cx="15" cy="6" r="1" fill="currentColor" />
              <circle cx="9" cy="12" r="1" fill="currentColor" />
              <circle cx="15" cy="12" r="1" fill="currentColor" />
              <circle cx="9" cy="18" r="1" fill="currentColor" />
              <circle cx="15" cy="18" r="1" fill="currentColor" />
            </svg>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="page-tree-children">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page-tree">
      {nodes.map(node => renderNode(node, 0))}

      {/* Root drop zone — drag here to make a page top-level */}
      <div
        className={`page-tree-root-zone ${dropZone === 'root' ? 'active' : ''} ${draggedId ? 'visible' : ''}`}
        onDragEnter={handleRootDragEnter}
        onDragLeave={handleRootDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleRootDrop}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        拖拽到此处设为顶级页面
      </div>

      {nodes.length === 0 && (
        <div className="page-tree-empty">暂无页面</div>
      )}
    </div>
  );
}

export default PageTree;
