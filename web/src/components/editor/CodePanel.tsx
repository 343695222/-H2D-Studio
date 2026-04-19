import { useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore.ts';
import type { CaptureTree, ElementSnapshot } from '../../types/capture.ts';
import './CodePanel.css';

type ViewMode = 'selected' | 'full';
type EditMode = 'readonly' | 'edit';

export function CodePanel() {
  const { 
    captureTree, 
    selectedNodeIds, 
    findNodeById,
    pushHistory
  } = useEditorStore();
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('selected');
  const [editMode, setEditMode] = useState<EditMode>('readonly');
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // 获取当前显示的 JSON 对象
  const getCurrentJson = useCallback((): unknown => {
    if (!captureTree) return null;
    
    if (viewMode === 'full') {
      return captureTree;
    } else {
      // 显示选中节点的子树
      if (selectedNodeIds.length === 1) {
        const node = findNodeById(selectedNodeIds[0]);
        if (node) return node;
      }
      return null;
    }
  }, [captureTree, viewMode, selectedNodeIds, findNodeById]);
  
  // 格式化 JSON
  const formatJson = (obj: unknown): string => {
    if (obj === null) return '';
    return JSON.stringify(obj, null, 2);
  };
  
  // 更新编辑文本当 JSON 改变时
  useEffect(() => {
    const json = getCurrentJson();
    setEditText(formatJson(json));
    setError(null);
  }, [getCurrentJson]);
  
  // 复制到剪贴板
  const copyToClipboard = () => {
    const json = getCurrentJson();
    if (json) {
      navigator.clipboard.writeText(formatJson(json));
    }
  };
  
  // 下载 JSON 文件
  const downloadJson = () => {
    const json = getCurrentJson();
    if (!json) return;
    
    const blob = new Blob([formatJson(json)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = viewMode === 'full' ? 'capture-tree.json' : 'selected-node.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // 应用编辑的 JSON
  const applyChanges = () => {
    const store = useEditorStore.getState();
    if (!store.captureTree) return;
    
    try {
      const parsed = JSON.parse(editText);
      
      if (viewMode === 'full') {
        // 验证完整树结构
        if (!parsed.root || !parsed.documentRect) {
          throw new Error('无效的 CaptureTree 结构');
        }
        
        pushHistory();
        
        const newTree: CaptureTree = {
          ...parsed,
          root: parsed.root as ElementSnapshot
        };
        
        useEditorStore.setState({ 
          captureTree: newTree,
          saveStatus: 'unsaved'
        });
      } else {
        // 验证节点结构
        if (!parsed.id || parsed.nodeType === undefined) {
          throw new Error('无效的节点结构');
        }
        
        if (selectedNodeIds.length !== 1) {
          throw new Error('请先选择一个节点');
        }
        
        const nodeId = selectedNodeIds[0];
        
        // 递归替换节点
        const replaceNodeInTree = (node: ElementSnapshot): ElementSnapshot => {
          if (node.id === nodeId) {
            return parsed as ElementSnapshot;
          }
          
          return {
            ...node,
            childNodes: node.childNodes.map(child => {
              if (child.nodeType === 1) {
                return replaceNodeInTree(child as ElementSnapshot);
              }
              if (child.id === nodeId) {
                return parsed as ElementSnapshot;
              }
              return child;
            })
          };
        };
        
        pushHistory();
        
        const newRoot = replaceNodeInTree(store.captureTree.root);
        
        useEditorStore.setState({ 
          captureTree: { ...store.captureTree, root: newRoot },
          saveStatus: 'unsaved'
        });
      }
      
      setError(null);
      setEditMode('readonly');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'JSON 格式错误');
    }
  };
  
  // 取消编辑
  const cancelEdit = () => {
    const json = getCurrentJson();
    setEditText(formatJson(json));
    setError(null);
    setEditMode('readonly');
  };
  
  // 切换编辑模式
  const toggleEditMode = () => {
    if (editMode === 'readonly') {
      setEditMode('edit');
    } else {
      cancelEdit();
    }
  };
  
  const json = getCurrentJson();
  const hasSelection = selectedNodeIds.length === 1;
  
  return (
    <div className={`code-panel ${isExpanded ? 'expanded' : ''}`}>
      <div className="code-panel-header" onClick={() => !isExpanded && setIsExpanded(true)}>
        <div className="code-panel-title">
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 16 16" 
            fill="currentColor"
            className={`expand-icon ${isExpanded ? 'expanded' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
          </svg>
          <span>代码预览</span>
        </div>
        
        {isExpanded && captureTree && (
          <div className="code-panel-actions">
            {/* 视图模式切换 */}
            <div className="view-mode-tabs">
              <button 
                className={`mode-tab ${viewMode === 'selected' ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setViewMode('selected'); }}
                disabled={!hasSelection}
                title={hasSelection ? '选中节点' : '请先选择一个节点'}
              >
                选中节点
              </button>
              <button 
                className={`mode-tab ${viewMode === 'full' ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setViewMode('full'); }}
              >
                完整树
              </button>
            </div>
            
            {/* 编辑/只读切换 */}
            <button 
              className={`code-action-btn ${editMode === 'edit' ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); toggleEditMode(); }}
              title={editMode === 'readonly' ? '进入编辑模式' : '取消编辑'}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                {editMode === 'readonly' ? (
                  <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/>
                ) : (
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                )}
              </svg>
              {editMode === 'readonly' ? '编辑' : '取消'}
            </button>
            
            {editMode === 'edit' && (
              <button 
                className="code-action-btn btn-primary"
                onClick={(e) => { e.stopPropagation(); applyChanges(); }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>
                </svg>
                应用
              </button>
            )}
            
            <button className="code-action-btn" onClick={(e) => { e.stopPropagation(); copyToClipboard(); }} title="复制">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
              </svg>
              复制
            </button>
            <button className="code-action-btn" onClick={(e) => { e.stopPropagation(); downloadJson(); }} title="下载">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
              </svg>
              下载
            </button>
          </div>
        )}
      </div>
      
      {isExpanded && (
        <div className="code-panel-content">
          {captureTree ? (
            <>
              {editMode === 'readonly' ? (
                <pre className="code-preview">
                  <code>{formatJson(json)}</code>
                </pre>
              ) : (
                <div className="code-edit-container">
                  <textarea
                    className={`code-edit-textarea ${error ? 'has-error' : ''}`}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    spellCheck={false}
                  />
                  {error && (
                    <div className="code-error-message">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
                      </svg>
                      {error}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="code-empty">
              <p>暂无数据</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
