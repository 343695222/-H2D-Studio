import { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore.ts';
import { apiPost } from '../../api/client.ts';
import './ExportMenu.css';

interface ExportOption {
  key: string;
  label: string;
  icon: string;
}

const exportOptions: ExportOption[] = [
  { key: 'json', label: '结构 JSON', icon: '{}' },
  { key: 'html', label: 'HTML 代码', icon: '</>' },
  { key: 'react', label: 'React 组件', icon: '⚛' },
  { key: 'vue', label: 'Vue 组件', icon: '◢' },
  { key: 'png', label: '标注截图 PNG', icon: '🖼' },
];

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { captureTree, projectId, pageId } = useEditorStore();

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  async function handleExport(type: string) {
    if (!captureTree) return;

    setExporting(type);
    try {
      if (type === 'json') {
        // Direct JSON download
        const json = JSON.stringify(captureTree, null, 2);
        downloadFile(json, 'capture.json', 'application/json');
      } else if (type === 'png') {
        // Canvas screenshot export
        await exportCanvasPNG();
      } else {
        // Call backend API
        const res = await apiPost<{ code?: string; html?: string; filename: string; message?: string }>(
          `/export/${type}`,
          { captureTree, projectId, pageId }
        );
        const content = res.code || res.html || '';
        downloadFile(content, res.filename, 'text/plain');
        
        if (res.message) {
          console.log('Export message:', res.message);
        }
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('导出失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setExporting(null);
      setIsOpen(false);
    }
  }

  async function exportCanvasPNG() {
    // Find the canvas container
    const canvasContainer = document.querySelector('.canvas-container');
    if (!canvasContainer) {
      throw new Error('Canvas container not found');
    }

    // Find the screenshot image
    const screenshotImg = canvasContainer.querySelector('img') as HTMLImageElement;
    if (!screenshotImg || !screenshotImg.src) {
      throw new Error('Screenshot not found');
    }

    // Create a temporary canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    // Load the screenshot image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load screenshot'));
      img.src = screenshotImg.src;
    });

    // Set canvas size to match image
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Draw the screenshot
    ctx.drawImage(img, 0, 0);

    // Get selected nodes from store
    const { selectedNodeIds, flattenNodes } = useEditorStore.getState();
    
    if (selectedNodeIds.length > 0) {
      // Draw selection overlays
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(255, 68, 68, 0.1)';

      const allNodes = flattenNodes();
      const selectedNodes = allNodes.filter(node => selectedNodeIds.includes(node.id));

      for (const node of selectedNodes) {
        const { rect } = node;
        // Scale rect to image coordinates
        const scaleX = img.naturalWidth / captureTree!.documentRect.width;
        const scaleY = img.naturalHeight / captureTree!.documentRect.height;

        const x = rect.x * scaleX;
        const y = rect.y * scaleY;
        const w = rect.width * scaleX;
        const h = rect.height * scaleY;

        // Draw rectangle
        ctx.strokeRect(x, y, w, h);
        ctx.fillRect(x, y, w, h);

        // Draw label
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 14px sans-serif';
        const label = node.nodeType === 1 
          ? (node as { tag: string }).tag 
          : 'text';
        ctx.fillText(label, x + 2, y - 4);
        ctx.fillStyle = 'rgba(255, 68, 68, 0.1)';
      }
    }

    // Export as PNG
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'capture-annotated.png';
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const hasCaptureTree = !!captureTree;

  return (
    <div className="export-menu" ref={menuRef}>
      <button
        className="toolbar-btn"
        onClick={() => setIsOpen(!isOpen)}
        disabled={!hasCaptureTree}
        title="导出"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
          <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z" />
        </svg>
        <span>导出</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            marginLeft: '4px',
          }}
        >
          <path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
        </svg>
      </button>

      {isOpen && (
        <div className="export-dropdown">
          {exportOptions.map((option) => (
            <button
              key={option.key}
              className="export-option"
              onClick={() => handleExport(option.key)}
              disabled={exporting === option.key}
            >
              <span className="export-icon">{option.icon}</span>
              <span className="export-label">{option.label}</span>
              {exporting === option.key && (
                <span className="export-spinner">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
                    <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
