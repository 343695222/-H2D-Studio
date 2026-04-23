import { useState, useEffect, useCallback } from 'react';
import './SolarWirePreview.css';

interface SolarWirePreviewProps {
  dsl: string;
  projectId: string;
  onImportToEditor?: (captureTree: unknown) => void;
}

export default function SolarWirePreview({
  dsl,
  projectId: _projectId,
  onImportToEditor,
}: SolarWirePreviewProps) {
  void _projectId; // reserved for future use
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!dsl.trim()) {
      setError('DSL 内容为空');
      setSvgHtml(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSvgHtml(null);

    fetch('/api/solarwire/render-svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dsl }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.svg) {
          setSvgHtml(data.svg);
        } else {
          setError(data.error?.message || '渲染 SVG 失败');
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || '网络请求失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [dsl]);

  const handleImport = useCallback(async () => {
    if (!onImportToEditor || importing) return;
    setImporting(true);
    try {
      const res = await fetch('/api/solarwire/to-capture-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dsl }),
      });
      const data = await res.json();
      if (data.success && data.captureTree) {
        onImportToEditor(data.captureTree);
      } else {
        alert(data.error?.message || '转换为 CaptureTree 失败');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '导入失败';
      alert(msg);
    } finally {
      setImporting(false);
    }
  }, [dsl, onImportToEditor, importing]);

  // Error / fallback: show raw DSL as code block
  if (error || (!loading && !svgHtml)) {
    return (
      <div className="sw-preview sw-preview--error">
        {error && <div className="sw-preview-error-msg">⚠ {error}</div>}
        <pre className="sw-preview-code"><code>{dsl}</code></pre>
      </div>
    );
  }

  return (
    <div className="sw-preview">
      {/* SVG render area */}
      <div className="sw-preview-svg">
        {loading ? (
          <div className="sw-preview-loading">渲染中...</div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: svgHtml! }} />
        )}
      </div>

      {/* Action buttons */}
      <div className="sw-preview-actions">
        {onImportToEditor && (
          <button
            className="sw-preview-btn sw-preview-btn--import"
            onClick={handleImport}
            disabled={importing || loading}
          >
            {importing ? '导入中...' : '📥 导入到编辑器'}
          </button>
        )}
        <button
          className="sw-preview-btn sw-preview-btn--source"
          onClick={() => setShowSource((v) => !v)}
        >
          {showSource ? '收起源码' : '查看源码'}
        </button>
      </div>

      {/* Collapsible source code */}
      {showSource && (
        <pre className="sw-preview-code"><code>{dsl}</code></pre>
      )}
    </div>
  );
}
