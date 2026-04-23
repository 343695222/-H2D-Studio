/**
 * SolarWire SVG Renderer (Local Stub)
 * 
 * Renders a SolarWire AST into an SVG string.
 */

import type { SolarWireAST, SolarWireNode, SolarWireAttributes } from './types.js';

const DEFAULT_WIDTH = 100;
const DEFAULT_HEIGHT = 40;
const DEFAULT_FONT_SIZE = 14;
const PADDING = 20;
const ELEMENT_GAP = 10;

interface RenderContext {
  x: number;
  y: number;
  maxWidth: number;
}

/**
 * Render a SolarWire AST to an SVG string.
 */
export function render(ast: SolarWireAST): string {
  if (!ast || ast.type !== 'root') {
    throw new Error('Invalid AST: expected root node');
  }

  const elements: string[] = [];
  const ctx: RenderContext = { x: PADDING, y: PADDING, maxWidth: 0 };

  for (const child of ast.children || []) {
    const result = renderNode(child, ctx);
    elements.push(result.svg);
    ctx.y += result.height + ELEMENT_GAP;
    if (result.width > ctx.maxWidth) {
      ctx.maxWidth = result.width;
    }
  }

  const svgWidth = ctx.maxWidth + PADDING * 2;
  const svgHeight = ctx.y + PADDING;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`,
    `  <style>text { font-family: Arial, sans-serif; }</style>`,
    ...elements.map(e => `  ${e}`),
    `</svg>`,
  ].join('\n');
}

function renderNode(node: SolarWireNode, ctx: RenderContext): { svg: string; width: number; height: number } {
  const attrs = node.attributes || {};
  const w = attrs.w || DEFAULT_WIDTH;
  const h = attrs.h || DEFAULT_HEIGHT;
  const x = attrs.position ? attrs.position.x : ctx.x;
  const y = attrs.position ? attrs.position.y : ctx.y;
  const fontSize = attrs.size || DEFAULT_FONT_SIZE;
  const fill = attrs.bg || 'none';
  const textColor = attrs.c || '#333';
  const fontWeight = attrs.bold ? '700' : '400';

  switch (node.type) {
    case 'rectangle':
      return {
        svg: renderRect(x, y, w, h, 0, fill, node.text || '', textColor, fontSize, fontWeight),
        width: w,
        height: h,
      };

    case 'rounded': {
      const r = attrs.r || 8;
      return {
        svg: renderRect(x, y, w, h, r, fill, node.text || '', textColor, fontSize, fontWeight),
        width: w,
        height: h,
      };
    }

    case 'circle': {
      const diameter = Math.max(w, h);
      const radius = diameter / 2;
      return {
        svg: renderCircle(x + radius, y + radius, radius, fill, node.text || '', textColor, fontSize, fontWeight),
        width: diameter,
        height: diameter,
      };
    }

    case 'text':
      return {
        svg: `<text x="${x}" y="${y + fontSize}" font-size="${fontSize}" fill="${textColor}" font-weight="${fontWeight}">${escapeXml(node.text || '')}</text>`,
        width: (node.text || '').length * fontSize * 0.6,
        height: fontSize + 4,
      };

    case 'placeholder':
      return {
        svg: renderRect(x, y, w, h, 0, '#e0e0e0', '?', '#999', fontSize, fontWeight),
        width: w,
        height: h,
      };

    case 'connector':
      return {
        svg: `<g><line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="#333" stroke-width="1"/><text x="${x + w / 2}" y="${y + h / 2 - 4}" text-anchor="middle" font-size="${fontSize}" fill="${textColor}">${escapeXml(node.text || '')}</text></g>`,
        width: w,
        height: h,
      };

    case 'table': {
      const rows: string[] = [];
      let rowY = y;
      let maxRowWidth = 0;
      for (const row of node.children || []) {
        const rowResult = renderTableRow(row, x, rowY, attrs);
        rows.push(rowResult.svg);
        rowY += rowResult.height;
        if (rowResult.width > maxRowWidth) maxRowWidth = rowResult.width;
      }
      return {
        svg: `<g>${rows.join('')}</g>`,
        width: maxRowWidth,
        height: rowY - y,
      };
    }

    case 'tableRow': {
      return renderTableRow(node, x, y, attrs);
    }

    case 'group': {
      const groupElements: string[] = [];
      let gx = x;
      let maxH = 0;
      for (const child of node.children || []) {
        const childCtx = { ...ctx, x: gx, y };
        const result = renderNode(child, childCtx);
        groupElements.push(result.svg);
        gx += result.width + ELEMENT_GAP;
        if (result.height > maxH) maxH = result.height;
      }
      return {
        svg: `<g>${groupElements.join('')}</g>`,
        width: gx - x - ELEMENT_GAP,
        height: maxH,
      };
    }

    default:
      return { svg: '', width: 0, height: 0 };
  }
}

function renderTableRow(node: SolarWireNode, x: number, y: number, _attrs: SolarWireAttributes): { svg: string; width: number; height: number } {
  const cells: string[] = [];
  let cellX = x;
  const cellH = DEFAULT_HEIGHT;

  for (const child of node.children || []) {
    const cellW = child.attributes?.w || DEFAULT_WIDTH;
    const fill = child.attributes?.bg || 'none';
    const textColor = child.attributes?.c || '#333';
    const fontSize = child.attributes?.size || DEFAULT_FONT_SIZE;
    const fontWeight = child.attributes?.bold ? '700' : '400';
    cells.push(renderRect(cellX, y, cellW, cellH, 0, fill, child.text || '', textColor, fontSize, fontWeight));
    cellX += cellW;
  }

  return {
    svg: `<g>${cells.join('')}</g>`,
    width: cellX - x,
    height: cellH,
  };
}

function renderRect(
  x: number, y: number, w: number, h: number, r: number,
  fill: string, text: string, textColor: string, fontSize: number, fontWeight: string
): string {
  const rectAttrs = r > 0 ? ` rx="${r}" ry="${r}"` : '';
  const fillAttr = fill === 'none' ? 'fill="none"' : `fill="${fill}"`;
  return [
    `<g>`,
    `  <rect x="${x}" y="${y}" width="${w}" height="${h}"${rectAttrs} ${fillAttr} stroke="#333" stroke-width="1"/>`,
    text ? `  <text x="${x + w / 2}" y="${y + h / 2 + fontSize / 3}" text-anchor="middle" font-size="${fontSize}" fill="${textColor}" font-weight="${fontWeight}">${escapeXml(text)}</text>` : '',
    `</g>`,
  ].filter(Boolean).join('\n');
}

function renderCircle(
  cx: number, cy: number, r: number,
  fill: string, text: string, textColor: string, fontSize: number, fontWeight: string
): string {
  const fillAttr = fill === 'none' ? 'fill="none"' : `fill="${fill}"`;
  return [
    `<g>`,
    `  <circle cx="${cx}" cy="${cy}" r="${r}" ${fillAttr} stroke="#333" stroke-width="1"/>`,
    text ? `  <text x="${cx}" y="${cy + fontSize / 3}" text-anchor="middle" font-size="${fontSize}" fill="${textColor}" font-weight="${fontWeight}">${escapeXml(text)}</text>` : '',
    `</g>`,
  ].join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
