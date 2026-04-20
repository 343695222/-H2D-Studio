/**
 * CanvasRenderer — renders the CaptureTree DOM content.
 * Pure rendering, no interaction logic.
 */
import React from 'react';
import type { SnapshotNode, ElementSnapshot, TextSnapshot } from '../../../types/capture.ts';

export const CaptureNodeRenderer = React.memo(({ node }: { node: SnapshotNode }) => {
  if (node.nodeType === 3) {
    const t = node as TextSnapshot;
    if (!t.text || !t.text.trim()) return null;
    return <>{t.text}</>;
  }

  const el = node as ElementSnapshot;
  const style: React.CSSProperties = { ...(el.styles as React.CSSProperties) };

  if (style.position === 'fixed') style.position = 'absolute';
  for (const prop of ['overflow', 'overflowX', 'overflowY'] as const) {
    const v = style[prop];
    if (v === 'scroll' || v === 'auto' || v === 'hidden') (style as Record<string, unknown>)[prop] = 'visible';
  }

  if (el.content && el.tag === 'SVG') {
    return <div style={style} dangerouslySetInnerHTML={{ __html: el.content }} />;
  }
  if (el.tag === 'IMG' && el.attributes?.src) {
    return <img style={style} src={el.attributes.src} alt={el.attributes.alt || ''} draggable={false} />;
  }

  return (
    <div style={style}>
      {el.childNodes?.map((child, i) => (
        <CaptureNodeRenderer key={child.id || i} node={child} />
      ))}
    </div>
  );
});

CaptureNodeRenderer.displayName = 'CaptureNodeRenderer';
