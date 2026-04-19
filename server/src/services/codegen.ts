import type { PageCapture } from '../types.js';

/**
 * Code Generation Service - Generates code from design captures
 */

export interface CodeGenOptions {
  framework: 'react' | 'vue' | 'html';
  styling: 'tailwind' | 'css' | 'styled-components';
  componentLibrary?: 'shadcn' | 'mui' | 'antd' | 'none';
}

// Capture Tree Types (mirrored from src/lib/types.ts)
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

interface TextSnapshot {
  nodeType: 3;
  id: string;
  text: string;
  rect: Rect;
  lineCount: number;
}

interface ElementSnapshot {
  nodeType: 1;
  id: string;
  tag: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
  rect: ElementRect;
  childNodes: SnapshotNode[];
  content?: string;
  placeholderUrl?: string;
}

type SnapshotNode = ElementSnapshot | TextSnapshot;

interface CaptureTree {
  root: ElementSnapshot;
  documentTitle?: string;
  documentRect: Rect;
  viewportRect: Rect;
  devicePixelRatio: number;
}

// Self-closing HTML tags
const SELF_CLOSING_TAGS = ['img', 'input', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];

/**
 * Convert styles object to CSS string
 */
function stylesToCSS(styles: Record<string, string>): string {
  return Object.entries(styles)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}

/**
 * Format HTML attributes
 */
function formatAttributes(attributes: Record<string, string>, tag: string): string {
  const attrs: string[] = [];
  
  for (const [key, value] of Object.entries(attributes)) {
    // Skip style attribute as we handle it separately
    if (key === 'style') continue;
    
    // Handle special attributes
    if (value) {
      attrs.push(`${key}="${escapeHtml(value)}"`);
    }
  }
  
  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Recursively convert a snapshot node to HTML
 */
function nodeToHTML(node: SnapshotNode, indent: number = 0): string {
  // Text node
  if (node.nodeType === 3) {
    const textNode = node as TextSnapshot;
    const text = textNode.text || '';
    return text.trim() ? escapeHtml(text) : '';
  }
  
  // Element node
  if (node.nodeType === 1) {
    const elementNode = node as ElementSnapshot;
    const tag = (elementNode.tag || 'div').toLowerCase();
    const style = stylesToCSS(elementNode.styles || {});
    const attrs = formatAttributes(elementNode.attributes || {}, tag);
    const styleAttr = style ? ` style="${escapeHtml(style)}"` : '';
    
    // Process children
    const children = (elementNode.childNodes || [])
      .map(child => nodeToHTML(child, indent + 2))
      .filter(child => child.trim() !== '')
      .join('\n');
    
    const indentStr = ' '.repeat(indent);
    
    // Self-closing tags
    if (SELF_CLOSING_TAGS.includes(tag)) {
      return `${indentStr}<${tag}${attrs}${styleAttr} />`;
    }
    
    // Element with children
    if (children) {
      return `${indentStr}<${tag}${attrs}${styleAttr}>\n${children}\n${indentStr}</${tag}>`;
    }
    
    // Empty element
    return `${indentStr}<${tag}${attrs}${styleAttr}></${tag}>`;
  }
  
  return '';
}

/**
 * Convert CaptureTree to complete HTML document
 */
export function captureTreeToHTML(captureTree: CaptureTree): string {
  const title = captureTree.documentTitle || 'Exported Design';
  const bodyContent = nodeToHTML(captureTree.root, 4);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

/**
 * Convert CaptureTree to JSON string
 */
export function captureTreeToJSON(captureTree: CaptureTree): string {
  return JSON.stringify(captureTree, null, 2);
}

export class CodeGenService {
  /**
   * Generate React component from capture
   */
  async generateReact(
    _page: PageCapture,
    captureTree: CaptureTree
  ): Promise<string> {
    const html = captureTreeToHTML(captureTree);
    
    // Generate a simple React component that renders the HTML structure
    const componentName = 'ExportedComponent';
    
    return `import React from 'react';

/**
 * Auto-generated React Component
 * Original title: ${captureTree.documentTitle || 'Untitled'}
 */
export default function ${componentName}() {
  return (
    <div 
      dangerouslySetInnerHTML={{ 
        __html: \`${escapeTemplateLiteral(html)}\` 
      }} 
    />
  );
}`;
  }

  /**
   * Generate Vue component from capture
   */
  async generateVue(
    _page: PageCapture,
    captureTree: CaptureTree
  ): Promise<string> {
    const html = captureTreeToHTML(captureTree);
    
    // Extract body content
    const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/);
    const bodyContent = bodyMatch ? bodyMatch[1].trim() : '';
    
    return `<template>
  <div class="exported-component">
${bodyContent.split('\n').map(line => '    ' + line).join('\n')}
  </div>
</template>

<script>
/**
 * Auto-generated Vue Component
 * Original title: ${captureTree.documentTitle || 'Untitled'}
 */
export default {
  name: 'ExportedComponent',
  data() {
    return {};
  }
};
</script>

<style scoped>
* { margin: 0; padding: 0; box-sizing: border-box; }
.exported-component {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>`;
  }

  /**
   * Generate HTML from capture
   */
  async generateHTML(
    _page: PageCapture,
    captureTree: CaptureTree
  ): Promise<string> {
    return captureTreeToHTML(captureTree);
  }

  /**
   * Generate JSON from capture
   */
  async generateJSON(
    _page: PageCapture,
    captureTree: CaptureTree
  ): Promise<string> {
    return captureTreeToJSON(captureTree);
  }
}

/**
 * Escape string for template literal
 */
function escapeTemplateLiteral(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

/**
 * Create a code generation service instance
 */
export function createCodeGenService(): CodeGenService {
  return new CodeGenService();
}
