import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Skill } from '../types.js';
import { getCurrentTimestamp } from '../utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SKILLS_DIR = path.join(DATA_DIR, 'skills');

// 内置 skill 模板内容
const BUILTIN_SKILLS: Record<string, string> = {
  'default-prd': `# PRD 生成技能

## 角色设定
你是一个专业的产品经理，擅长编写PRD(产品需求文档)。
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
\`\`\`

## 风格约束
生成内容必须遵循项目原有的视觉风格，保持设计一致性。`,

  'quick-summary': `# 快速需求摘要技能

## 角色设定
你是一个高效的产品分析师，擅长快速提炼核心需求。

## 输出格式要求
生成简洁的需求摘要，包含:
1. 核心需求一句话总结
2. 关键修改点列表（最多5条）
3. 影响范围说明
4. 优先级建议

## 风格约束
- 简明扼要，避免冗长描述
- 使用 bullet points 组织内容
- 突出最重要的修改项`,

  'detailed-spec': `# 详细技术规格说明技能

## 角色设定
你是一个资深的技术产品经理，擅长编写详细的技术规格文档。

## 输出格式要求
请输出详细的技术规格文档，包含:
1. 需求背景与目标
2. 功能规格详细说明
3. 数据模型变更
4. API 接口变更（如适用）
5. 页面结构修改详情
6. 样式规范要求
7. 交互行为详细说明
8. 性能要求
9. 兼容性考虑
10. 测试要点

## 页面修改标注格式
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
\`\`\`

## 风格约束
- 每个功能点都要有明确的验收标准
- 包含具体的数值指标（如响应时间、尺寸等）
- 考虑边界情况和异常处理`,
};

// 确保 skills 目录存在
export function ensureSkillsDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

// 初始化内置 skills
export function initBuiltinSkills(): void {
  ensureSkillsDir();
  
  for (const [name, content] of Object.entries(BUILTIN_SKILLS)) {
    const skillPath = path.join(SKILLS_DIR, `${name}.md`);
    if (!fs.existsSync(skillPath)) {
      const timestamp = getCurrentTimestamp();
      const skill: Skill = {
        name,
        title: extractTitle(content),
        description: extractDescription(content),
        content,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      saveSkillFile(skill);
    }
  }
}

// 从 markdown 内容提取标题
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Untitled Skill';
}

// 从 markdown 内容提取描述
function extractDescription(content: string): string | undefined {
  // 尝试提取 ## 角色设定 或第一段文字
  const roleMatch = content.match(/##\s+角色设定\s*\n+([^\n#]+)/);
  if (roleMatch) {
    return roleMatch[1].trim().slice(0, 200);
  }
  
  // 尝试提取第一段非空文本
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      return trimmed.slice(0, 200);
    }
  }
  
  return undefined;
}

// 获取 skill 文件路径
function getSkillPath(name: string): string {
  // 确保文件名安全（移除路径分隔符等）
  const safeName = name.replace(/[\\/:*?"<>|]/g, '_');
  return path.join(SKILLS_DIR, `${safeName}.md`);
}

// 保存 skill 文件
function saveSkillFile(skill: Skill): void {
  const skillPath = getSkillPath(skill.name);
  const data = {
    name: skill.name,
    title: skill.title,
    description: skill.description,
    content: skill.content,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  };
  fs.writeFileSync(skillPath, JSON.stringify(data, null, 2), 'utf-8');
}

// 获取所有 skills
export function getAllSkills(): Skill[] {
  ensureSkillsDir();
  
  const files = fs.readdirSync(SKILLS_DIR);
  const skills: Skill[] = [];
  
  for (const file of files) {
    if (file.endsWith('.md')) {
      const name = file.slice(0, -3); // 移除 .md 后缀
      const skill = getSkill(name);
      if (skill) {
        skills.push(skill);
      }
    }
  }
  
  // 按名称排序
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

// 获取单个 skill
export function getSkill(name: string): Skill | null {
  const skillPath = getSkillPath(name);
  
  if (!fs.existsSync(skillPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(skillPath, 'utf-8');
    const data = JSON.parse(content) as Skill;
    return data;
  } catch (error) {
    console.error(`Error reading skill ${name}:`, error);
    return null;
  }
}

// 获取 skill 内容（纯 markdown，用于 AI prompt）
export function getSkillContent(name: string): string | null {
  const skill = getSkill(name);
  return skill?.content || null;
}

// 创建 skill
export function createSkill(
  name: string,
  content: string,
  title?: string,
  description?: string
): Skill | null {
  // 检查是否已存在
  if (getSkill(name)) {
    return null;
  }
  
  const timestamp = getCurrentTimestamp();
  const skill: Skill = {
    name,
    title: title || extractTitle(content),
    description: description || extractDescription(content),
    content,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  
  saveSkillFile(skill);
  return skill;
}

// 更新 skill
export function updateSkill(
  name: string,
  updates: Partial<Pick<Skill, 'content' | 'title' | 'description'>>
): Skill | null {
  const skill = getSkill(name);
  if (!skill) {
    return null;
  }
  
  if (updates.content !== undefined) {
    skill.content = updates.content;
    // 如果内容变了，自动更新标题和描述（除非显式提供）
    if (updates.title === undefined) {
      skill.title = extractTitle(updates.content);
    }
    if (updates.description === undefined) {
      skill.description = extractDescription(updates.content);
    }
  }
  
  if (updates.title !== undefined) {
    skill.title = updates.title;
  }
  
  if (updates.description !== undefined) {
    skill.description = updates.description;
  }
  
  skill.updatedAt = getCurrentTimestamp();
  saveSkillFile(skill);
  return skill;
}

// 删除 skill
export function deleteSkill(name: string): boolean {
  const skillPath = getSkillPath(name);
  
  if (!fs.existsSync(skillPath)) {
    return false;
  }
  
  try {
    fs.unlinkSync(skillPath);
    return true;
  } catch (error) {
    console.error(`Error deleting skill ${name}:`, error);
    return false;
  }
}

// 检查 skill 是否存在
export function skillExists(name: string): boolean {
  return fs.existsSync(getSkillPath(name));
}

// 从 markdown 内容创建或更新 skill（用于批量导入）
export function importSkillFromContent(
  name: string,
  content: string,
  metadata?: { title?: string; description?: string }
): { skill: Skill; action: 'created' | 'updated' } {
  const exists = skillExists(name);
  const timestamp = getCurrentTimestamp();
  
  const skill: Skill = {
    name,
    title: metadata?.title || extractTitle(content),
    description: metadata?.description || extractDescription(content),
    content,
    createdAt: exists ? (getSkill(name)?.createdAt || timestamp) : timestamp,
    updatedAt: timestamp,
  };
  
  saveSkillFile(skill);
  return { skill, action: exists ? 'updated' : 'created' };
}

// 获取所有 skill 内容用于导出
export function getAllSkillsForExport(): Skill[] {
  return getAllSkills();
}
