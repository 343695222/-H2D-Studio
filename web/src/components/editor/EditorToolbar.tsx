import { useEditorStore } from '../../stores/editorStore.ts';
import { ExportMenu } from './ExportMenu.tsx';
import { copyToFigma, isClipboardAvailable } from '../../utils/figmaClipboard.ts';
import './EditorToolbar.css';

interface EditorToolbarProps {
  onToggleAIPanel?: () => void;
  isAIPanelOpen?: boolean;
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  // Add styles
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    animation: toast-in 0.3s ease;
    background-color: ${type === 'error' ? '#ef4444' : '#10b981'};
    color: white;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  `;
  
  // Add animation keyframes if not exists
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      @keyframes toast-in {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      @keyframes toast-out {
        from { opacity: 1; transform: translateX(-50%) translateY(0); }
        to { opacity: 0; transform: translateX(-50%) translateY(20px); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
}

export function EditorToolbar({ onToggleAIPanel, isAIPanelOpen }: EditorToolbarProps) {
  const { 
    tool, 
    setTool, 
    zoom, 
    setZoom, 
    undo, 
    redo, 
    historyIndex, 
    history,
    captureTree,
    setPan,
    saveStatus,
    savePage
  } = useEditorStore();

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleZoomIn = () => {
    setZoom(zoom * 1.2);
  };

  const handleZoomOut = () => {
    setZoom(zoom / 1.2);
  };

  const handleFitToScreen = () => {
    if (!captureTree) return;
    const { documentRect } = captureTree;
    // 假设容器大小为 1200x800 (典型值)
    const containerWidth = 1200;
    const containerHeight = 800;
    const scaleX = containerWidth / documentRect.width;
    const scaleY = containerHeight / documentRect.height;
    const newZoom = Math.min(scaleX, scaleY, 1);
    setZoom(newZoom);
    setPan(0, 0);
  };

  const handleCopyToFigma = async () => {
    if (!captureTree) return;
    
    try {
      await copyToFigma(captureTree);
      showToast('已复制到剪贴板，在 Figma 中按 Ctrl+V 粘贴');
    } catch (err) {
      console.error('Copy to Figma failed:', err);
      showToast('复制失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    }
  };

  const handleSave = async () => {
    try {
      await savePage();
      showToast('保存成功');
    } catch (err) {
      showToast('保存失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    }
  };

  // 保存状态显示
  const getSaveStatusDisplay = () => {
    switch (saveStatus) {
      case 'saving':
        return { text: '保存中...', icon: '⏳', className: 'saving' };
      case 'unsaved':
        return { text: '未保存', icon: '●', className: 'unsaved' };
      case 'saved':
      default:
        return { text: '已保存', icon: '✓', className: 'saved' };
    }
  };

  const saveStatusDisplay = getSaveStatusDisplay();

  return (
    <div className="editor-toolbar">
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${tool === 'select' ? 'active' : ''}`}
          onClick={() => setTool('select')}
          title="选择工具 (V)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.5 1.5a.5.5 0 0 0-1 0v5.793L5.354 5.146a.5.5 0 1 0-.707.707l3 3a.5.5 0 0 0 .707 0l3-3a.5.5 0 0 0-.707-.707L8.5 7.293V1.5z"/>
            <path d="M3.5 9.5a.5.5 0 0 0-1 0v3A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-3a.5.5 0 0 0-1 0v3a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-3z"/>
          </svg>
          <span>选择</span>
        </button>
        <button
          className={`toolbar-btn ${tool === 'marquee' ? 'active' : ''}`}
          onClick={() => setTool('marquee')}
          title="框选工具 (M)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 0h4v1H1v3H0V0zm0 11h1v3h3v1H0v-4zm15 0h-1v3h-3v1h4v-4zm0-11h-4v1h3v3h1V0z"/>
            <path d="M2 2h12v12H2V2zm1 1v10h10V3H3z" fillOpacity="0.4"/>
          </svg>
          <span>框选</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={undo}
          disabled={!canUndo}
          title="撤销 (Ctrl+Z)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/>
          </svg>
          <span>撤销</span>
        </button>
        <button
          className="toolbar-btn"
          onClick={redo}
          disabled={!canRedo}
          title="重做 (Ctrl+Shift+Z)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
          </svg>
          <span>重做</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group zoom-controls">
        <button
          className="toolbar-btn btn-icon"
          onClick={handleZoomOut}
          title="缩小 (-)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z"/>
          </svg>
        </button>
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
        <button
          className="toolbar-btn btn-icon"
          onClick={handleZoomIn}
          title="放大 (+)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
          </svg>
        </button>
        <button
          className="toolbar-btn"
          onClick={handleFitToScreen}
          title="适应屏幕"
        >
          适应
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className={`toolbar-btn ai-btn ${isAIPanelOpen ? 'active' : ''}`}
          onClick={onToggleAIPanel}
          title="AI 助手 (Ctrl+I)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
          <span>AI 助手</span>
        </button>
        <ExportMenu />
        <button
          className="toolbar-btn btn-primary figma-btn"
          onClick={handleCopyToFigma}
          disabled={!captureTree || !isClipboardAvailable()}
          title="复制到 Figma"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 3a3 3 0 1 1 6 0 3 3 0 0 1-6 0zm3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
            <path d="M9 6h1a2 2 0 0 1 0 4H9V6z"/>
            <path d="M8 6H7a2 2 0 1 0 0 4h1V6z"/>
            <path d="M7 10h1v1a2 2 0 1 1-2-2h1v1z"/>
            <path d="M9 10h1a2 2 0 1 1-2 2v-1h1z"/>
          </svg>
          <span>复制到 Figma</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* 保存状态 */}
      <div className="toolbar-group save-status-group">
        <button
          className={`toolbar-btn save-btn ${saveStatusDisplay.className}`}
          onClick={handleSave}
          disabled={saveStatus === 'saved' || saveStatus === 'saving'}
          title="保存 (Ctrl+S)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 2H9v3h2V2z"/>
            <path d="M1.5 0h11.586a1.5 1.5 0 0 1 1.06.44l1.415 1.414A1.5 1.5 0 0 1 16 2.914V14.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 14.5v-13A1.5 1.5 0 0 1 1.5 0zM1 1.5v13a.5.5 0 0 0 .5.5H2v-4.5A1.5 1.5 0 0 1 3.5 9h9a1.5 1.5 0 0 1 1.5 1.5V15h.5a.5.5 0 0 0 .5-.5V2.914a.5.5 0 0 0-.146-.353l-1.415-1.415A.5.5 0 0 0 13.086 1H13v4.5A1.5 1.5 0 0 1 11.5 6h-7A1.5 1.5 0 0 1 3 4.5V1H1.5a.5.5 0 0 0-.5.5zm3 4a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V1H4v4.5zM3 15h10v-4.5a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5V15z"/>
          </svg>
          <span>{saveStatusDisplay.text}</span>
        </button>
      </div>
    </div>
  );
}