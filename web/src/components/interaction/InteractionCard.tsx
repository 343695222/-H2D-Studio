/**
 * InteractionCard — 卡片渲染引擎
 *
 * 根据 InteractionMessage.type 渲染不同的 UI 组件：
 * - text     → 简短文字气泡
 * - choice   → 单选卡片列表
 * - multi-choice → 多选卡片列表
 * - confirm  → 确认/取消按钮 + 变更摘要
 * - preview  → 画布实时预览
 * - summary  → 最终方案汇总
 */

import { useState } from 'react';
import type {
  InteractionMessage,
  InteractionOption,
  InteractionResponse,
  DiffItem,
} from '../../types/interaction';
import './InteractionCard.css';

interface InteractionCardProps {
  message: InteractionMessage;
  onRespond: (response: InteractionResponse) => void;
  disabled?: boolean;
}

export function InteractionCard({ message, onRespond, disabled }: InteractionCardProps) {
  switch (message.type) {
    case 'text':
      return <TextCard content={message.content} />;
    case 'choice':
      return (
        <ChoiceCard
          content={message.content}
          options={message.options || []}
          onSelect={(optionId) => onRespond({
            messageId: message.id,
            selectedOptions: [optionId],
          })}
          disabled={disabled}
          metadata={message.metadata}
        />
      );
    case 'multi-choice':
      return (
        <MultiChoiceCard
          content={message.content}
          options={message.options || []}
          onConfirm={(selectedIds) => onRespond({
            messageId: message.id,
            selectedOptions: selectedIds,
          })}
          disabled={disabled}
          metadata={message.metadata}
        />
      );
    case 'confirm':
      return (
        <ConfirmCard
          content={message.content}
          diffs={(message.preview?.diff as DiffItem[]) || []}
          onConfirm={() => onRespond({
            messageId: message.id,
            selectedOptions: ['confirm'],
          })}
          onCancel={() => onRespond({
            messageId: message.id,
            selectedOptions: ['cancel'],
          })}
          onAdjust={() => onRespond({
            messageId: message.id,
            selectedOptions: ['adjust'],
          })}
          disabled={disabled}
        />
      );
    case 'summary':
      return (
        <SummaryCard
          content={message.content}
          diffs={(message.preview?.diff as DiffItem[]) || []}
          onApply={() => onRespond({
            messageId: message.id,
            selectedOptions: ['apply'],
          })}
          onAdjust={() => onRespond({
            messageId: message.id,
            selectedOptions: ['adjust'],
          })}
          onCancel={() => onRespond({
            messageId: message.id,
            selectedOptions: ['cancel'],
          })}
          disabled={disabled}
        />
      );
    case 'preview':
      return (
        <PreviewCard
          content={message.content}
          previewType={message.preview?.type || 'wireframe'}
        />
      );
    default:
      return <TextCard content={message.content} />;
  }
}

// ========== 文字卡片 ==========

function TextCard({ content }: { content: string }) {
  return (
    <div className="interaction-card interaction-text">
      <div className="interaction-text-content">{content}</div>
    </div>
  );
}

// ========== 单选卡片 ==========

function ChoiceCard({
  content,
  options,
  onSelect,
  disabled,
  metadata,
}: {
  content: string;
  options: InteractionOption[];
  onSelect: (optionId: string) => void;
  disabled?: boolean;
  metadata?: { step?: number; totalSteps?: number; [key: string]: unknown };
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (optionId: string) => {
    if (disabled) return;
    setSelectedId(optionId);
    onSelect(optionId);
  };

  return (
    <div className="interaction-card interaction-choice">
      {metadata?.step && metadata?.totalSteps && (
        <div className="interaction-step-indicator">
          第 {metadata.step} 步 / 共 {metadata.totalSteps} 步
        </div>
      )}
      <div className="interaction-question">{content}</div>
      <div className="interaction-options">
        {options.map((option) => (
          <button
            key={option.id}
            className={`interaction-option ${selectedId === option.id ? 'selected' : ''}`}
            onClick={() => handleSelect(option.id)}
            disabled={disabled}
          >
            <span className="option-icon">{option.icon}</span>
            <div className="option-content">
              <div className="option-label">{option.label}</div>
              {option.description && (
                <div className="option-description">{option.description}</div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ========== 多选卡片 ==========

function MultiChoiceCard({
  content,
  options,
  onConfirm,
  disabled,
  metadata,
}: {
  content: string;
  options: InteractionOption[];
  onConfirm: (selectedIds: string[]) => void;
  disabled?: boolean;
  metadata?: { step?: number; totalSteps?: number; [key: string]: unknown };
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleOption = (optionId: string) => {
    if (disabled) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        next.add(optionId);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedIds));
  };

  return (
    <div className="interaction-card interaction-multi-choice">
      {metadata?.step && metadata?.totalSteps && (
        <div className="interaction-step-indicator">
          第 {metadata.step} 步 / 共 {metadata.totalSteps} 步
        </div>
      )}
      <div className="interaction-question">{content}</div>
      <div className="interaction-options">
        {options.map((option) => (
          <button
            key={option.id}
            className={`interaction-option ${selectedIds.has(option.id) ? 'selected' : ''}`}
            onClick={() => toggleOption(option.id)}
            disabled={disabled}
          >
            <span className="option-icon">{option.icon}</span>
            <div className="option-content">
              <div className="option-label">{option.label}</div>
              {option.description && (
                <div className="option-description">{option.description}</div>
              )}
            </div>
            {selectedIds.has(option.id) && (
              <span className="option-check">✓</span>
            )}
          </button>
        ))}
      </div>
      <button
        className="interaction-confirm-btn"
        onClick={handleConfirm}
        disabled={disabled || selectedIds.size === 0}
      >
        确认选择 ({selectedIds.size})
      </button>
    </div>
  );
}

// ========== 确认卡片 ==========

function ConfirmCard({
  content,
  diffs,
  onConfirm,
  onCancel,
  onAdjust,
  disabled,
}: {
  content: string;
  diffs: DiffItem[];
  onConfirm: () => void;
  onCancel: () => void;
  onAdjust: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="interaction-card interaction-confirm">
      <div className="interaction-question">{content}</div>
      {diffs.length > 0 && (
        <div className="interaction-diffs">
          <div className="diffs-title">变更内容：</div>
          {diffs.map((diff, i) => (
            <div key={i} className={`diff-item diff-${diff.action}`}>
              <span className="diff-action">
                {diff.action === 'modify' ? '✏️' : diff.action === 'add' ? '➕' : '🗑️'}
              </span>
              <span className="diff-description">{diff.description}</span>
            </div>
          ))}
        </div>
      )}
      <div className="interaction-actions">
        <button className="action-btn action-adjust" onClick={onAdjust} disabled={disabled}>
          再调整
        </button>
        <button className="action-btn action-cancel" onClick={onCancel} disabled={disabled}>
          取消
        </button>
        <button className="action-btn action-confirm" onClick={onConfirm} disabled={disabled}>
          ✓ 确认
        </button>
      </div>
    </div>
  );
}

// ========== 汇总卡片 ==========

function SummaryCard({
  content,
  diffs,
  onApply,
  onAdjust,
  onCancel,
  disabled,
}: {
  content: string;
  diffs: DiffItem[];
  onApply: () => void;
  onAdjust: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="interaction-card interaction-summary">
      <div className="summary-header">✅ 设计方案已生成</div>
      <div className="summary-content">{content}</div>
      {diffs.length > 0 && (
        <div className="interaction-diffs">
          <div className="diffs-title">修改内容：</div>
          {diffs.map((diff, i) => (
            <div key={i} className={`diff-item diff-${diff.action}`}>
              <span className="diff-action">
                {diff.action === 'modify' ? '✏️' : diff.action === 'add' ? '➕' : '🗑️'}
              </span>
              <span className="diff-description">{diff.description}</span>
            </div>
          ))}
        </div>
      )}
      <div className="interaction-actions">
        <button className="action-btn action-cancel" onClick={onCancel} disabled={disabled}>
          取消
        </button>
        <button className="action-btn action-adjust" onClick={onAdjust} disabled={disabled}>
          再调整
        </button>
        <button className="action-btn action-apply" onClick={onApply} disabled={disabled}>
          ✓ 应用
        </button>
      </div>
    </div>
  );
}

// ========== 预览卡片 ==========

function PreviewCard({
  content,
  previewType,
}: {
  content: string;
  previewType: string;
}) {
  const typeLabel: Record<string, string> = {
    wireframe: '📐 线框预览',
    hifi: '🎨 高保真预览',
    code: '💻 代码预览',
    diff: '📊 变更对比',
  };

  return (
    <div className="interaction-card interaction-preview">
      <div className="preview-header">
        {typeLabel[previewType] || '预览'}
      </div>
      <div className="preview-content">{content}</div>
    </div>
  );
}
