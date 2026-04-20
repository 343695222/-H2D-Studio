/**
 * ContentLayer — renders the CaptureTree as actual DOM elements.
 * This is the "what you see" layer, pointer-events disabled.
 */
import React from 'react';
import type { SnapshotNode, ElementSnapshot, TextSnapshot } from '../../../types/capture.ts';

/** Recursive node renderer */
const CaptureNodeRenderer = React.memo(function CaptureNodeRenderer({ node }: { node: SnapshotNode }) {
  if (node.nodeType === 3) {
    const t = node as TextSnapshot;
    if (!t.text || !t.text.trim()) return null;
    return <>{t.text}</>;
  }

  const el = node as ElementSnapshot;
  const style: React.CSSProperties = { ...(el.styles as React.CSSProperties) };

  // fixed → absolute inside transformed container
  if (style.position === 'fixed') style.position = 'absolute';
  // expand scroll containers so all content is visible in editor
  if (style.overflow === 'scroll' || style.overflow === 'auto' || style.overflow === 'hidden') style.overflow = 'visible';
  if (style.overflowX === 'scroll' || style.overflowX === 'auto' || style.overflowX === 'hidden') style.overflowX = 'visible';
  if (style.overflowY === 'scroll' || style.overflowY === 'auto' || style.overflowY === 'hidden') style.overflowY = 'visible';

  // SVG content
  if (el.content && el.tag === 'SVG') {
    return <div style={style} dangerouslySetInnerHTML={{ __html: el.content }} />;
  }

  // IMG
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

interface Props {
  root: ElementSnapshot;
}

export const ContentLayer = React.memo(function ContentLayer({ root }: Props) {
  if (!root || !root.rect) return null;
  return (
    <div
      className="capture-content-layer"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: root.rect.cssWidth || root.rect.width,
        height: root.rect.cssHeight || root.rect.height,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <CaptureNodeRenderer node={root} />
    </div>
  );
});
