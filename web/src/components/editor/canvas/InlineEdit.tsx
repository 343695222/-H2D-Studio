/**
 * InlineEdit — text editing overlay for double-clicked text nodes.
 */
import React, { useRef, useEffect } from 'react';

export interface InlineEditState {
  visible: boolean;
  nodeId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

interface Props {
  state: InlineEditState;
  onSave: (text: string) => void;
  onCancel: () => void;
}

export function InlineEdit({ state, onSave, onCancel }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) { ref.current.focus(); ref.current.select(); }
  }, []);

  if (!state.visible) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(ref.current?.value || ''); }
    else if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="inline-edit-overlay" style={{ position: 'absolute', left: state.x, top: state.y, width: state.width, height: state.height }}>
      <textarea
        ref={ref}
        className="inline-edit-textarea"
        defaultValue={state.text}
        onKeyDown={handleKeyDown}
        onBlur={() => onSave(ref.current?.value || '')}
        style={{ width: '100%', height: '100%', resize: 'none' }}
      />
    </div>
  );
}
