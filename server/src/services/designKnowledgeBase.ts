import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import type {
  DesignKnowledgeBase,
  ComponentTemplate,
  InteractionPattern,
  DesignPrinciple,
} from '../types.js';
import { getPage } from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const GLOBAL_DIR = path.join(DATA_DIR, 'global');

function getDesignKnowledgePath(projectId: string): string {
  if (projectId === 'global') {
    return path.join(GLOBAL_DIR, 'design-knowledge.json');
  }
  return path.join(PROJECTS_DIR, projectId, 'design-knowledge.json');
}

function now(): string {
  return new Date().toISOString();
}

function emptyKnowledgeBase(projectId: string): DesignKnowledgeBase {
  return {
    projectId,
    componentTemplates: [],
    interactionPatterns: [],
    designPrinciples: [],
    updatedAt: now(),
  };
}

// ========== Core read / write ==========

export function getDesignKnowledgeBase(projectId: string): DesignKnowledgeBase | null {
  const filePath = getDesignKnowledgePath(projectId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as DesignKnowledgeBase;
  } catch (error) {
    console.error(`Error reading design knowledge base for ${projectId}:`, error);
    return null;
  }
}

export function saveDesignKnowledgeBase(projectId: string, data: DesignKnowledgeBase): void {
  const filePath = getDesignKnowledgePath(projectId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  data.updatedAt = now();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Helper: ensure a knowledge base exists for the project, creating an empty one if needed
function ensureKnowledgeBase(projectId: string): DesignKnowledgeBase {
  const existing = getDesignKnowledgeBase(projectId);
  if (existing) return existing;
  const fresh = emptyKnowledgeBase(projectId);
  saveDesignKnowledgeBase(projectId, fresh);
  return fresh;
}

// ========== Component Template CRUD ==========

export function addComponentTemplate(
  projectId: string,
  template: Omit<ComponentTemplate, 'id' | 'createdAt' | 'updatedAt'>,
): ComponentTemplate {
  const kb = ensureKnowledgeBase(projectId);
  const timestamp = now();
  const entry: ComponentTemplate = {
    ...template,
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  kb.componentTemplates.push(entry);
  saveDesignKnowledgeBase(projectId, kb);
  return entry;
}

export function updateComponentTemplate(
  projectId: string,
  id: string,
  updates: Partial<ComponentTemplate>,
): ComponentTemplate | null {
  const kb = ensureKnowledgeBase(projectId);
  const idx = kb.componentTemplates.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const existing = kb.componentTemplates[idx];
  const updated: ComponentTemplate = { ...existing, ...updates, id: existing.id, createdAt: existing.createdAt, updatedAt: now() };
  kb.componentTemplates[idx] = updated;
  saveDesignKnowledgeBase(projectId, kb);
  return updated;
}

export function deleteComponentTemplate(projectId: string, id: string): boolean {
  const kb = ensureKnowledgeBase(projectId);
  const before = kb.componentTemplates.length;
  kb.componentTemplates = kb.componentTemplates.filter((t) => t.id !== id);
  if (kb.componentTemplates.length === before) return false;
  saveDesignKnowledgeBase(projectId, kb);
  return true;
}

// ========== Interaction Pattern CRUD ==========

export function addInteractionPattern(
  projectId: string,
  pattern: Omit<InteractionPattern, 'id' | 'createdAt' | 'updatedAt'>,
): InteractionPattern {
  const kb = ensureKnowledgeBase(projectId);
  const timestamp = now();
  const entry: InteractionPattern = {
    ...pattern,
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  kb.interactionPatterns.push(entry);
  saveDesignKnowledgeBase(projectId, kb);
  return entry;
}

export function updateInteractionPattern(
  projectId: string,
  id: string,
  updates: Partial<InteractionPattern>,
): InteractionPattern | null {
  const kb = ensureKnowledgeBase(projectId);
  const idx = kb.interactionPatterns.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const existing = kb.interactionPatterns[idx];
  const updated: InteractionPattern = { ...existing, ...updates, id: existing.id, createdAt: existing.createdAt, updatedAt: now() };
  kb.interactionPatterns[idx] = updated;
  saveDesignKnowledgeBase(projectId, kb);
  return updated;
}

export function deleteInteractionPattern(projectId: string, id: string): boolean {
  const kb = ensureKnowledgeBase(projectId);
  const before = kb.interactionPatterns.length;
  kb.interactionPatterns = kb.interactionPatterns.filter((p) => p.id !== id);
  if (kb.interactionPatterns.length === before) return false;
  saveDesignKnowledgeBase(projectId, kb);
  return true;
}

// ========== Design Principle CRUD ==========

export function addDesignPrinciple(
  projectId: string,
  principle: Omit<DesignPrinciple, 'id' | 'createdAt' | 'updatedAt'>,
): DesignPrinciple {
  const kb = ensureKnowledgeBase(projectId);
  const timestamp = now();
  const entry: DesignPrinciple = {
    ...principle,
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  kb.designPrinciples.push(entry);
  saveDesignKnowledgeBase(projectId, kb);
  return entry;
}

export function updateDesignPrinciple(
  projectId: string,
  id: string,
  updates: Partial<DesignPrinciple>,
): DesignPrinciple | null {
  const kb = ensureKnowledgeBase(projectId);
  const idx = kb.designPrinciples.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const existing = kb.designPrinciples[idx];
  const updated: DesignPrinciple = { ...existing, ...updates, id: existing.id, createdAt: existing.createdAt, updatedAt: now() };
  kb.designPrinciples[idx] = updated;
  saveDesignKnowledgeBase(projectId, kb);
  return updated;
}

export function deleteDesignPrinciple(projectId: string, id: string): boolean {
  const kb = ensureKnowledgeBase(projectId);
  const before = kb.designPrinciples.length;
  kb.designPrinciples = kb.designPrinciples.filter((p) => p.id !== id);
  if (kb.designPrinciples.length === before) return false;
  saveDesignKnowledgeBase(projectId, kb);
  return true;
}

// ========== Search ==========

export function searchDesignKnowledge(
  projectId: string,
  query: string,
): {
  componentTemplates: ComponentTemplate[];
  interactionPatterns: InteractionPattern[];
  designPrinciples: DesignPrinciple[];
} {
  const kb = getDesignKnowledgeBase(projectId);
  if (!kb) {
    return { componentTemplates: [], interactionPatterns: [], designPrinciples: [] };
  }

  // Empty query returns everything
  if (!query.trim()) {
    return {
      componentTemplates: kb.componentTemplates,
      interactionPatterns: kb.interactionPatterns,
      designPrinciples: kb.designPrinciples,
    };
  }

  const q = query.toLowerCase();

  return {
    componentTemplates: kb.componentTemplates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    ),
    interactionPatterns: kb.interactionPatterns.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    ),
    designPrinciples: kb.designPrinciples.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    ),
  };
}

// ========== Extract component from captured page ==========

export function extractComponentAsTemplate(
  projectId: string,
  pageId: string,
  nodeId: string,
): ComponentTemplate | null {
  const pageData = getPage(projectId, pageId);
  if (!pageData) return null;

  // Use edited tree if available, otherwise capture tree
  const tree = (pageData.editedTree ?? pageData.captureTree) as Record<string, unknown>;
  const root = (tree.root ?? tree) as Record<string, unknown>;

  // Recursively find the node by id attribute
  function findNode(node: Record<string, unknown>): Record<string, unknown> | null {
    const attrs = node.attributes as Record<string, string> | undefined;
    if (attrs?.id === nodeId) return node;
    // Also check the node's own id field if present
    if ((node as Record<string, unknown>).id === nodeId) return node;

    const children = node.childNodes as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(children)) {
      for (const child of children) {
        const found = findNode(child);
        if (found) return found;
      }
    }
    return null;
  }

  const node = findNode(root);
  if (!node) return null;

  const tag = (node.tag as string) || 'div';
  const attrs = (node.attributes as Record<string, string>) || {};
  const styles = (node.styles as Record<string, string>) || {};

  // Build a simple HTML template from the node
  const styleStr = Object.entries(styles)
    .filter(([, v]) => v && v !== 'initial' && v !== 'none')
    .slice(0, 20)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');

  const classAttr = attrs.class ? ` class="${attrs.class}"` : '';
  const htmlTemplate = `<${tag}${classAttr} style="${styleStr}"></${tag}>`;

  const template = addComponentTemplate(projectId, {
    name: attrs.class?.split(' ')[0] || tag,
    description: `Extracted from page ${pageData.page.name}, node ${nodeId}`,
    applicableScenes: [],
    htmlTemplate,
    previewImagePath: undefined,
  });

  return template;
}

// ========== AI context string ==========

export function toDesignKnowledgeContextString(data: DesignKnowledgeBase): string {
  const lines: string[] = ['# 设计知识库'];

  if (data.componentTemplates.length > 0) {
    lines.push('## 组件模板');
    for (const t of data.componentTemplates) {
      lines.push(`- ${t.name}: ${t.description}`);
      if (t.applicableScenes.length > 0) {
        lines.push(`  适用场景: ${t.applicableScenes.join(', ')}`);
      }
      lines.push(`  HTML: ${t.htmlTemplate.slice(0, 200)}`);
    }
  }

  if (data.interactionPatterns.length > 0) {
    lines.push('## 交互模式');
    for (const p of data.interactionPatterns) {
      lines.push(`- ${p.name}: ${p.description}`);
      lines.push(`  触发条件: ${p.triggerCondition}`);
      lines.push(`  交互流程: ${p.interactionFlow}`);
      if (p.applicableComponents.length > 0) {
        lines.push(`  适用组件: ${p.applicableComponents.join(', ')}`);
      }
    }
  }

  if (data.designPrinciples.length > 0) {
    lines.push('## 设计原则');
    for (const p of data.designPrinciples) {
      lines.push(`- ${p.name}: ${p.description}`);
      for (const rule of p.rules) {
        lines.push(`  - ${rule}`);
      }
    }
  }

  return lines.join('\n');
}
