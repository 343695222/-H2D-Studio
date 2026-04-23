/**
 * SolarWire ↔ CaptureTree Converter Service
 *
 * Converts SolarWire DSL text to CaptureTree format for rendering
 * in the H2D Studio editor canvas.
 */

import { parse } from '../lib/solarwire/index.js';
import { render } from '../lib/solarwire/renderer-svg.js';
import type {
  SolarWireAST,
  SolarWireNode,
  SolarWireAttributes,
} from '../lib/solarwire/types.js';

// Re-declare the CaptureTree-related types locally so the server module
// doesn't depend on the web/ package.  These mirror web/src/types/capture.ts.

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ElementRect extends Rect {
  cssWidth: number;
  cssHeight: number;
}

interface ElementSnapshot {
  nodeType: 1;
  id: string;
  tag: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
  rect: ElementRect;
  childNodes: SnapshotNode[];
}

interface TextSnapshot {
  nodeType: 3;
  id: string;
  text: string;
  rect: Rect;
  lineCount: number;
}

type SnapshotNode = ElementSnapshot | TextSnapshot;

interface CaptureTree {
  root: ElementSnapshot;
  documentTitle?: string;
  documentRect: Rect;
  viewportRect: Rect;
  devicePixelRatio: number;
}

// ── Public result types ────────────────────────────────────────────────

export interface ConvertResult {
  success: true;
  captureTree: CaptureTree;
}

export interface ConvertError {
  success: false;
  error: {
    message: string;
    line?: number;
    column?: number;
  };
}

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_WIDTH = 100;
const DEFAULT_HEIGHT = 40;
const DEFAULT_CANVAS_WIDTH = 1200;
const DEFAULT_CANVAS_HEIGHT = 800;

// ── ID generator ───────────────────────────────────────────────────────

let idCounter = 0;

/** Reset the counter (useful for tests). */
export function resetIdCounter(): void {
  idCounter = 0;
}

function nextId(): string {
  idCounter += 1;
  return `sw-${idCounter}`;
}

// ── Helpers ────────────────────────────────────────────────────────────

function makeRect(
  x: number,
  y: number,
  width: number,
  height: number,
): ElementRect {
  return { x, y, width, height, cssWidth: width, cssHeight: height };
}

function makeSimpleRect(
  x: number,
  y: number,
  width: number,
  height: number,
): Rect {
  return { x, y, width, height };
}

/**
 * Map SolarWire attributes to CaptureTree styles.
 */
function mapAttributesToStyles(
  attrs: SolarWireAttributes | undefined,
): Record<string, string> {
  const styles: Record<string, string> = {};
  if (!attrs) return styles;

  if (attrs.w !== undefined) styles.width = `${attrs.w}px`;
  if (attrs.h !== undefined) styles.height = `${attrs.h}px`;
  if (attrs.bg !== undefined) styles.backgroundColor = attrs.bg;
  if (attrs.c !== undefined) styles.color = attrs.c;
  if (attrs.size !== undefined) styles.fontSize = `${attrs.size}px`;
  if (attrs.bold) styles.fontWeight = '700';
  if (attrs.r !== undefined) styles.borderRadius = `${attrs.r}px`;

  return styles;
}

/**
 * Resolve the effective width / height for a node, considering attributes.
 */
function resolveSize(attrs: SolarWireAttributes | undefined): {
  width: number;
  height: number;
} {
  return {
    width: attrs?.w ?? DEFAULT_WIDTH,
    height: attrs?.h ?? DEFAULT_HEIGHT,
  };
}

/**
 * Resolve position from attributes, falling back to (0, 0).
 */
function resolvePosition(attrs: SolarWireAttributes | undefined): {
  x: number;
  y: number;
} {
  if (attrs?.position) {
    return { x: attrs.position.x, y: attrs.position.y };
  }
  return { x: 0, y: 0 };
}

/**
 * Create a TextSnapshot child node for element text content.
 */
function makeTextChild(text: string, parentRect: Rect): TextSnapshot {
  return {
    nodeType: 3,
    id: nextId(),
    text,
    rect: makeSimpleRect(parentRect.x, parentRect.y, parentRect.width, parentRect.height),
    lineCount: 1,
  };
}

// ── AST Node → SnapshotNode conversion ─────────────────────────────────

function convertNode(node: SolarWireNode): SnapshotNode | null {
  switch (node.type) {
    case 'rectangle':
      return convertRectangle(node);
    case 'rounded':
      return convertRounded(node);
    case 'circle':
      return convertCircle(node);
    case 'text':
      return convertText(node);
    case 'placeholder':
      return convertPlaceholder(node);
    case 'table':
      return convertTable(node);
    case 'tableRow':
      return convertTableRow(node);
    case 'connector':
      return convertConnector(node);
    case 'group':
      return convertGroup(node);
    default:
      // Unknown node type — skip with warning
      return null;
  }
}

function convertRectangle(node: SolarWireNode): ElementSnapshot {
  const { width, height } = resolveSize(node.attributes);
  const { x, y } = resolvePosition(node.attributes);
  const attrStyles = mapAttributesToStyles(node.attributes);
  const rect = makeRect(x, y, width, height);

  const childNodes: SnapshotNode[] = [];
  if (node.text) {
    childNodes.push(makeTextChild(node.text, rect));
  }

  return {
    nodeType: 1,
    id: nextId(),
    tag: 'div',
    attributes: {},
    styles: {
      border: '1px solid #333',
      ...attrStyles,
    },
    rect,
    childNodes,
  };
}

function convertRounded(node: SolarWireNode): ElementSnapshot {
  const { width, height } = resolveSize(node.attributes);
  const { x, y } = resolvePosition(node.attributes);
  const attrStyles = mapAttributesToStyles(node.attributes);
  const rect = makeRect(x, y, width, height);

  const childNodes: SnapshotNode[] = [];
  if (node.text) {
    childNodes.push(makeTextChild(node.text, rect));
  }

  // Use explicit r attribute if provided, otherwise default 8px
  const borderRadius = attrStyles.borderRadius ?? '8px';

  return {
    nodeType: 1,
    id: nextId(),
    tag: 'div',
    attributes: {},
    styles: {
      border: '1px solid #333',
      ...attrStyles,
      borderRadius,
    },
    rect,
    childNodes,
  };
}

function convertCircle(node: SolarWireNode): ElementSnapshot {
  const { width, height } = resolveSize(node.attributes);
  const { x, y } = resolvePosition(node.attributes);
  const attrStyles = mapAttributesToStyles(node.attributes);

  // Circle: ensure equal width/height (use the larger dimension)
  const diameter = Math.max(width, height);
  const rect = makeRect(x, y, diameter, diameter);

  const childNodes: SnapshotNode[] = [];
  if (node.text) {
    childNodes.push(makeTextChild(node.text, rect));
  }

  return {
    nodeType: 1,
    id: nextId(),
    tag: 'div',
    attributes: {},
    styles: {
      border: '1px solid #333',
      ...attrStyles,
      // Always force circle styles after attrStyles spread
      borderRadius: '50%',
      width: `${diameter}px`,
      height: `${diameter}px`,
    },
    rect,
    childNodes,
  };
}

function convertText(node: SolarWireNode): TextSnapshot {
  const { x, y } = resolvePosition(node.attributes);
  const text = node.text ?? '';
  const fontSize = node.attributes?.size ?? 14;
  const estimatedWidth = text.length * fontSize * 0.6;

  return {
    nodeType: 3,
    id: nextId(),
    text,
    rect: makeSimpleRect(x, y, estimatedWidth, fontSize + 4),
    lineCount: 1,
  };
}

function convertPlaceholder(node: SolarWireNode): ElementSnapshot {
  const { width, height } = resolveSize(node.attributes);
  const { x, y } = resolvePosition(node.attributes);
  const attrStyles = mapAttributesToStyles(node.attributes);

  return {
    nodeType: 1,
    id: nextId(),
    tag: 'div',
    attributes: {},
    styles: {
      backgroundColor: '#e0e0e0',
      ...attrStyles,
    },
    rect: makeRect(x, y, width, height),
    childNodes: [],
  };
}

function convertTable(node: SolarWireNode): ElementSnapshot {
  const { x, y } = resolvePosition(node.attributes);
  const attrStyles = mapAttributesToStyles(node.attributes);

  const childNodes: SnapshotNode[] = [];
  let rowY = y;
  let maxWidth = 0;

  for (const child of node.children ?? []) {
    const converted = convertNode(child);
    if (converted && converted.nodeType === 1) {
      // Position rows vertically
      converted.rect = makeRect(x, rowY, converted.rect.width, converted.rect.height);
      rowY += converted.rect.height;
      if (converted.rect.width > maxWidth) maxWidth = converted.rect.width;
      childNodes.push(converted);
    }
  }

  const totalHeight = rowY - y || DEFAULT_HEIGHT;
  const totalWidth = maxWidth || DEFAULT_WIDTH;

  return {
    nodeType: 1,
    id: nextId(),
    tag: 'div',
    attributes: {},
    styles: {
      display: 'flex',
      flexDirection: 'column',
      ...attrStyles,
    },
    rect: makeRect(x, y, totalWidth, totalHeight),
    childNodes,
  };
}

function convertTableRow(node: SolarWireNode): ElementSnapshot {
  const { x, y } = resolvePosition(node.attributes);
  const attrStyles = mapAttributesToStyles(node.attributes);

  const childNodes: SnapshotNode[] = [];
  let cellX = x;
  let maxHeight = DEFAULT_HEIGHT;

  for (const child of node.children ?? []) {
    const converted = convertNode(child);
    if (converted) {
      if (converted.nodeType === 1) {
        converted.rect = makeRect(cellX, y, converted.rect.width, converted.rect.height);
        cellX += converted.rect.width;
        if (converted.rect.height > maxHeight) maxHeight = converted.rect.height;
      }
      childNodes.push(converted);
    }
  }

  const totalWidth = cellX - x || DEFAULT_WIDTH;

  return {
    nodeType: 1,
    id: nextId(),
    tag: 'div',
    attributes: {},
    styles: {
      display: 'flex',
      flexDirection: 'row',
      ...attrStyles,
    },
    rect: makeRect(x, y, totalWidth, maxHeight),
    childNodes,
  };
}

function convertConnector(node: SolarWireNode): ElementSnapshot {
  const { width, height } = resolveSize(node.attributes);
  const { x, y } = resolvePosition(node.attributes);
  const attrStyles = mapAttributesToStyles(node.attributes);
  const rect = makeRect(x, y, width, height);

  const childNodes: SnapshotNode[] = [];
  if (node.text) {
    childNodes.push(makeTextChild(node.text, rect));
  }

  return {
    nodeType: 1,
    id: nextId(),
    tag: 'div',
    attributes: {},
    styles: {
      borderBottom: '1px solid #333',
      ...attrStyles,
    },
    rect,
    childNodes,
  };
}

function convertGroup(node: SolarWireNode): ElementSnapshot {
  const { x, y } = resolvePosition(node.attributes);
  const attrStyles = mapAttributesToStyles(node.attributes);

  const childNodes: SnapshotNode[] = [];
  let maxWidth = 0;
  let maxHeight = 0;

  for (const child of node.children ?? []) {
    const converted = convertNode(child);
    if (converted) {
      childNodes.push(converted);
      const r = converted.rect;
      const right = r.x + r.width;
      const bottom = r.y + r.height;
      if (right > maxWidth) maxWidth = right;
      if (bottom > maxHeight) maxHeight = bottom;
    }
  }

  return {
    nodeType: 1,
    id: nextId(),
    tag: 'div',
    attributes: {},
    styles: { ...attrStyles },
    rect: makeRect(x, y, maxWidth || DEFAULT_WIDTH, maxHeight || DEFAULT_HEIGHT),
    childNodes,
  };
}

// ── Main public function ───────────────────────────────────────────────

/**
 * Convert SolarWire DSL text to a CaptureTree.
 *
 * 1. Calls SolarWire parse() to get the AST
 * 2. Traverses AST nodes, mapping each to ElementSnapshot / TextSnapshot
 * 3. Assembles a complete CaptureTree with root, documentTitle, rects, etc.
 *
 * Returns ConvertError (success: false) when parsing fails.
 */
export function solarwireToCaptureTree(
  dsl: string,
  options?: { title?: string; width?: number; height?: number },
): ConvertResult | ConvertError {
  // Reset ID counter for each conversion to ensure deterministic IDs
  resetIdCounter();

  let ast: SolarWireAST;
  try {
    ast = parse(dsl);
  } catch (err: unknown) {
    const e = err as { message?: string; line?: number; column?: number };
    return {
      success: false,
      error: {
        message: e.message ?? 'Failed to parse SolarWire DSL',
        line: e.line,
        column: e.column,
      },
    };
  }

  const canvasWidth = options?.width ?? DEFAULT_CANVAS_WIDTH;
  const canvasHeight = options?.height ?? DEFAULT_CANVAS_HEIGHT;
  const title = options?.title ?? 'SolarWire Design';

  // Convert all top-level AST children
  const childNodes: SnapshotNode[] = [];
  for (const child of ast.children) {
    const converted = convertNode(child);
    if (converted) {
      childNodes.push(converted);
    }
  }

  // Build root element
  const root: ElementSnapshot = {
    nodeType: 1,
    id: nextId(),
    tag: 'div',
    attributes: {},
    styles: {
      width: `${canvasWidth}px`,
      height: `${canvasHeight}px`,
      position: 'relative',
    },
    rect: makeRect(0, 0, canvasWidth, canvasHeight),
    childNodes,
  };

  const captureTree: CaptureTree = {
    root,
    documentTitle: title,
    documentRect: makeSimpleRect(0, 0, canvasWidth, canvasHeight),
    viewportRect: makeSimpleRect(0, 0, canvasWidth, canvasHeight),
    devicePixelRatio: 1,
  };

  return { success: true, captureTree };
}


// ── CaptureTree → SolarWire DSL ────────────────────────────────────────

const MAX_DEPTH = 4;
const MIN_SIZE = 5;

/**
 * Check if an element should be skipped (invisible or too small).
 */
function isInvisible(styles: Record<string, string>, rect: Rect): boolean {
  if (styles.display === 'none') return true;
  if (styles.visibility === 'hidden') return true;
  if (styles.opacity === '0') return true;
  if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) return true;
  return false;
}

/**
 * Determine the SolarWire node type from element styles.
 * Priority:
 *   1. borderRadius="50%" + equal w/h → circle
 *   2. borderRadius exists and non-zero → rounded
 *   3. border exists → rectangle
 *   4. container with children → container (no wrapper)
 *   5. fallback → container
 */
function detectNodeType(
  el: ElementSnapshot,
): 'circle' | 'rounded' | 'rectangle' | 'container' {
  const { styles, rect } = el;
  const br = styles.borderRadius;

  if (br === '50%' && rect.width === rect.height) {
    return 'circle';
  }

  if (br && br !== '0' && br !== '0px') {
    return 'rounded';
  }

  if (styles.border || styles.borderTop || styles.borderBottom || styles.borderLeft || styles.borderRight) {
    return 'rectangle';
  }

  return 'container';
}

/**
 * Extract the first text content from an element's direct TextSnapshot children.
 */
function extractText(childNodes: SnapshotNode[]): string {
  for (const child of childNodes) {
    if (child.nodeType === 3 && child.text) {
      return child.text;
    }
  }
  return '';
}

/**
 * Build the SolarWire attribute string from CaptureTree styles and rect.
 */
function buildAttributes(el: ElementSnapshot, nodeType: string): string {
  const parts: string[] = [];
  const { styles, rect } = el;

  // Position — only if non-zero
  if (rect.x !== 0 || rect.y !== 0) {
    parts.push(`@(${Math.round(rect.x)},${Math.round(rect.y)})`);
  }

  // Width / height
  const w = parseNumericStyle(styles.width) ?? rect.width;
  const h = parseNumericStyle(styles.height) ?? rect.height;
  if (w && w !== DEFAULT_WIDTH) parts.push(`w=${Math.round(w)}`);
  if (h && h !== DEFAULT_HEIGHT) parts.push(`h=${Math.round(h)}`);

  // Background color
  if (styles.backgroundColor && styles.backgroundColor !== '#e0e0e0') {
    parts.push(`bg=${styles.backgroundColor}`);
  }

  // Text color
  if (styles.color) {
    parts.push(`c=${styles.color}`);
  }

  // Font size
  const fontSize = parseNumericStyle(styles.fontSize);
  if (fontSize) {
    parts.push(`size=${Math.round(fontSize)}`);
  }

  // Bold
  if (styles.fontWeight === '700' || styles.fontWeight === 'bold') {
    parts.push('bold');
  }

  // Border radius — only for non-circle, non-50% values
  if (nodeType !== 'circle') {
    const br = parseNumericStyle(styles.borderRadius);
    if (br && br !== 8) {
      // 8 is the default for rounded, only emit if different
      parts.push(`r=${Math.round(br)}`);
    }
  }

  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

/**
 * Parse a CSS numeric value like "200px" → 200, or return undefined.
 */
function parseNumericStyle(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const num = parseFloat(value);
  return isNaN(num) ? undefined : num;
}

/**
 * Recursively convert a SnapshotNode to SolarWire DSL lines.
 */
function nodeToSolarWire(
  node: SnapshotNode,
  depth: number,
  indent: string,
): string[] {
  // TextSnapshot → quoted text
  if (node.nodeType === 3) {
    const text = (node as TextSnapshot).text || '';
    return [`${indent}"${text}"`];
  }

  const el = node as ElementSnapshot;

  // Skip invisible / tiny elements
  if (isInvisible(el.styles, el.rect)) {
    return [];
  }

  // Depth limit — collapse to placeholder
  if (depth >= MAX_DEPTH) {
    return [`${indent}[?]`];
  }

  const nodeType = detectNodeType(el);
  const text = extractText(el.childNodes);
  const attrs = buildAttributes(el, nodeType);

  // Get non-text children for recursion
  const elementChildren = el.childNodes.filter(
    (c) => c.nodeType === 1,
  ) as ElementSnapshot[];

  const lines: string[] = [];

  switch (nodeType) {
    case 'circle':
      lines.push(`${indent}(("${text}"))${attrs}`);
      break;
    case 'rounded':
      lines.push(`${indent}("${text}")${attrs}`);
      break;
    case 'rectangle':
      lines.push(`${indent}["${text}"]${attrs}`);
      break;
    case 'container':
      // Container with no element children — if it has text, emit as text
      if (elementChildren.length === 0 && text) {
        lines.push(`${indent}"${text}"${attrs}`);
        break;
      }
      // Recurse into children
      for (const child of el.childNodes) {
        const childLines = nodeToSolarWire(child, depth + 1, indent);
        lines.push(...childLines);
      }
      return lines;
  }

  // For shaped nodes (circle/rounded/rectangle), also recurse element children
  if (nodeType !== 'container' && elementChildren.length > 0) {
    const childIndent = indent + '  ';
    for (const child of elementChildren) {
      const childLines = nodeToSolarWire(child, depth + 1, childIndent);
      lines.push(...childLines);
    }
  }

  return lines;
}

/**
 * Convert a CaptureTree to SolarWire DSL text.
 *
 * Traverses the tree structure, choosing the appropriate SolarWire syntax
 * based on element styles:
 *   - borderRadius="50%" + equal w/h → circle (("text"))
 *   - borderRadius → rounded ("text")
 *   - border → rectangle ["text"]
 *   - other → container, recurse children
 *
 * Simplification rules:
 *   - Max recursion depth: 4 levels → collapse to [?]
 *   - Ignore invisible elements (display:none, visibility:hidden, opacity:0)
 *   - Ignore tiny elements (width < 5 or height < 5)
 */
export function captureTreeToSolarWire(tree: CaptureTree): string {
  if (!tree || !tree.root) return '';

  const root = tree.root;
  const lines: string[] = [];

  // Skip the root wrapper div, iterate its children directly
  for (const child of root.childNodes) {
    const childLines = nodeToSolarWire(child, 0, '');
    lines.push(...childLines);
  }

  return lines.join('\n');
}

// ── Pretty Printer: formatSolarWire ────────────────────────────────────

/**
 * Build the attribute string from a SolarWire AST node's attributes.
 */
function formatAttributes(attrs: SolarWireAttributes | undefined): string {
  if (!attrs) return '';
  const parts: string[] = [];

  if (attrs.position) {
    const prefix = attrs.position.relative ? '+' : '';
    parts.push(`@(${prefix}${attrs.position.x},${prefix}${attrs.position.y})`);
  }
  if (attrs.w !== undefined) parts.push(`w=${attrs.w}`);
  if (attrs.h !== undefined) parts.push(`h=${attrs.h}`);
  if (attrs.bg !== undefined) parts.push(`bg=${attrs.bg}`);
  if (attrs.c !== undefined) parts.push(`c=${attrs.c}`);
  if (attrs.size !== undefined) parts.push(`size=${attrs.size}`);
  if (attrs.bold) parts.push('bold');
  if (attrs.r !== undefined) parts.push(`r=${attrs.r}`);

  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

/**
 * Recursively format an AST node into DSL lines.
 */
function formatNode(node: SolarWireNode, indent: string): string[] {
  const attrs = formatAttributes(node.attributes);
  const lines: string[] = [];

  switch (node.type) {
    case 'rectangle':
      lines.push(`${indent}["${node.text ?? ''}"]${attrs}`);
      break;
    case 'rounded':
      lines.push(`${indent}("${node.text ?? ''}")${attrs}`);
      break;
    case 'circle':
      lines.push(`${indent}(("${node.text ?? ''}"))${attrs}`);
      break;
    case 'text':
      lines.push(`${indent}"${node.text ?? ''}"${attrs}`);
      break;
    case 'placeholder':
      lines.push(`${indent}[?]${attrs}`);
      break;
    case 'connector':
      lines.push(`${indent}--"${node.text ?? ''}"--${attrs}`);
      break;
    case 'table': {
      lines.push(`${indent}##`);
      const rowIndent = indent + '  ';
      for (const child of node.children ?? []) {
        lines.push(...formatTableRow(child, rowIndent));
      }
      lines.push(`${indent}##`);
      break;
    }
    case 'tableRow':
      lines.push(...formatTableRow(node, indent));
      break;
    case 'group': {
      // Group: render children inline on one line (space-separated)
      const childParts: string[] = [];
      for (const child of node.children ?? []) {
        const childAttrs = formatAttributes(child.attributes);
        switch (child.type) {
          case 'rectangle':
            childParts.push(`["${child.text ?? ''}"]${childAttrs}`);
            break;
          case 'rounded':
            childParts.push(`("${child.text ?? ''}")${childAttrs}`);
            break;
          case 'circle':
            childParts.push(`(("${child.text ?? ''}"))${childAttrs}`);
            break;
          case 'text':
            childParts.push(`"${child.text ?? ''}"${childAttrs}`);
            break;
          case 'placeholder':
            childParts.push(`[?]${childAttrs}`);
            break;
          case 'connector':
            childParts.push(`--"${child.text ?? ''}"--${childAttrs}`);
            break;
          default:
            // For complex nested children in a group, fall back to separate lines
            lines.push(...formatNode(child, indent));
            break;
        }
      }
      if (childParts.length > 0) {
        lines.push(`${indent}${childParts.join(' ')}`);
      }
      break;
    }
    default:
      break;
  }

  return lines;
}

/**
 * Format a table row node: # [cell1] [cell2] ...
 */
function formatTableRow(node: SolarWireNode, indent: string): string[] {
  if (node.type !== 'tableRow') return [];

  const cellParts: string[] = [];
  for (const child of node.children ?? []) {
    const childAttrs = formatAttributes(child.attributes);
    switch (child.type) {
      case 'rectangle':
        cellParts.push(`["${child.text ?? ''}"]${childAttrs}`);
        break;
      case 'rounded':
        cellParts.push(`("${child.text ?? ''}")${childAttrs}`);
        break;
      case 'circle':
        cellParts.push(`(("${child.text ?? ''}"))${childAttrs}`);
        break;
      case 'text':
        cellParts.push(`"${child.text ?? ''}"${childAttrs}`);
        break;
      case 'placeholder':
        cellParts.push(`[?]${childAttrs}`);
        break;
      default:
        cellParts.push(`["${child.text ?? ''}"]${childAttrs}`);
        break;
    }
  }

  return [`${indent}# ${cellParts.join(' ')}`];
}

/**
 * Pretty Printer: 格式化 SolarWire DSL 文本
 * parse → AST → 重新生成格式化缩进文本
 *
 * - Each element on its own line
 * - Table rows indented inside table containers
 * - If parse fails, return the original DSL unchanged
 */
export function formatSolarWire(dsl: string): string {
  let ast: SolarWireAST;
  try {
    ast = parse(dsl);
  } catch {
    // Parse failed — return original DSL unchanged
    return dsl;
  }

  const lines: string[] = [];
  for (const child of ast.children) {
    lines.push(...formatNode(child, ''));
  }

  return lines.join('\n');
}

// ── SolarWire → SVG ────────────────────────────────────────────────────

/**
 * 将 SolarWire DSL 渲染为 SVG 字符串
 * 直接调用 SolarWire 库的 render()
 */
export function solarwireToSVG(dsl: string): { success: true; svg: string } | ConvertError {
  let ast: SolarWireAST;
  try {
    ast = parse(dsl);
  } catch (err: unknown) {
    const e = err as { message?: string; line?: number; column?: number };
    return {
      success: false,
      error: {
        message: e.message ?? 'Failed to parse SolarWire DSL',
        line: e.line,
        column: e.column,
      },
    };
  }

  try {
    const svg = render(ast);
    return { success: true, svg };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return {
      success: false,
      error: {
        message: e.message ?? 'Failed to render SVG',
      },
    };
  }
}

// ── Extract SolarWire code blocks from Markdown ────────────────────────

/**
 * Extract all ```solarwire code blocks from a Markdown text string.
 * Returns an array of DSL strings (the content inside each code block).
 *
 * - Matches fenced code blocks starting with ```solarwire
 * - Extracts and trims the content between opening and closing ```
 * - Returns empty array if no code blocks found or input is empty
 */
export function extractSolarWireCodeBlocks(text: string): string[] {
  if (!text) return [];

  const results: string[] = [];
  const regex = /```solarwire\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const content = match[1].trim();
    if (content.length > 0) {
      results.push(content);
    }
  }

  return results;
}
