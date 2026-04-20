/**
 * Pattern Recognizer — 组件/布局模式识别器
 *
 * 使用规则引擎从 CaptureTree 中识别组件模式和布局模式。
 * 规则基于 HTML 标签、CSS 样式、子元素结构等特征。
 */

import type { ComponentPattern, LayoutPattern } from '../types.js';

// ========== 内部辅助类型 ==========

interface ElementNode {
  nodeType: 1;
  id?: string;
  tag: string;
  styles?: Record<string, string>;
  attributes?: Record<string, string>;
  rect?: { x: number; y: number; width: number; height: number; cssWidth?: number; cssHeight?: number };
  childNodes?: TreeNode[];
}

interface TextNode {
  nodeType: 3;
  text?: string;
}

type TreeNode = ElementNode | TextNode;

interface CaptureTree {
  root: ElementNode;
}

// ========== 组件识别规则 ==========

interface ComponentRule {
  name: string;
  description: string;
  match: (node: ElementNode) => boolean;
  typicalTag: string;
  childCountRange: { min: number; max: number };
}

const COMPONENT_RULES: ComponentRule[] = [
  {
    name: 'navbar',
    description: '导航栏 — 顶部水平导航，包含 logo 和导航链接',
    match: (node) => {
      const tag = node.tag.toLowerCase();
      const styles = node.styles || {};
      const attrs = node.attributes || {};
      // nav 标签
      if (tag === 'nav') return true;
      // header 标签且在顶部
      if (tag === 'header') return true;
      // 带 nav/header/navbar role
      if (attrs.role === 'navigation' || attrs.role === 'banner') return true;
      // 固定在顶部的元素
      if (styles.position === 'fixed' || styles.position === 'sticky') {
        const top = parseInt(styles.top || '999');
        if (top === 0) return true;
      }
      // 含有导航类名
      const cls = attrs.class || '';
      if (/nav|header|toolbar|topbar/i.test(cls)) return true;
      return false;
    },
    typicalTag: 'nav',
    childCountRange: { min: 1, max: 10 },
  },
  {
    name: 'card',
    description: '卡片 — 包含标题、内容和操作的区域容器',
    match: (node) => {
      const tag = node.tag.toLowerCase();
      const attrs = node.attributes || {};
      const styles = node.styles || {};
      const cls = attrs.class || '';
      // 带 card 类名
      if (/card/i.test(cls)) return true;
      // 有圆角、阴影、背景色的容器
      const hasRadius = styles.borderRadius && styles.borderRadius !== '0px';
      const hasShadow = styles.boxShadow && styles.boxShadow !== 'none';
      const hasBg = styles.backgroundColor && styles.backgroundColor !== 'transparent' && styles.backgroundColor !== 'rgba(0, 0, 0, 0)';
      const hasPadding = styles.padding && styles.padding !== '0px';
      // 至少满足 3 个视觉特征
      const features = [hasRadius, hasShadow, hasBg, hasPadding].filter(Boolean).length;
      if (features >= 3 && tag === 'div') return true;
      // article 标签
      if (tag === 'article') return true;
      return false;
    },
    typicalTag: 'div',
    childCountRange: { min: 1, max: 20 },
  },
  {
    name: 'table',
    description: '表格 — 数据表格，包含行列结构',
    match: (node) => {
      const tag = node.tag.toLowerCase();
      return tag === 'table';
    },
    typicalTag: 'table',
    childCountRange: { min: 1, max: 50 },
  },
  {
    name: 'form',
    description: '表单 — 包含输入控件和提交按钮的容器',
    match: (node) => {
      const tag = node.tag.toLowerCase();
      const attrs = node.attributes || {};
      if (tag === 'form') return true;
      // 带 form role
      if (attrs.role === 'form' || attrs.role === 'search') return true;
      // 包含多个 input 子元素
      const children = node.childNodes || [];
      const inputCount = countInputs(children);
      if (inputCount >= 2) return true;
      return false;
    },
    typicalTag: 'form',
    childCountRange: { min: 1, max: 30 },
  },
  {
    name: 'list',
    description: '列表 — 垂直排列的列表项',
    match: (node) => {
      const tag = node.tag.toLowerCase();
      return tag === 'ul' || tag === 'ol';
    },
    typicalTag: 'ul',
    childCountRange: { min: 1, max: 100 },
  },
  {
    name: 'button',
    description: '按钮 — 可点击的操作元素',
    match: (node) => {
      const tag = node.tag.toLowerCase();
      const attrs = node.attributes || {};
      if (tag === 'button') return true;
      if (attrs.role === 'button') return true;
      if (tag === 'a' && attrs.class && /btn|button/i.test(attrs.class)) return true;
      if (tag === 'input' && (attrs.type === 'button' || attrs.type === 'submit')) return true;
      return false;
    },
    typicalTag: 'button',
    childCountRange: { min: 0, max: 5 },
  },
  {
    name: 'input',
    description: '输入框 — 文本输入控件',
    match: (node) => {
      const tag = node.tag.toLowerCase();
      const attrs = node.attributes || {};
      if (tag === 'input' && (!attrs.type || attrs.type === 'text' || attrs.type === 'password' || attrs.type === 'email' || attrs.type === 'search')) return true;
      if (tag === 'textarea') return true;
      if (tag === 'select') return true;
      return false;
    },
    typicalTag: 'input',
    childCountRange: { min: 0, max: 0 },
  },
  {
    name: 'sidebar',
    description: '侧边栏 — 固定在左侧或右侧的导航面板',
    match: (node) => {
      const tag = node.tag.toLowerCase();
      const attrs = node.attributes || {};
      const styles = node.styles || {};
      const cls = attrs.class || '';
      // aside 标签
      if (tag === 'aside') return true;
      // 带 sidebar 类名
      if (/sidebar|side-bar|sidenav/i.test(cls)) return true;
      // 固定宽度 + flex 子元素
      if (styles.position === 'fixed' && styles.width) return true;
      return false;
    },
    typicalTag: 'aside',
    childCountRange: { min: 1, max: 30 },
  },
  {
    name: 'modal',
    description: '弹窗/对话框 — 覆盖在页面上的交互层',
    match: (node) => {
      const attrs = node.attributes || {};
      const styles = node.styles || {};
      if (attrs.role === 'dialog' || attrs.role === 'alertdialog') return true;
      if (styles.position === 'fixed' && styles.zIndex && parseInt(styles.zIndex) > 100) return true;
      return false;
    },
    typicalTag: 'div',
    childCountRange: { min: 1, max: 20 },
  },
];

/** 递归统计 input 元素数量 */
function countInputs(nodes: TreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.nodeType === 1) {
      const el = node as ElementNode;
      if (el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select') {
        count++;
      }
      if (el.childNodes) {
        count += countInputs(el.childNodes);
      }
    }
  }
  return count;
}

// ========== 布局识别规则 ==========

interface LayoutRule {
  name: string;
  description: string;
  match: (node: ElementNode) => boolean;
}

const LAYOUT_RULES: LayoutRule[] = [
  {
    name: 'sidebar-content',
    description: '侧边栏+内容 — 左侧固定导航，右侧自适应内容',
    match: (node) => {
      const styles = node.styles || {};
      const display = styles.display || '';
      if (display !== 'flex') return false;
      const flexDirection = styles.flexDirection || styles['flex-direction'] || 'row';
      if (flexDirection !== 'row') return false;
      const children = (node.childNodes || []).filter(c => c.nodeType === 1) as ElementNode[];
      if (children.length < 2) return false;
      // 第一个子元素宽度固定（aside）
      const firstStyles = children[0].styles || {};
      const firstWidth = parseInt(firstStyles.width || '0');
      // 第二个子元素 flex: 1
      const secondStyles = children[1].styles || {};
      const secondFlex = secondStyles.flex || '';
      return firstWidth > 0 && firstWidth < 400 || secondFlex.includes('1');
    },
  },
  {
    name: 'full-width-list',
    description: '全宽列表 — 占满宽度的垂直列表布局',
    match: (node) => {
      const styles = node.styles || {};
      const display = styles.display || '';
      if (display !== 'flex') return false;
      const flexDirection = styles.flexDirection || styles['flex-direction'] || 'row';
      return flexDirection === 'column';
    },
  },
  {
    name: 'centered-form',
    description: '居中表单 — 表单内容水平垂直居中',
    match: (node) => {
      const styles = node.styles || {};
      const display = styles.display || '';
      if (display !== 'flex') return false;
      const alignItems = styles.alignItems || styles['align-items'] || '';
      const justifyContent = styles.justifyContent || styles['justify-content'] || '';
      return (alignItems === 'center' && justifyContent === 'center') ||
             (alignItems === 'center' && justifyContent === 'flex-start');
    },
  },
  {
    name: 'dashboard',
    description: '仪表盘 — 多列网格布局',
    match: (node) => {
      const styles = node.styles || {};
      const display = styles.display || '';
      if (display !== 'grid') return false;
      const cols = styles.gridTemplateColumns || styles['grid-template-columns'] || '';
      // 至少有 2 列
      return cols.split(' ').length >= 2 || cols.includes('repeat');
    },
  },
];

// ========== 公开 API ==========

/**
 * 从 CaptureTree 识别组件模式
 */
export function recognizeComponents(tree: CaptureTree, pageId: string): ComponentPattern[] {
  const patterns: Map<string, { count: number; samples: ElementNode[] }> = new Map();

  function walk(node: TreeNode): void {
    if (node.nodeType !== 1) return;
    const el = node as ElementNode;

    // 尝试匹配每个规则
    for (const rule of COMPONENT_RULES) {
      if (rule.match(el)) {
        const key = rule.name;
        if (!patterns.has(key)) {
          patterns.set(key, { count: 0, samples: [] });
        }
        const entry = patterns.get(key)!;
        entry.count++;
        if (entry.samples.length < 3) {
          entry.samples.push(el);
        }
        break; // 一个节点只匹配第一个命中的规则
      }
    }

    // 递归子节点
    if (el.childNodes) {
      for (const child of el.childNodes) {
        walk(child);
      }
    }
  }

  walk(tree.root);

  // 转为 ComponentPattern[]
  return Array.from(patterns.entries()).map(([name, data]) => {
    // 从样本中提取典型样式
    const sampleStyles = data.samples.length > 0
      ? (data.samples[0].styles || {})
      : {};

    // 计算子元素数量范围
    const childCounts = data.samples.map(s => (s.childNodes || []).length);
    const minChildren = childCounts.length > 0 ? Math.min(...childCounts) : 0;
    const maxChildren = childCounts.length > 0 ? Math.max(...childCounts) : 0;

    const rule = COMPONENT_RULES.find(r => r.name === name);

    return {
      name,
      description: rule?.description || '',
      structureHash: computeStructureHash(data.samples[0]),
      typicalStyles: sampleStyles,
      typicalTag: rule?.typicalTag || 'div',
      childCount: { min: minChildren, max: maxChildren },
      frequency: data.count,
      sourcePages: [pageId],
    } satisfies ComponentPattern;
  }).sort((a, b) => b.frequency - a.frequency);
}

/**
 * 从 CaptureTree 识别布局模式
 */
export function recognizeLayouts(tree: CaptureTree, pageId: string): LayoutPattern[] {
  const patterns: Map<string, { count: number; directions: Set<string>; childCounts: number[] }> = new Map();

  function walk(node: TreeNode): void {
    if (node.nodeType !== 1) return;
    const el = node as ElementNode;

    for (const rule of LAYOUT_RULES) {
      if (rule.match(el)) {
        if (!patterns.has(rule.name)) {
          patterns.set(rule.name, { count: 0, directions: new Set(), childCounts: [] });
        }
        const entry = patterns.get(rule.name)!;
        entry.count++;
        const styles = el.styles || {};
        const dir = styles.flexDirection || styles['flex-direction'] || 'unknown';
        entry.directions.add(dir);
        entry.childCounts.push((el.childNodes || []).filter(c => c.nodeType === 1).length);
        break;
      }
    }

    if (el.childNodes) {
      for (const child of el.childNodes) {
        walk(child);
      }
    }
  }

  walk(tree.root);

  return Array.from(patterns.entries()).map(([name, data]) => {
    const rule = LAYOUT_RULES.find(r => r.name === name);
    const avgChildCount = data.childCounts.length > 0
      ? Math.round(data.childCounts.reduce((a, b) => a + b, 0) / data.childCounts.length)
      : 0;
    const direction = data.directions.values().next().value || 'unknown';

    return {
      name,
      description: rule?.description || '',
      direction: direction as LayoutPattern['direction'],
      childCount: avgChildCount,
      frequency: data.count,
      sourcePages: [pageId],
    } satisfies LayoutPattern;
  }).sort((a, b) => b.frequency - a.frequency);
}

/**
 * 聚合多个页面的组件模式
 */
export function aggregateComponentPatterns(
  pageResults: Map<string, ComponentPattern[]>
): ComponentPattern[] {
  const accu: Map<string, ComponentPattern & { _allSourcePages: Set<string> }> = new Map();

  for (const [pageId, patterns] of pageResults) {
    for (const pattern of patterns) {
      const key = pattern.name;
      if (accu.has(key)) {
        const existing = accu.get(key)!;
        existing.frequency += pattern.frequency;
        existing._allSourcePages.add(pageId);
      } else {
        accu.set(key, {
          ...pattern,
          _allSourcePages: new Set([pageId]),
        });
      }
    }
  }

  return Array.from(accu.values())
    .map(p => ({
      ...p,
      sourcePages: Array.from(p._allSourcePages),
      _allSourcePages: undefined,
    }))
    .sort((a, b) => b.frequency - a.frequency);
}

/**
 * 聚合多个页面的布局模式
 */
export function aggregateLayoutPatterns(
  pageResults: Map<string, LayoutPattern[]>
): LayoutPattern[] {
  const accu: Map<string, LayoutPattern & { _allSourcePages: Set<string> }> = new Map();

  for (const [pageId, patterns] of pageResults) {
    for (const pattern of patterns) {
      const key = pattern.name;
      if (accu.has(key)) {
        const existing = accu.get(key)!;
        existing.frequency += pattern.frequency;
        existing._allSourcePages.add(pageId);
      } else {
        accu.set(key, {
          ...pattern,
          _allSourcePages: new Set([pageId]),
        });
      }
    }
  }

  return Array.from(accu.values())
    .map(p => ({
      ...p,
      sourcePages: Array.from(p._allSourcePages),
      _allSourcePages: undefined,
    }))
    .sort((a, b) => b.frequency - a.frequency);
}

// ========== 辅助函数 ==========

/** 计算节点结构指纹（简化版，用于快速匹配） */
function computeStructureHash(node: ElementNode | undefined): string {
  if (!node) return '';
  const parts: string[] = [node.tag];
  const children = node.childNodes || [];
  for (const child of children.slice(0, 5)) {
    if (child.nodeType === 1) {
      parts.push((child as ElementNode).tag);
    } else if (child.nodeType === 3) {
      parts.push('T');
    }
  }
  return parts.join('|');
}

/**
 * 匹配最相似的组件模式
 * 用于线框生成器和高保真设计器中
 */
export function matchComponentPattern(
  node: ElementNode,
  patterns: ComponentPattern[]
): ComponentPattern | null {
  // 先尝试直接匹配规则
  for (const rule of COMPONENT_RULES) {
    if (rule.match(node)) {
      const pattern = patterns.find(p => p.name === rule.name);
      if (pattern) return pattern;
    }
  }

  // 回退：基于标签和子元素数量匹配
  const childCount = (node.childNodes || []).length;
  let bestMatch: ComponentPattern | null = null;
  let bestScore = 0;

  for (const pattern of patterns) {
    let score = 0;
    if (pattern.typicalTag === node.tag) score += 2;
    if (childCount >= pattern.childCount.min && childCount <= pattern.childCount.max) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = pattern;
    }
  }

  return bestScore >= 2 ? bestMatch : null;
}
