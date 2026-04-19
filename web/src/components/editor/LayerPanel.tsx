import { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore.ts';
import type { SnapshotNode } from '../../types/capture.ts';
import './LayerPanel.css';

interface TreeNodeItemProps {
  node: SnapshotNode;
  depth: number;
}

function TreeNodeItem({ node, depth }: TreeNodeItemProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const { selectedNodeIds, selectNode, hoverNode } = useEditorStore();
  const isSelected = selectedNodeIds.includes(node.id);
  
  const isTextNode = node.nodeType === 3;
  const childNodes = !isTextNode ? (node as { childNodes?: SnapshotNode[] }).childNodes : undefined;
  const hasChildren = (childNodes?.length ?? 0) > 0;
  
  // 截断文本预览
  const truncate = (str: string, maxLen: number) => {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
  };
  
  // 获取节点显示文本
  const getNodeLabel = () => {
    if (isTextNode) {
      const textNode = node as { text: string };
      return `"${truncate(textNode.text, 20)}"`;
    }
    const elementNode = node as { tag: string };
    return elementNode.tag;
  };
  
  // 获取节点图标
  const getNodeIcon = () => {
    if (isTextNode) {
      return (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="node-icon text-icon">
          <path d="M2.5 3a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5h2a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5h-2zm0 5a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5h2a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5h-2zm0 5a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5h2a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5h-2z"/>
          <path d="M6 3.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5zM6 6.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5zM6 9.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5z"/>
        </svg>
      );
    }
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="node-icon element-icon">
        <path d="M6 1a1 1 0 0 0-1 1v3.5A1.5 1.5 0 0 0 6.5 7h3A1.5 1.5 0 0 0 11 5.5V2a1 1 0 0 0-1-1H6zm1 5v-4h2v4H7z"/>
        <path d="M3 4.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-7zM8.5 9a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-1z"/>
        <path d="M1.5 8a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5zm6.5.5a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-1 0v2a.5.5 0 0 0 .5.5z"/>
      </svg>
    );
  };
  
  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };
  
  const handleClick = (e: React.MouseEvent) => {
    selectNode(node.id, e.shiftKey || e.ctrlKey || e.metaKey);
  };
  
  const handleMouseEnter = () => {
    hoverNode(node.id);
  };
  
  const handleMouseLeave = () => {
    hoverNode(null);
  };
  
  return (
    <div className="tree-node-wrapper">
      <div
        className={`tree-node ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* 展开/折叠按钮 */}
        {hasChildren ? (
          <button
            className={`expand-btn ${expanded ? 'expanded' : ''}`}
            onClick={toggleExpanded}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 12.796V3.204L11.481 8 6 12.796zm.659.753 5.48-4.796a1 1 0 0 0 0-1.506L6.66 2.451C6.011 1.885 5 2.345 5 3.204v9.592a1 1 0 0 0 1.659.753z"/>
            </svg>
          </button>
        ) : (
          <span className="expand-placeholder" />
        )}
        
        {/* 节点图标 */}
        {getNodeIcon()}
        
        {/* 节点标签 */}
        <span className={`node-label ${isTextNode ? 'text-label' : ''}`}>
          {getNodeLabel()}
        </span>
        
        {/* 尺寸信息 */}
        {!isTextNode && node.rect && (
          <span className="node-dimensions">
            {Math.round(node.rect.width)}×{Math.round(node.rect.height)}
          </span>
        )}
      </div>
      
      {/* 子节点 */}
      {expanded && hasChildren && (
        <div className="tree-children">
          {(node as { childNodes: SnapshotNode[] }).childNodes.map(child => (
            <TreeNodeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function LayerPanel() {
  const { captureTree, flattenNodes } = useEditorStore();
  
  const allNodes = flattenNodes();
  const elementCount = allNodes.filter(n => n.nodeType === 1).length;
  const textCount = allNodes.filter(n => n.nodeType === 3).length;
  
  return (
    <div className="layer-panel">
      <div className="layer-panel-header">
        <h3>图层</h3>
        <span className="layer-stats">
          {elementCount} 元素 · {textCount} 文本
        </span>
      </div>
      
      <div className="layer-panel-content">
        {captureTree ? (
          <TreeNodeItem node={captureTree.root} depth={0} />
        ) : (
          <div className="layer-empty">
            <p>暂无数据</p>
          </div>
        )}
      </div>
    </div>
  );
}
