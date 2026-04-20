/**
 * Interaction Builder — AI 交互构建器
 *
 * 将 AI 的原始文本输出解析/构建为结构化的 InteractionMessage[]。
 * AI 在 prompt 中被指示输出 JSON 格式的交互定义，
 * 本服务负责解析并兜底处理。
 */

import { v4 as uuidv4 } from 'uuid';

// ========== 类型定义（与前端 interaction.ts 共享结构） ==========

export interface InteractionMessage {
  id: string;
  type: 'text' | 'choice' | 'multi-choice' | 'confirm' | 'preview' | 'summary';
  content: string;
  options?: InteractionOption[];
  preview?: PreviewData;
  metadata?: Record<string, unknown>;
}

export interface InteractionOption {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  value: string;
  preview?: PreviewData;
}

export interface PreviewData {
  type: 'wireframe' | 'hifi' | 'code' | 'diff';
  captureTree?: unknown;
  code?: string;
  diff?: DiffItem[];
}

export interface DiffItem {
  nodeId: string;
  action: 'modify' | 'add' | 'delete';
  description: string;
  before?: unknown;
  after?: unknown;
}

// ========== 公开 API ==========

/**
 * 解析 AI 原始输出为 InteractionMessage[]
 *
 * AI 被指示在输出中嵌入 JSON 格式的交互定义。
 * 格式示例：
 * ```json
 * {"type":"choice","content":"按钮放在哪？","options":[{"id":"opt1","label":"独立一行","icon":"📐","value":"newline"},...]}
 * ```
 *
 * 如果 AI 输出中包含 JSON 块，则解析；否则降级为纯文本消息。
 */
export function parseAIResponse(rawContent: string): InteractionMessage[] {
  const messages: InteractionMessage[] = [];

  // 尝试提取 JSON 交互定义
  // 支持两种格式：
  // 1. ```json ... ``` 代码块
  // 2. 行内 JSON 对象
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
  const inlineJsonRegex = /\{"type":"(?:choice|multi-choice|confirm|preview|summary)"[^}]*"options":\s*\[[^\]]*\][^}]*\}/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // 先尝试代码块格式
  const codeBlockMatches: Array<{ start: number; end: number; json: string }> = [];
  while ((match = jsonBlockRegex.exec(rawContent)) !== null) {
    codeBlockMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      json: match[1].trim(),
    });
  }

  if (codeBlockMatches.length > 0) {
    // 有代码块格式，按位置拆分文本和 JSON
    for (const blockMatch of codeBlockMatches) {
      // 代码块前的文本
      const textBefore = rawContent.slice(lastIndex, blockMatch.start).trim();
      if (textBefore) {
        messages.push(buildTextMessage(textBefore));
      }

      // 解析 JSON
      try {
        const parsed = JSON.parse(blockMatch.json);
        messages.push(normalizeInteractionMessage(parsed));
      } catch {
        // JSON 解析失败，作为文本处理
        messages.push(buildTextMessage(blockMatch.json));
      }

      lastIndex = blockMatch.end;
    }

    // 最后一个代码块后的文本
    const textAfter = rawContent.slice(lastIndex).trim();
    if (textAfter) {
      messages.push(buildTextMessage(textAfter));
    }
  } else {
    // 没有代码块，尝试行内 JSON
    let inlineLastIndex = 0;
    while ((match = inlineJsonRegex.exec(rawContent)) !== null) {
      const textBefore = rawContent.slice(inlineLastIndex, match.index).trim();
      if (textBefore) {
        messages.push(buildTextMessage(textBefore));
      }

      try {
        const parsed = JSON.parse(match[0]);
        messages.push(normalizeInteractionMessage(parsed));
      } catch {
        messages.push(buildTextMessage(match[0]));
      }

      inlineLastIndex = match.index + match[0].length;
    }

    const textAfter = rawContent.slice(inlineLastIndex).trim();
    if (textAfter) {
      messages.push(buildTextMessage(textAfter));
    }

    // 如果完全没有 JSON，整体作为文本
    if (messages.length === 0 && rawContent.trim()) {
      messages.push(buildTextMessage(rawContent));
    }
  }

  return messages;
}

/**
 * 构建选择题消息
 */
export function buildChoiceMessages(
  question: string,
  options: Array<{ label: string; value: string; description?: string; icon?: string }>,
  step?: number,
  totalSteps?: number
): InteractionMessage[] {
  return [
    {
      id: uuidv4(),
      type: 'choice',
      content: question,
      options: options.map((opt, i) => ({
        id: `opt_${i}`,
        label: opt.label,
        description: opt.description,
        icon: opt.icon,
        value: opt.value,
      })),
      metadata: {
        step,
        totalSteps,
      },
    },
  ];
}

/**
 * 构建确认消息
 */
export function buildConfirmMessage(
  title: string,
  changes: DiffItem[]
): InteractionMessage {
  return {
    id: uuidv4(),
    type: 'confirm',
    content: title,
    preview: {
      type: 'diff',
      diff: changes,
    },
  };
}

/**
 * 构建汇总消息
 */
export function buildSummaryMessage(
  content: string,
  changes: DiffItem[]
): InteractionMessage {
  return {
    id: uuidv4(),
    type: 'summary',
    content,
    preview: {
      type: 'diff',
      diff: changes,
    },
  };
}

/**
 * 构建预览消息
 */
export function buildPreviewMessage(
  content: string,
  captureTree: unknown,
  previewType: 'wireframe' | 'hifi' | 'code' = 'wireframe'
): InteractionMessage {
  return {
    id: uuidv4(),
    type: 'preview',
    content,
    preview: {
      type: previewType,
      captureTree,
    },
  };
}

/**
 * 构建纯文本消息
 */
export function buildTextMessage(content: string): InteractionMessage {
  return {
    id: uuidv4(),
    type: 'text',
    content,
  };
}

// ========== 内部辅助 ==========

function normalizeInteractionMessage(parsed: any): InteractionMessage {
  return {
    id: parsed.id || uuidv4(),
    type: parsed.type || 'text',
    content: parsed.content || '',
    options: (parsed.options || []).map((opt: any, i: number) => ({
      id: opt.id || `opt_${i}`,
      label: opt.label || opt.text || `选项 ${i + 1}`,
      description: opt.description,
      icon: opt.icon,
      value: opt.value || opt.id || `opt_${i}`,
    })),
    preview: parsed.preview,
    metadata: parsed.metadata,
  };
}
