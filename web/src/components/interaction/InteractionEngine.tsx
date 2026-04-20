/**
 * InteractionEngine — 交互引擎
 *
 * 管理多步交互流程的状态（第1步/共3步），
 * 处理用户选择，调用回调通知父组件。
 */

import { useState, useCallback, useRef } from 'react';
import type {
  InteractionMessage,
  InteractionResponse,
  InteractionStage,
} from '../../types/interaction';
import { InteractionCard } from './InteractionCard';
import './InteractionEngine.css';

interface InteractionEngineProps {
  /** 初始消息列表 */
  messages: InteractionMessage[];
  /** 当前阶段 */
  stage: InteractionStage;
  /** 当前步骤 */
  currentStep: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 用户回复回调 */
  onRespond: (response: InteractionResponse) => void;
  /** 是否正在加载 */
  loading?: boolean;
  /** 自定义文字输入回调 */
  onTextSubmit?: (text: string) => void;
  /** 文字输入占位符 */
  textPlaceholder?: string;
}

export function InteractionEngine({
  messages,
  stage,
  currentStep,
  totalSteps,
  onRespond,
  loading = false,
  onTextSubmit,
  textPlaceholder = '输入你的需求...',
}: InteractionEngineProps) {
  const [textInput, setTextInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const handleTextSubmit = () => {
    const text = textInput.trim();
    if (!text || !onTextSubmit) return;
    onTextSubmit(text);
    setTextInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit();
    }
  };

  // 阶段标签映射
  const stageLabels: Record<string, string> = {
    discovery: '需求发现',
    clarifying: '需求澄清',
    requirement: '需求分析',
    prd: 'PRD 文档',
    designPrinciples: '设计原则',
    wireframe: '线框生成',
    hifi: '高保真设计',
    codeExport: '代码导出',
    done: '完成',
  };

  return (
    <div className="interaction-engine">
      {/* 阶段进度条 */}
      <div className="interaction-stage-bar">
        <div className="stage-label">{stageLabels[stage] || stage}</div>
        {totalSteps > 0 && (
          <div className="step-progress">
            <div className="step-bar">
              <div
                className="step-fill"
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              />
            </div>
            <span className="step-text">
              {currentStep} / {totalSteps}
            </span>
          </div>
        )}
      </div>

      {/* 消息列表 */}
      <div className="interaction-messages">
        {messages.map((msg) => (
          <div key={msg.id} className="interaction-message-wrapper">
            <InteractionCard
              message={msg}
              onRespond={(response) => {
                onRespond(response);
                scrollToBottom();
              }}
              disabled={loading}
            />
          </div>
        ))}

        {loading && (
          <div className="interaction-loading">
            <div className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="loading-text">AI 正在思考...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 文字输入区 */}
      {onTextSubmit && (
        <div className="interaction-input-area">
          <input
            type="text"
            className="interaction-text-input"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={textPlaceholder}
            disabled={loading}
          />
          <button
            className="interaction-send-btn"
            onClick={handleTextSubmit}
            disabled={loading || !textInput.trim()}
          >
            发送
          </button>
        </div>
      )}
    </div>
  );
}
