/**
 * SolarWire DSL Parser (Local Stub)
 * 
 * Parses SolarWire DSL text into an AST.
 * This is a local implementation since the SolarWire npm package is not available.
 * 
 * Supported syntax:
 *   ["text"]       → rectangle
 *   ("text")       → rounded rectangle
 *   (("text"))     → circle
 *   "text"         → plain text
 *   [?]            → placeholder
 *   ## ... ##      → table container
 *   # ...          → table row
 *   --"label"--    → connector
 *   @(x,y)         → position
 *   w=N h=N bg=X c=X size=N bold r=N → attributes
 */

import type { SolarWireAST, SolarWireNode, SolarWireAttributes, SolarWirePosition, SolarWireParseError } from './types.js';

class ParseError extends Error {
  line?: number;
  column?: number;

  constructor(message: string, line?: number, column?: number) {
    super(message);
    this.name = 'SolarWireParseError';
    this.line = line;
    this.column = column;
  }
}

/**
 * Parse SolarWire DSL text into an AST.
 * Throws ParseError on invalid input.
 */
export function parse(dsl: string): SolarWireAST {
  if (typeof dsl !== 'string') {
    throw new ParseError('Input must be a string', 1, 1);
  }

  const trimmed = dsl.trim();
  if (trimmed === '') {
    return { type: 'root', children: [] };
  }

  const lines = trimmed.split('\n');
  const children: SolarWireNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line === '') {
      i++;
      continue;
    }

    // Comment lines (// ...)
    if (line.startsWith('//')) {
      i++;
      continue;
    }

    // Table container: ## ... ##
    if (line === '##') {
      const tableResult = parseTable(lines, i);
      children.push(tableResult.node);
      i = tableResult.nextIndex;
      continue;
    }

    // Parse a single line element
    const node = parseLine(line, i + 1);
    if (node) {
      children.push(node);
    }
    i++;
  }

  return { type: 'root', children };
}

function parseTable(lines: string[], startIndex: number): { node: SolarWireNode; nextIndex: number } {
  const rows: SolarWireNode[] = [];
  let i = startIndex + 1; // skip opening ##

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line === '##') {
      // closing ##
      return {
        node: { type: 'table', children: rows },
        nextIndex: i + 1,
      };
    }

    if (line.startsWith('#')) {
      const rowContent = line.slice(1).trim();
      const rowChildren = parseInlineElements(rowContent, i + 1);
      rows.push({ type: 'tableRow', children: rowChildren });
    }

    i++;
  }

  throw new ParseError('Unclosed table: missing closing ##', startIndex + 1, 1);
}

function parseLine(line: string, lineNumber: number): SolarWireNode | null {
  // Try to parse inline elements with trailing attributes
  const elements = parseInlineElements(line, lineNumber);

  if (elements.length === 0) {
    return null;
  }

  if (elements.length === 1) {
    return elements[0];
  }

  // Multiple elements on one line → wrap in a group
  return { type: 'group', children: elements };
}

function parseInlineElements(text: string, lineNumber: number): SolarWireNode[] {
  const nodes: SolarWireNode[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    remaining = remaining.trimStart();
    if (remaining.length === 0) break;

    // Connector: --"label"--
    const connectorMatch = remaining.match(/^--"([^"]*)"--/);
    if (connectorMatch) {
      const node: SolarWireNode = { type: 'connector', text: connectorMatch[1] };
      remaining = remaining.slice(connectorMatch[0].length).trimStart();
      const { attrs, rest } = extractAttributes(remaining);
      if (attrs) node.attributes = attrs;
      remaining = rest;
      nodes.push(node);
      continue;
    }

    // Circle: (("text"))
    const circleMatch = remaining.match(/^\(\("([^"]*)"\)\)/);
    if (circleMatch) {
      const node: SolarWireNode = { type: 'circle', text: circleMatch[1] };
      remaining = remaining.slice(circleMatch[0].length).trimStart();
      const { attrs, rest } = extractAttributes(remaining);
      if (attrs) node.attributes = attrs;
      remaining = rest;
      nodes.push(node);
      continue;
    }

    // Rounded rectangle: ("text")
    const roundedMatch = remaining.match(/^\("([^"]*)"\)/);
    if (roundedMatch) {
      const node: SolarWireNode = { type: 'rounded', text: roundedMatch[1] };
      remaining = remaining.slice(roundedMatch[0].length).trimStart();
      const { attrs, rest } = extractAttributes(remaining);
      if (attrs) node.attributes = attrs;
      remaining = rest;
      nodes.push(node);
      continue;
    }

    // Placeholder: [?]
    const placeholderMatch = remaining.match(/^\[\?\]/);
    if (placeholderMatch) {
      const node: SolarWireNode = { type: 'placeholder' };
      remaining = remaining.slice(placeholderMatch[0].length).trimStart();
      const { attrs, rest } = extractAttributes(remaining);
      if (attrs) node.attributes = attrs;
      remaining = rest;
      nodes.push(node);
      continue;
    }

    // Rectangle: ["text"]
    const rectMatch = remaining.match(/^\["([^"]*)"\]/);
    if (rectMatch) {
      const node: SolarWireNode = { type: 'rectangle', text: rectMatch[1] };
      remaining = remaining.slice(rectMatch[0].length).trimStart();
      const { attrs, rest } = extractAttributes(remaining);
      if (attrs) node.attributes = attrs;
      remaining = rest;
      nodes.push(node);
      continue;
    }

    // Plain text: "text"
    const textMatch = remaining.match(/^"([^"]*)"/);
    if (textMatch) {
      const node: SolarWireNode = { type: 'text', text: textMatch[1] };
      remaining = remaining.slice(textMatch[0].length).trimStart();
      const { attrs, rest } = extractAttributes(remaining);
      if (attrs) node.attributes = attrs;
      remaining = rest;
      nodes.push(node);
      continue;
    }

    // If nothing matched, it's a syntax error
    throw new ParseError(
      `Unexpected syntax: "${remaining.slice(0, 30)}${remaining.length > 30 ? '...' : ''}"`,
      lineNumber,
      text.length - remaining.length + 1
    );
  }

  return nodes;
}

function extractAttributes(text: string): { attrs: SolarWireAttributes | null; rest: string } {
  let remaining = text.trimStart();
  const attrs: SolarWireAttributes = {};
  let hasAttrs = false;

  while (remaining.length > 0) {
    const trimmed = remaining.trimStart();
    if (trimmed.length === 0) break;

    // Position: @(x,y) or @(+dx,+dy)
    const posMatch = trimmed.match(/^@\((\+?\d+),\s*(\+?\d+)\)/);
    if (posMatch) {
      const xStr = posMatch[1];
      const yStr = posMatch[2];
      const pos: SolarWirePosition = {
        x: parseInt(xStr.replace('+', ''), 10),
        y: parseInt(yStr.replace('+', ''), 10),
        relative: xStr.startsWith('+') || yStr.startsWith('+'),
      };
      attrs.position = pos;
      hasAttrs = true;
      remaining = trimmed.slice(posMatch[0].length);
      continue;
    }

    // w=N
    const wMatch = trimmed.match(/^w=(\d+)/);
    if (wMatch) {
      attrs.w = parseInt(wMatch[1], 10);
      hasAttrs = true;
      remaining = trimmed.slice(wMatch[0].length);
      continue;
    }

    // h=N
    const hMatch = trimmed.match(/^h=(\d+)/);
    if (hMatch) {
      attrs.h = parseInt(hMatch[1], 10);
      hasAttrs = true;
      remaining = trimmed.slice(hMatch[0].length);
      continue;
    }

    // bg=X (color value: #hex, named color, rgb(...))
    const bgMatch = trimmed.match(/^bg=(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/);
    if (bgMatch) {
      attrs.bg = bgMatch[1];
      hasAttrs = true;
      remaining = trimmed.slice(bgMatch[0].length);
      continue;
    }

    // c=X (color value)
    const cMatch = trimmed.match(/^c=(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/);
    if (cMatch) {
      attrs.c = cMatch[1];
      hasAttrs = true;
      remaining = trimmed.slice(cMatch[0].length);
      continue;
    }

    // size=N
    const sizeMatch = trimmed.match(/^size=(\d+)/);
    if (sizeMatch) {
      attrs.size = parseInt(sizeMatch[1], 10);
      hasAttrs = true;
      remaining = trimmed.slice(sizeMatch[0].length);
      continue;
    }

    // bold
    const boldMatch = trimmed.match(/^bold\b/);
    if (boldMatch) {
      attrs.bold = true;
      hasAttrs = true;
      remaining = trimmed.slice(boldMatch[0].length);
      continue;
    }

    // r=N
    const rMatch = trimmed.match(/^r=(\d+)/);
    if (rMatch) {
      attrs.r = parseInt(rMatch[1], 10);
      hasAttrs = true;
      remaining = trimmed.slice(rMatch[0].length);
      continue;
    }

    // No more attributes match — stop
    break;
  }

  return { attrs: hasAttrs ? attrs : null, rest: remaining };
}
