/**
 * useViewport — manages zoom, pan, and coordinate transforms.
 * Borrowed from OpenPencil's useCanvas() pattern: separate viewport
 * state from scene state so the rendering layer stays clean.
 */
import { useCallback, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore.ts';

export function useViewport() {
  const { zoom, panX, panY, setZoom, setPan } = useEditorStore();
  const containerRef = useRef<HTMLDivElement>(null);

  /** Convert screen (mouse) coordinates → canvas (scene) coordinates */
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      const el = containerRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return {
        x: (screenX - rect.left - panX) / zoom,
        y: (screenY - rect.top - panY) / zoom,
      };
    },
    [zoom, panX, panY],
  );

  /** Zoom towards a screen point (keeps that point stationary) */
  const zoomAtPoint = useCallback(
    (screenX: number, screenY: number, delta: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = screenX - rect.left;
      const my = screenY - rect.top;
      const canvasX = (mx - panX) / zoom;
      const canvasY = (my - panY) / zoom;
      const factor = delta > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(4, zoom * factor));
      setZoom(newZoom);
      setPan(mx - canvasX * newZoom, my - canvasY * newZoom);
    },
    [zoom, panX, panY, setZoom, setPan],
  );

  /** Fit the given content rect into the container */
  const fitToScreen = useCallback(
    (contentWidth: number, contentHeight: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scaleX = rect.width / contentWidth;
      const scaleY = rect.height / contentHeight;
      const newZoom = Math.min(scaleX, scaleY, 1);
      setZoom(newZoom);
      setPan(
        (rect.width - contentWidth * newZoom) / 2,
        (rect.height - contentHeight * newZoom) / 2,
      );
    },
    [setZoom, setPan],
  );

  return { containerRef, screenToCanvas, zoomAtPoint, fitToScreen, zoom, panX, panY };
}
