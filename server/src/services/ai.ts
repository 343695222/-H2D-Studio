import type {
  AIConfig,
  ChatMessage,
  ProjectContext,
  PRDResult,
  PageModification,
  Modification,
  ModificationPlan,
  StyleContext,
  PageKnowledgeSummary,
} from '../types.js';
import { getSkillContent } from './skillStorage.js';

/**
 * AI Service - Handles communication with AI providers
 * Supports: OpenAI, Claude, Zhipu (智谱), Ollama
 */

class AIService {
  private config: AIConfig;

  constructor() {
    // 从 process.env 读取配置
    this.config = {
      provider: process.env.AI_PROVIDER || 'openai',
      apiKey: process.env.AI_API_KEY || '',
      baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.AI_MODEL || 'gpt-4o',
    };
  }

  // 刷新配置(设置页更新后调用)
  reloadConfig(): void {
    this.config = {
      provider: process.env.AI_PROVIDER || 'openai',
      apiKey: process.env.AI_API_KEY || '',
      baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.AI_MODEL || 'gpt-4o',
    };
  }

  // 获取当前配置
  getConfig(): AIConfig {
    this.reloadConfig();
    return { ...this.config };
  }

  // 通用聊天接口 — 适配不同provider
  async chat(messages: ChatMessage[]): Promise<string> {
    // Always read latest config from env (singleton may be created before dotenv loads)
    this.reloadConfig();
    const { provider, apiKey, baseUrl, model } = this.config;

    if (!apiKey && provider !== 'ollama') {
      throw new Error('AI API Key not configured');
    }

    switch (provider) {
      case 'claude':
        return this.chatClaude(messages, apiKey, baseUrl, model);
      case 'ollama':
        return this.chatOllama(messages, baseUrl, model);
      case 'openai':
      case 'zhipu':
      default:
        return this.chatOpenAICompatible(messages, apiKey, baseUrl, model);
    }
  }

  // OpenAI / Zhipu 兼容格式
  private async chatOpenAICompatible(
    messages: ChatMessage[],
    apiKey: string,
    baseUrl: string,
    model: string
  ): Promise<string> {
    const url = `${baseUrl}/chat/completions`;
    const isDeepSeekReasoner = model.includes('deepseek-reasoner') || model.includes('deepseek-r1');
    
    // DeepSeek Reasoner 不支持 system message，需要合并到 user message
    let processedMessages = messages;
    if (isDeepSeekReasoner) {
      const systemMsgs = messages.filter(m => m.role === 'system');
      const nonSystemMsgs = messages.filter(m => m.role !== 'system');
      if (systemMsgs.length > 0) {
        const systemContent = systemMsgs.map(m => m.content).join('\n');
        // Prepend system content to first user message
        if (nonSystemMsgs.length > 0 && nonSystemMsgs[0].role === 'user') {
          nonSystemMsgs[0] = {
            role: 'user',
            content: `[System Instructions]\n${systemContent}\n\n[User Request]\n${nonSystemMsgs[0].content}`,
          };
        } else {
          nonSystemMsgs.unshift({ role: 'user', content: systemContent });
        }
        processedMessages = nonSystemMsgs;
      }
    }
    
    // Build request body - DeepSeek Reasoner doesn't support temperature
    const requestBody: Record<string, unknown> = {
      model,
      messages: processedMessages,
    };
    if (!isDeepSeekReasoner) {
      requestBody.temperature = 0.7;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      error?: { message?: string };
    };

    if (data.error) {
      throw new Error(`AI API error: ${data.error.message || 'Unknown error'}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('AI API returned empty response');
    }

    return content;
  }

  // Claude API 格式
  private async chatClaude(
    messages: ChatMessage[],
    apiKey: string,
    baseUrl: string,
    model: string
  ): Promise<string> {
    const url = `${baseUrl}/messages`;
    
    // 分离 system message 和对话消息
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        system: systemMessage,
        messages: conversationMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
      error?: { message?: string };
    };

    if (data.error) {
      throw new Error(`Claude API error: ${data.error.message || 'Unknown error'}`);
    }

    const content = data.content?.[0]?.text;
    if (!content) {
      throw new Error('Claude API returned empty response');
    }

    return content;
  }

  // Ollama API 格式
  private async chatOllama(
    messages: ChatMessage[],
    baseUrl: string,
    model: string
  ): Promise<string> {
    const url = `${baseUrl}/api/chat`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      message?: { content?: string };
      error?: string;
    };

    if (data.error) {
      throw new Error(`Ollama API error: ${data.error}`);
    }

    const content = data.message?.content;
    if (!content) {
      throw new Error('Ollama API returned empty response');
    }

    return content;
  }

  // 测试连接
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      this.reloadConfig();
      const { provider, apiKey, model } = this.config;

      if (!apiKey && provider !== 'ollama') {
        return {
          success: false,
          message: `AI API Key not configured for ${provider}`,
        };
      }

      // 发送简单测试请求
      const testMessages: ChatMessage[] = [
        { role: 'user', content: 'Say "Connection test successful" and nothing else.' },
      ];

      const result = await this.chat(testMessages);

      if (result.toLowerCase().includes('test successful') || result.length > 0) {
        return {
          success: true,
          message: `Successfully connected to ${provider} using model ${model}`,
        };
      }

      return {
        success: false,
        message: 'Unexpected response from AI API',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Connection test failed: ${errorMessage}`,
      };
    }
  }

  // 生成PRD文档
  async generatePRD(
    projectContext: ProjectContext,
    requirement: string,
    skillName?: string
  ): Promise<PRDResult> {
    // 获取 skill 内容，如果没有指定则使用默认 skill
    const skillContent = skillName ? getSkillContent(skillName) : null;
    
    const systemPrompt = skillContent || `你是一个专业的产品经理，擅长编写PRD(产品需求文档)。
用户会提供一个现有网站的页面结构和内容摘要，以及他们的修改需求。
请根据这些信息生成一份完整的PRD文档。

## 输出格式要求
请输出Markdown格式的PRD文档，包含以下章节:
1. 需求概述
2. 功能需求列表
3. 页面修改清单（标注具体需要修改哪些页面的哪些区域）
4. 交互说明
5. 非功能性需求

## 页面修改清单格式
对于每个需要修改的页面，请使用如下JSON格式标注:
\`\`\`json
{
  "pageModifications": [
    {
      "pageId": "页面ID",
      "pageName": "页面名称",
      "modifications": [
        {
          "targetArea": "目标区域描述",
          "action": "modify|add|delete|move",
          "description": "具体修改内容",
          "details": {
            "textChanges": [...],
            "styleChanges": [...],
            "structureChanges": [...]
          }
        }
      ]
    }
  ]
}
\`\`\``;

    const userPrompt = `## 项目现有页面信息
${this.formatProjectContext(projectContext)}

## 用户需求
${requirement}

请生成PRD文档，并在"页面修改清单"中明确标注需要修改的页面和区域。`;

    const result = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return {
      markdown: result,
      // 尝试从结果中提取修改计划JSON
      modifications: this.extractModifications(result),
    };
  }

  // 分析修改计划
  async analyzeModifications(
    prd: string,
    pages: PageKnowledgeSummary[]
  ): Promise<ModificationPlan> {
    const systemPrompt = `你是一个专业的网页开发分析师，擅长将PRD文档转换为具体的页面修改计划。
请分析PRD文档，提取所有需要修改的页面和具体的修改项。

输出必须是有效的JSON格式:
\`\`\`json
{
  "pages": [
    {
      "pageId": "页面ID",
      "pageName": "页面名称",
      "modifications": [
        {
          "targetArea": "目标区域描述",
          "action": "modify|add|delete|move",
          "description": "具体修改内容",
          "details": { ... }
        }
      ]
    }
  ],
  "summary": "修改计划摘要"
}
\`\`\``;

    const pagesInfo = pages
      .map(
        (p, index) => `
页面 ${index + 1}:
- ID: ${p.documentTitle || 'unknown'}
- 标题: ${p.documentTitle || '未命名'}
- 主要组件: ${p.topComponents?.map((c) => c.tag).join(', ') || '无'}
- 布局类型: ${p.layoutType || 'unknown'}
- 文本内容摘要: ${p.visibleText?.slice(0, 200) || '无'}...`
      )
      .join('\n');

    const userPrompt = `## PRD文档
${prd}

## 现有页面列表
${pagesInfo}

请分析PRD并输出详细的修改计划JSON。`;

    const result = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // 尝试提取JSON
    const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const plan = JSON.parse(jsonMatch[1]) as ModificationPlan;
        return plan;
      } catch {
        // JSON解析失败，返回空计划
      }
    }

    // 尝试直接解析整个结果
    try {
      const plan = JSON.parse(result) as ModificationPlan;
      return plan;
    } catch {
      // 返回基于文本的计划
      return {
        pages: [],
        summary: '无法解析AI返回的修改计划',
      };
    }
  }

  // 生成修改后的组件结构
  async generateModifiedStructure(
    captureTree: unknown, // 原始CaptureTree
    modifications: Modification[],
    styleContext: StyleContext // 项目风格约束
  ): Promise<unknown> {
    const systemPrompt = `你是一个专业的网页结构编辑器。根据提供的原始页面结构、修改指令和风格约束，生成修改后的页面结构。

你需要:
1. 保持原有结构的整体框架
2. 按照修改指令进行精确修改
3. 遵循风格约束保持设计一致性
4. 返回有效的JSON格式，与原始CaptureTree格式一致

只输出JSON，不要包含任何解释文字。`;

    // 精简CaptureTree，只保留必要信息
    const simplifiedTree = this.simplifyCaptureTree(captureTree);

    const userPrompt = `## 风格约束
- 主色调: ${styleContext.primaryColors.join(', ') || '保持原样'}
- 字体: ${styleContext.fonts.join(', ') || '保持原样'}
- 圆角: ${styleContext.borderRadius || '保持原样'}
- 间距: ${styleContext.spacing || '保持原样'}

## 修改指令
${JSON.stringify(modifications, null, 2)}

## 原始页面结构
${JSON.stringify(simplifiedTree, null, 2)}

请生成修改后的页面结构JSON。`;

    const result = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // 尝试提取JSON
    const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // 继续尝试直接解析
      }
    }

    // 尝试直接解析
    try {
      return JSON.parse(result);
    } catch {
      // 返回原始树结构
      return captureTree;
    }
  }

  // 格式化项目上下文(将知识库摘要组装为AI可理解的文本)
  private formatProjectContext(context: ProjectContext): string {
    const lines: string[] = [];
    
    lines.push(`项目名称: ${context.projectName}`);
    lines.push(`项目描述: ${context.projectDescription || '无'}`);
    lines.push(`页面数量: ${context.pages.length}`);
    lines.push('');

    context.pages.forEach((page, index) => {
      lines.push(`### 页面 ${index + 1}: ${page.documentTitle || '未命名'}`);
      lines.push(`- 布局类型: ${page.layoutType || 'unknown'}`);
      lines.push(`- 主要组件: ${page.topComponents?.map((c) => c.tag).join(', ') || '无'}`);
      lines.push(`- 主色调: ${page.mainStyles?.primaryColors?.join(', ') || '未检测'}`);
      lines.push(`- 字体: ${page.mainStyles?.fontFamilies?.join(', ') || '系统默认'}`);
      lines.push(`- 文本内容摘要: ${page.visibleText?.slice(0, 300) || '无'}...`);
      lines.push('');
    });

    return lines.join('\n');
  }

  // 从PRD文本中提取修改计划JSON
  private extractModifications(markdown: string): PageModification[] | null {
    // 正则匹配 ```json ... ``` 中的修改计划
    const jsonRegex = /```json\s*([\s\S]*?)\s*```/g;
    let match;
    
    while ((match = jsonRegex.exec(markdown)) !== null) {
      try {
        const json = JSON.parse(match[1]) as { pageModifications?: PageModification[] };
        if (json.pageModifications && Array.isArray(json.pageModifications)) {
          return json.pageModifications;
        }
      } catch {
        // 继续尝试下一个匹配
      }
    }

    return null;
  }

  // 精简CaptureTree，只保留必要信息以减少token消耗
  private simplifyCaptureTree(tree: unknown): unknown {
    if (!tree || typeof tree !== 'object') {
      return tree;
    }

    const node = tree as Record<string, unknown>;
    const simplified: Record<string, unknown> = {};

    // 保留关键字段
    const keepFields = ['tag', 'id', 'className', 'style', 'type', 'content', 'attributes'];
    for (const field of keepFields) {
      if (node[field] !== undefined) {
        simplified[field] = node[field];
      }
    }

    // 递归处理children，但限制深度和数量
    if (node.children && Array.isArray(node.children)) {
      const children = node.children as unknown[];
      // 只保留前20个子元素
      simplified.children = children.slice(0, 20).map((child) => this.simplifyCaptureTree(child));
    }

    return simplified;
  }

  // 提取项目风格约束
  async extractStyleContext(pageSummaries: PageKnowledgeSummary[]): Promise<StyleContext> {
    const allColors: string[] = [];
    const allFonts: string[] = [];
    const allSpacing: number[] = [];

    for (const summary of pageSummaries) {
      if (summary.mainStyles?.primaryColors) {
        allColors.push(...summary.mainStyles.primaryColors);
      }
      if (summary.mainStyles?.fontFamilies) {
        allFonts.push(...summary.mainStyles.fontFamilies);
      }
      if (summary.mainStyles?.spacingRange) {
        allSpacing.push(summary.mainStyles.spacingRange.min, summary.mainStyles.spacingRange.max);
      }
    }

    // 去重并取最常见的
    const uniqueColors = [...new Set(allColors)].slice(0, 5);
    const uniqueFonts = [...new Set(allFonts)].slice(0, 3);
    
    // 计算平均间距
    const avgSpacing = allSpacing.length > 0
      ? Math.round(allSpacing.reduce((a, b) => a + b, 0) / allSpacing.length)
      : 16;

    return {
      primaryColors: uniqueColors,
      fonts: uniqueFonts,
      borderRadius: '4px', // 默认
      spacing: `${avgSpacing}px`,
    };
  }
}

// 导出单例
export const aiService = new AIService();

// 为了向后兼容，保留createAIService函数
export function createAIService(): AIService {
  return aiService;
}
