/**
 * Design Extractor — 从 CaptureTree 中提取设计 Token
 *
 * 遍历 CaptureTree 的所有节点，提取颜色、字体、间距、圆角、阴影等设计规范，
 * 按频率排序并标注来源页面。
 */

import type {
  ColorToken,
  TypographyToken,
  SpacingToken,
  BorderRadiusToken,
  ShadowToken,
} from '../types.js';

// ========== 内部辅助类型 ==========

interface StyleRecord {
  [key: string]: string;
}

interface ElementNode {
  nodeType: 1;
  tag: string;
  styles?: StyleRecord;
  attributes?: Record<string, string>;
  childNodes?: TreeNode[];
}

interface TextNode {
  nodeType: 3;
  text?: string;
}

type TreeNode = ElementNode | TextNode;

interface CaptureTree {
  root: ElementNode;
  documentTitle?: string;
}

// ========== 颜色提取 ==========

/** 判断一个 CSS 颜色值是否「有意义」（排除透明、白色背景等噪音） */
function isMeaningfulColor(value: string): boolean {
  if (!value) return false;
  const v = value.toLowerCase().trim();
  // 排除透明
  if (v === 'transparent' || v === 'rgba(0, 0, 0, 0)') return false;
  // 排除纯白背景（通常是页面底色，不是设计色）
  if (v === '#fff' || v === '#ffffff' || v === 'rgb(255, 255, 255)' || v === 'white') return false;
  // 排除纯黑文字（太常见，不是设计色）
  // 注意：不排除黑色，因为有些设计确实用黑色作为主色
  return true;
}

/** 标准化颜色值为统一格式 */
function normalizeColor(value: string): string {
  const v = value.trim();
  // rgb/rgba 保持原样
  if (v.startsWith('rgb')) return v.replace(/\s+/g, ' ');
  // hex 统一为小写
  if (v.startsWith('#')) return v.toLowerCase();
  return v;
}

/** 推断颜色用途 */
function inferColorUsage(cssProperty: string): ColorToken['usage'] {
  if (cssProperty.includes('background')) return 'background';
  if (cssProperty === 'color') return 'text';
  if (cssProperty.includes('border')) return 'border';
  if (cssProperty.includes('shadow')) return 'unknown';
  return 'unknown';
}

// ========== 字体提取 ==========

/** 推断字体用途 */
function inferTypographyUsage(fontSize: number): TypographyToken['usage'] {
  if (fontSize >= 24) return 'heading';
  if (fontSize >= 16) return 'body';
  if (fontSize >= 12) return 'label';
  return 'caption';
}

// ========== 间距提取 ==========

/** 从 CSS 值中提取像素数值 */
function extractPxValue(value: string): number | null {
  const match = value.match(/^(\d+(?:\.\d+)?)px$/);
  if (match) return parseFloat(match[1]);
  return null;
}

// ========== 遍历工具 ==========

/** 递归遍历 CaptureTree 所有节点 */
function walkTree(tree: CaptureTree, visitor: (node: TreeNode) => void): void {
  function walk(node: TreeNode): void {
    visitor(node);
    if (node.nodeType === 1) {
      const children = (node as ElementNode).childNodes || [];
      for (const child of children) {
        walk(child);
      }
    }
  }
  walk(tree.root);
}

// ========== 聚合工具 ==========

interface TokenAccumulator<T> {
  [key: string]: T & { frequency: number; sourcePages: Set<string> };
}

function mergeResults<T extends { frequency: number; sourcePages: string[] }>(
  pageResults: Map<string, T[]>,
  keyFn: (item: T) => string,
  maxItems: number = 20
): T[] {
  const accu: TokenAccumulator<T> = {};

  for (const [pageId, tokens] of pageResults) {
    for (const token of tokens) {
      const key = keyFn(token);
      if (accu[key]) {
        accu[key].frequency += token.frequency;
        accu[key].sourcePages.add(pageId);
      } else {
        accu[key] = {
          ...token,
          frequency: token.frequency,
          sourcePages: new Set([pageId]),
        } as typeof accu[string];
      }
    }
  }

  return Object.values(accu)
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, maxItems)
    .map(item => ({
      ...item,
      sourcePages: Array.from(item.sourcePages),
    })) as T[];
}

// ========== 公开 API ==========

/**
 * 从单个 CaptureTree 提取颜色 Token
 */
export function extractColorsFromTree(tree: CaptureTree): ColorToken[] {
  const colorMap: Record<string, { count: number; usages: Set<ColorToken['usage']> }> = {};

  walkTree(tree, (node) => {
    if (node.nodeType !== 1) return;
    const styles = (node as ElementNode).styles;
    if (!styles) return;

    const colorProperties = [
      'color',
      'background-color',
      'backgroundColor',
      'border-color',
      'borderColor',
      'border-top-color',
      'borderBottomColor',
      'outline-color',
    ];

    for (const prop of colorProperties) {
      const value = styles[prop];
      if (value && isMeaningfulColor(value)) {
        const normalized = normalizeColor(value);
        if (!colorMap[normalized]) {
          colorMap[normalized] = { count: 0, usages: new Set() };
        }
        colorMap[normalized].count++;
        colorMap[normalized].usages.add(inferColorUsage(prop));
      }
    }
  });

  return Object.entries(colorMap)
    .map(([value, data]) => ({
      value,
      usage: data.usages.values().next().value || 'unknown' as ColorToken['usage'],
      frequency: data.count,
      sourcePages: [] as string[], // 由调用方填充
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 20);
}

/**
 * 从单个 CaptureTree 提取字体 Token
 */
export function extractTypographyFromTree(tree: CaptureTree): TypographyToken[] {
  const typoMap: Record<string, { count: number; sizes: Set<number> }> = {};

  walkTree(tree, (node) => {
    if (node.nodeType !== 1) return;
    const styles = (node as ElementNode).styles;
    if (!styles) return;

    const fontSize = styles['fontSize'] || styles['font-size'];
    const fontWeight = styles['fontWeight'] || styles['font-weight'] || '400';
    const fontFamily = styles['fontFamily'] || styles['font-family'] || '';
    const lineHeight = styles['lineHeight'] || styles['line-height'] || 'normal';

    if (fontSize) {
      const sizePx = extractPxValue(fontSize);
      if (sizePx !== null && sizePx > 0) {
        const key = `${fontSize}|${fontWeight}|${fontFamily.split(',')[0]}`;
        if (!typoMap[key]) {
          typoMap[key] = { count: 0, sizes: new Set() };
        }
        typoMap[key].count++;
        typoMap[key].sizes.add(sizePx);
      }
    }
  });

  return Object.entries(typoMap)
    .map(([key, data]) => {
      const [fontSize, fontWeight, fontFamily] = key.split('|');
      const avgSize = Array.from(data.sizes).reduce((a, b) => a + b, 0) / data.sizes.size;
      return {
        fontSize,
        fontWeight,
        fontFamily: fontFamily || 'system-ui',
        lineHeight: 'normal',
        usage: inferTypographyUsage(avgSize) as TypographyToken['usage'],
        frequency: data.count,
        sourcePages: [] as string[],
      };
    })
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 15);
}

/**
 * 从单个 CaptureTree 提取间距 Token
 */
export function extractSpacingFromTree(tree: CaptureTree): SpacingToken[] {
  const spacingMap: Record<number, number> = {};

  const spacingProperties = [
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'gap', 'rowGap', 'columnGap',
  ];

  walkTree(tree, (node) => {
    if (node.nodeType !== 1) return;
    const styles = (node as ElementNode).styles;
    if (!styles) return;

    for (const prop of spacingProperties) {
      const value = styles[prop];
      if (value) {
        const px = extractPxValue(value);
        if (px !== null && px > 0 && px < 500) {
          spacingMap[px] = (spacingMap[px] || 0) + 1;
        }
      }
    }
  });

  return Object.entries(spacingMap)
    .map(([value, count]) => ({
      value: parseInt(value, 10),
      unit: 'px',
      frequency: count,
      sourcePages: [] as string[],
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 20);
}

/**
 * 从单个 CaptureTree 提取圆角 Token
 */
export function extractBorderRadiusFromTree(tree: CaptureTree): BorderRadiusToken[] {
  const radiusMap: Record<string, number> = {};

  walkTree(tree, (node) => {
    if (node.nodeType !== 1) return;
    const styles = (node as ElementNode).styles;
    if (!styles) return;

    const value = styles['borderRadius'] || styles['border-radius'];
    if (value && value !== '0px' && value !== '0') {
      radiusMap[value] = (radiusMap[value] || 0) + 1;
    }
  });

  return Object.entries(radiusMap)
    .map(([value, count]) => ({
      value,
      frequency: count,
      sourcePages: [] as string[],
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);
}

/**
 * 从单个 CaptureTree 提取阴影 Token
 */
export function extractShadowsFromTree(tree: CaptureTree): ShadowToken[] {
  const shadowMap: Record<string, number> = {};

  walkTree(tree, (node) => {
    if (node.nodeType !== 1) return;
    const styles = (node as ElementNode).styles;
    if (!styles) return;

    const value = styles['boxShadow'] || styles['box-shadow'];
    if (value && value !== 'none') {
      // 标准化阴影值（去除多余空格）
      const normalized = value.replace(/\s+/g, ' ').trim();
      shadowMap[normalized] = (shadowMap[normalized] || 0) + 1;
    }
  });

  return Object.entries(shadowMap)
    .map(([value, count]) => ({
      value,
      frequency: count,
      sourcePages: [] as string[],
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);
}

/**
 * 聚合多个页面的提取结果
 */
export function aggregateDesignTokens(
  pageResults: Map<string, {
    colors: ColorToken[];
    typography: TypographyToken[];
    spacing: SpacingToken[];
    borderRadius: BorderRadiusToken[];
    shadows: ShadowToken[];
  }>
): {
  colors: ColorToken[];
  typography: TypographyToken[];
  spacing: SpacingToken[];
  borderRadius: BorderRadiusToken[];
  shadows: ShadowToken[];
} {
  const colorsMap = new Map<string, ColorToken[]>();
  const typoMap = new Map<string, TypographyToken[]>();
  const spacingMap = new Map<string, SpacingToken[]>();
  const radiusMap = new Map<string, BorderRadiusToken[]>();
  const shadowMap = new Map<string, ShadowToken[]>();

  for (const [pageId, tokens] of pageResults) {
    colorsMap.set(pageId, tokens.colors);
    typoMap.set(pageId, tokens.typography);
    spacingMap.set(pageId, tokens.spacing);
    radiusMap.set(pageId, tokens.borderRadius);
    shadowMap.set(pageId, tokens.shadows);
  }

  return {
    colors: mergeResults(colorsMap, t => t.value, 20),
    typography: mergeResults(typoMap, t => `${t.fontSize}|${t.fontWeight}|${t.fontFamily}`, 15),
    spacing: mergeResults(spacingMap, t => String(t.value), 20),
    borderRadius: mergeResults(radiusMap, t => t.value, 10),
    shadows: mergeResults(shadowMap, t => t.value, 10),
  };
}

/**
 * 从 CaptureTree 提取所有设计 Token（单页面便捷方法）
 */
export function extractAllDesignTokens(tree: CaptureTree): {
  colors: ColorToken[];
  typography: TypographyToken[];
  spacing: SpacingToken[];
  borderRadius: BorderRadiusToken[];
  shadows: ShadowToken[];
} {
  return {
    colors: extractColorsFromTree(tree),
    typography: extractTypographyFromTree(tree),
    spacing: extractSpacingFromTree(tree),
    borderRadius: extractBorderRadiusFromTree(tree),
    shadows: extractShadowsFromTree(tree),
  };
}
