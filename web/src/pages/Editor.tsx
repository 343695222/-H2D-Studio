import { useEffect, useRef, Component, type ReactNode, type ErrorInfo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useEditorStore } from '../stores/editorStore.ts';
import { EditorToolbar, Canvas, LayerPanel, PropertyPanel, CodePanel } from '../components/editor';
import { AIPanel } from '../components/editor/AIPanel.tsx';
import Loading from '../components/Loading.tsx';
import './Editor.css';

// ErrorBoundary for Canvas - prevents white screen on rendering crash
class CanvasErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Canvas rendering error:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    // Reload page to recover from corrupted state
    window.location.reload();
  };

  handleUndo = () => {
    // Try undoing to previous state
    useEditorStore.getState().undo();
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="canvas-container canvas-error" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#e74c3c',
          gap: '16px',
          padding: '24px',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4"/>
            <path d="M12 16h.01"/>
          </svg>
          <h3 style={{ margin: 0 }}>渲染错误</h3>
          <p style={{ margin: 0, color: '#666', textAlign: 'center', maxWidth: '400px' }}>
            页面渲染时发生错误，可能是由于数据格式不兼容导致。
          </p>
          <p style={{ margin: 0, color: '#999', fontSize: '12px', maxWidth: '500px', wordBreak: 'break-all' }}>
            {this.state.error?.message}
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={this.handleUndo}
              style={{
                padding: '8px 16px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              撤销到上一步
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                background: '#4a90d9',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              重新加载页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Editor() {
  const { projectId, pageId } = useParams<{ projectId: string; pageId: string }>();
  const { 
    isLoading, 
    error, 
    loadPage, 
    clear, 
    clearSelection,
    undo,
    redo,
    setZoom,
    captureTree,
    savePage,
    saveStatus,
    setSaveStatus,
    clearAIMessages,
    showAIPanel,
    setShowAIPanel,
  } = useEditorStore();
  
  // 用于防抖保存的 ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载页面数据
  useEffect(() => {
    if (projectId && pageId) {
      loadPage(projectId, pageId);
      // 清空之前的AI对话
      clearAIMessages();
    }
    return () => {
      clear();
    };
  }, [projectId, pageId, loadPage, clear, clearAIMessages]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: 清除选择
      if (e.key === 'Escape') {
        clearSelection();
        return;
      }
      
      // Ctrl/Cmd + Z: 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      
      // Ctrl/Cmd + Shift + Z: 重做
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }
      
      // Ctrl/Cmd + Y: 重做 (Windows常见)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      
      // Ctrl/Cmd + S: 保存
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (saveStatus === 'unsaved') {
          // 清除自动保存定时器
          if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
          // 立即保存
          setSaveStatus('saving');
          savePage().then(() => {
            setSaveStatus('saved');
          }).catch(() => {
            setSaveStatus('unsaved');
          });
        }
        return;
      }
      
      // +/-: 缩放
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoom(useEditorStore.getState().zoom * 1.2);
        return;
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        setZoom(useEditorStore.getState().zoom / 1.2);
        return;
      }
      
      // 0: 重置缩放
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        setZoom(1);
        return;
      }
      
      // Ctrl+I: 切换AI面板
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        const current = useEditorStore.getState().showAIPanel;
        useEditorStore.getState().setShowAIPanel(!current);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, undo, redo, setZoom, saveStatus, savePage, setSaveStatus]);
  
  // 自动保存 (debounce 2秒)
  useEffect(() => {
    if (!captureTree || !projectId || !pageId) return;
    if (saveStatus !== 'unsaved') return;
    
    // 清除之前的定时器
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    
    // 设置新的定时器
    saveTimerRef.current = setTimeout(() => {
      setSaveStatus('saving');
      savePage().then(() => {
        setSaveStatus('saved');
      }).catch(() => {
        setSaveStatus('unsaved');
      });
    }, 2000);
    
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [captureTree, projectId, pageId, saveStatus, savePage, setSaveStatus]);

  // 渲染加载状态
  if (isLoading) {
    return (
      <div className="editor-page">
        <Loading />
      </div>
    );
  }

  // 渲染错误状态
  if (error) {
    return (
      <div className="editor-page">
        <div className="error-container">
          <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
          </svg>
          <p>编辑器加载失败: {error}</p>
          <Link to={`/project/${projectId}`} className="btn btn-primary">
            返回项目
          </Link>
        </div>
      </div>
    );
  }

  const handleToggleAIPanel = () => {
    setShowAIPanel(!showAIPanel);
  };

  return (
    <div className="editor-page">
      {/* 工具栏 */}
      <EditorToolbar 
        onToggleAIPanel={handleToggleAIPanel}
        isAIPanelOpen={showAIPanel}
      />
      
      {/* 主编辑区 */}
      <div className="editor-main">
        {/* 左侧面板 - 图层 */}
        <LayerPanel />
        
        {/* 中间画布 */}
        <CanvasErrorBoundary>
          <Canvas />
        </CanvasErrorBoundary>
        
        {/* 右侧面板 - 属性 */}
        <PropertyPanel />
        
        {/* AI面板 */}
        <AIPanel 
          isOpen={showAIPanel}
          onClose={() => setShowAIPanel(false)}
        />
      </div>
      
      {/* 底部代码面板 */}
      <CodePanel />
    </div>
  );
}

export default Editor;
