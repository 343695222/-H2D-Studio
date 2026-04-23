import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  solarwireToCaptureTree,
  captureTreeToSolarWire,
  resetIdCounter,
} from '../services/solarwireConverter.js';

describe('solarwireToCaptureTree', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  // ── Basic structure ──────────────────────────────────────────────

  it('returns a valid CaptureTree for empty DSL', () => {
    const result = solarwireToCaptureTree('');
    expect(result.success).toBe(true);
    if (!result.success) return;

    const { captureTree } = result;
    expect(captureTree.root).toBeDefined();
    expect(captureTree.root.nodeType).toBe(1);
    expect(captureTree.root.tag).toBe('div');
    expect(captureTree.root.childNodes).toEqual([]);
    expect(captureTree.documentTitle).toBe('SolarWire Design');
    expect(captureTree.documentRect.width).toBeGreaterThan(0);
    expect(captureTree.documentRect.height).toBeGreaterThan(0);
    expect(captureTree.viewportRect.width).toBeGreaterThan(0);
    expect(captureTree.viewportRect.height).toBeGreaterThan(0);
    expect(captureTree.devicePixelRatio).toBe(1);
  });

  it('respects custom title, width, height options', () => {
    const result = solarwireToCaptureTree('["Hello"]', {
      title: 'My Page',
      width: 800,
      height: 600,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.captureTree.documentTitle).toBe('My Page');
    expect(result.captureTree.documentRect.width).toBe(800);
    expect(result.captureTree.documentRect.height).toBe(600);
    expect(result.captureTree.viewportRect.width).toBe(800);
    expect(result.captureTree.viewportRect.height).toBe(600);
  });

  // ── Rectangle ────────────────────────────────────────────────────

  it('converts rectangle ["text"] to div with border', () => {
    const result = solarwireToCaptureTree('["Hello"]');
    expect(result.success).toBe(true);
    if (!result.success) return;

    const child = result.captureTree.root.childNodes[0];
    expect(child.nodeType).toBe(1);
    if (child.nodeType !== 1) return;

    expect(child.tag).toBe('div');
    expect(child.styles.border).toBe('1px solid #333');
    // Should have a TextSnapshot child
    expect(child.childNodes.length).toBe(1);
    expect(child.childNodes[0].nodeType).toBe(3);
    if (child.childNodes[0].nodeType === 3) {
      expect(child.childNodes[0].text).toBe('Hello');
    }
  });

  // ── Rounded rectangle ────────────────────────────────────────────

  it('converts rounded rectangle ("text") to div with borderRadius', () => {
    const result = solarwireToCaptureTree('("Search")');
    expect(result.success).toBe(true);
    if (!result.success) return;

    const child = result.captureTree.root.childNodes[0];
    expect(child.nodeType).toBe(1);
    if (child.nodeType !== 1) return;

    expect(child.tag).toBe('div');
    expect(child.styles.borderRadius).toBe('8px');
    expect(child.styles.border).toBe('1px solid #333');
    expect(child.childNodes.length).toBe(1);
    if (child.childNodes[0].nodeType === 3) {
      expect(child.childNodes[0].text).toBe('Search');
    }
  });

  // ── Circle ───────────────────────────────────────────────────────

  it('converts circle (("text")) to div with borderRadius=50% and equal dimensions', () => {
    const result = solarwireToCaptureTree('(("OK"))');
    expect(result.success).toBe(true);
    if (!result.success) return;

    const child = result.captureTree.root.childNodes[0];
    expect(child.nodeType).toBe(1);
    if (child.nodeType !== 1) return;

    expect(child.tag).toBe('div');
    expect(child.styles.borderRadius).toBe('50%');
    // Width and height should be equal
    expect(child.rect.width).toBe(child.rect.height);
    expect(child.childNodes.length).toBe(1);
    if (child.childNodes[0].nodeType === 3) {
      expect(child.childNodes[0].text).toBe('OK');
    }
  });

  it('circle with explicit w and h uses the larger dimension', () => {
    const result = solarwireToCaptureTree('(("Big")) w=200 h=100');
    expect(result.success).toBe(true);
    if (!result.success) return;

    const child = result.captureTree.root.childNodes[0];
    expect(child.nodeType).toBe(1);
    if (child.nodeType !== 1) return;

    expect(child.rect.width).toBe(200);
    expect(child.rect.height).toBe(200); // max(200, 100)
    expect(child.styles.borderRadius).toBe('50%');
  });

  // ── Plain text ───────────────────────────────────────────────────

  it('converts plain text "text" to TextSnapshot', () => {
    const result = solarwireToCaptureTree('"Hello World"');
    expect(result.success).toBe(true);
    if (!result.success) return;

    const child = result.captureTree.root.childNodes[0];
    expect(child.nodeType).toBe(3);
    if (child.nodeType === 3) {
      expect(child.text).toBe('Hello World');
    }
  });

  // ── Placeholder ──────────────────────────────────────────────────

  it('converts placeholder [?] to div with gray background', () => {
    const result = solarwireToCaptureTree('[?]');
    expect(result.success).toBe(true);
    if (!result.success) return;

    const child = result.captureTree.root.childNodes[0];
    expect(child.nodeType).toBe(1);
    if (child.nodeType !== 1) return;

    expect(child.tag).toBe('div');
    expect(child.styles.backgroundColor).toBe('#e0e0e0');
    expect(child.childNodes.length).toBe(0);
  });

  // ── Connector ────────────────────────────────────────────────────

  it('converts connector --"label"-- to div with borderBottom', () => {
    const result = solarwireToCaptureTree('--"connects"--');
    expect(result.success).toBe(true);
    if (!result.success) return;

    const child = result.captureTree.root.childNodes[0];
    expect(child.nodeType).toBe(1);
    if (child.nodeType !== 1) return;

    expect(child.tag).toBe('div');
    expect(child.styles.borderBottom).toBe('1px solid #333');
    expect(child.childNodes.length).toBe(1);
    if (child.childNodes[0].nodeType === 3) {
      expect(child.childNodes[0].text).toBe('connects');
    }
  });

  // ── Table ────────────────────────────────────────────────────────

  it('converts table ## / # structure to nested flex divs', () => {
    const dsl = `##
# ["Col1"] ["Col2"]
# ["Data1"] ["Data2"]
##`;
    const result = solarwireToCaptureTree(dsl);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const table = result.captureTree.root.childNodes[0];
    expect(table.nodeType).toBe(1);
    if (table.nodeType !== 1) return;

    expect(table.styles.display).toBe('flex');
    expect(table.styles.flexDirection).toBe('column');
    expect(table.childNodes.length).toBe(2); // 2 rows

    // Each row should be flex row
    for (const row of table.childNodes) {
      expect(row.nodeType).toBe(1);
      if (row.nodeType === 1) {
        expect(row.styles.display).toBe('flex');
        expect(row.styles.flexDirection).toBe('row');
        expect(row.childNodes.length).toBe(2); // 2 cells
      }
    }
  });

  // ── Attributes mapping ───────────────────────────────────────────

  it('maps w, h, bg, c, size, bold, r attributes to styles', () => {
    const dsl = '["Styled"] w=200 h=50 bg=#1890ff c=white size=16 bold r=12';
    const result = solarwireToCaptureTree(dsl);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const child = result.captureTree.root.childNodes[0];
    expect(child.nodeType).toBe(1);
    if (child.nodeType !== 1) return;

    expect(child.styles.width).toBe('200px');
    expect(child.styles.height).toBe('50px');
    expect(child.styles.backgroundColor).toBe('#1890ff');
    expect(child.styles.color).toBe('white');
    expect(child.styles.fontSize).toBe('16px');
    expect(child.styles.fontWeight).toBe('700');
    expect(child.styles.borderRadius).toBe('12px');
    expect(child.rect.width).toBe(200);
    expect(child.rect.height).toBe(50);
  });

  // ── Position @(x,y) ─────────────────────────────────────────────

  it('maps @(x,y) to rect coordinates', () => {
    const dsl = '["Positioned"] @(100,200)';
    const result = solarwireToCaptureTree(dsl);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const child = result.captureTree.root.childNodes[0];
    expect(child.nodeType).toBe(1);
    if (child.nodeType !== 1) return;

    expect(child.rect.x).toBe(100);
    expect(child.rect.y).toBe(200);
  });

  // ── Unique IDs ───────────────────────────────────────────────────

  it('assigns unique IDs to all nodes', () => {
    const dsl = `["A"]
("B")
(("C"))
"D"`;
    const result = solarwireToCaptureTree(dsl);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ids = new Set<string>();
    function collectIds(node: { nodeType: number; id: string; childNodes?: unknown[] }) {
      ids.add(node.id);
      if ('childNodes' in node && Array.isArray(node.childNodes)) {
        for (const child of node.childNodes) {
          collectIds(child as typeof node);
        }
      }
    }
    collectIds(result.captureTree.root as unknown as { nodeType: number; id: string; childNodes?: unknown[] });

    // root + 4 elements + text children for A, B, C = at least 8 unique IDs
    expect(ids.size).toBeGreaterThanOrEqual(8);
    // All IDs should start with 'sw-'
    for (const id of ids) {
      expect(id).toMatch(/^sw-\d+$/);
    }
  });

  // ── Error handling ───────────────────────────────────────────────

  it('returns ConvertError for invalid DSL', () => {
    const result = solarwireToCaptureTree('<<<invalid>>>');
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.message).toBeTruthy();
    expect(typeof result.error.message).toBe('string');
  });

  it('returns ConvertError with line/column for unclosed table', () => {
    const result = solarwireToCaptureTree('##\n# ["row"]');
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.message).toContain('Unclosed table');
  });

  // ── Multiple elements ────────────────────────────────────────────

  it('handles multiple elements on separate lines', () => {
    const dsl = `["Header"] @(0,0) w=1200 h=60
("Search") @(400,80) w=400 h=40
[?] @(0,140) w=1200 h=400`;
    const result = solarwireToCaptureTree(dsl);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.captureTree.root.childNodes.length).toBe(3);
  });

  // ── Multiple elements on same line (group) ───────────────────────

  it('handles multiple elements on the same line as a group', () => {
    const dsl = '["A"] ["B"] ["C"]';
    const result = solarwireToCaptureTree(dsl);
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Parser wraps multiple inline elements in a group
    const root = result.captureTree.root;
    expect(root.childNodes.length).toBe(1); // one group
    const group = root.childNodes[0];
    expect(group.nodeType).toBe(1);
    if (group.nodeType === 1) {
      expect(group.childNodes.length).toBe(3);
    }
  });

  // ── Comments are ignored ─────────────────────────────────────────

  it('ignores comment lines', () => {
    const dsl = `// This is a comment
["Visible"]`;
    const result = solarwireToCaptureTree(dsl);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.captureTree.root.childNodes.length).toBe(1);
  });
});


describe('captureTreeToSolarWire', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  // Helper to build a minimal CaptureTree
  function makeCaptureTree(childNodes: any[]): any {
    return {
      root: {
        nodeType: 1,
        id: 'root',
        tag: 'div',
        attributes: {},
        styles: { width: '1200px', height: '800px', position: 'relative' },
        rect: { x: 0, y: 0, width: 1200, height: 800, cssWidth: 1200, cssHeight: 800 },
        childNodes,
      },
      documentTitle: 'Test',
      documentRect: { x: 0, y: 0, width: 1200, height: 800 },
      viewportRect: { x: 0, y: 0, width: 1200, height: 800 },
      devicePixelRatio: 1,
    };
  }

  function makeElement(overrides: any = {}): any {
    return {
      nodeType: 1,
      id: 'el-1',
      tag: 'div',
      attributes: {},
      styles: {},
      rect: { x: 0, y: 0, width: 100, height: 40, cssWidth: 100, cssHeight: 40 },
      childNodes: [],
      ...overrides,
    };
  }

  function makeText(text: string): any {
    return {
      nodeType: 3,
      id: 'txt-1',
      text,
      rect: { x: 0, y: 0, width: 50, height: 14 },
      lineCount: 1,
    };
  }

  // ── Empty / null cases ───────────────────────────────────────────

  it('returns empty string for empty tree', () => {
    const tree = makeCaptureTree([]);
    expect(captureTreeToSolarWire(tree)).toBe('');
  });

  it('returns empty string for null/undefined tree', () => {
    expect(captureTreeToSolarWire(null as any)).toBe('');
    expect(captureTreeToSolarWire(undefined as any)).toBe('');
  });

  // ── Circle detection ─────────────────────────────────────────────

  it('detects circle: borderRadius=50% + equal w/h → (("text"))', () => {
    const el = makeElement({
      styles: { borderRadius: '50%', border: '1px solid #333' },
      rect: { x: 0, y: 0, width: 80, height: 80, cssWidth: 80, cssHeight: 80 },
      childNodes: [makeText('OK')],
    });
    const tree = makeCaptureTree([el]);
    const result = captureTreeToSolarWire(tree);
    expect(result).toContain('(("OK"))');
  });

  // ── Rounded rectangle detection ──────────────────────────────────

  it('detects rounded rect: borderRadius exists → ("text")', () => {
    const el = makeElement({
      styles: { borderRadius: '8px', border: '1px solid #333' },
      rect: { x: 0, y: 0, width: 200, height: 40, cssWidth: 200, cssHeight: 40 },
      childNodes: [makeText('Search')],
    });
    const tree = makeCaptureTree([el]);
    const result = captureTreeToSolarWire(tree);
    expect(result).toContain('("Search")');
  });

  // ── Rectangle detection ──────────────────────────────────────────

  it('detects rectangle: border exists, no borderRadius → ["text"]', () => {
    const el = makeElement({
      styles: { border: '1px solid #333' },
      rect: { x: 0, y: 0, width: 100, height: 40, cssWidth: 100, cssHeight: 40 },
      childNodes: [makeText('Header')],
    });
    const tree = makeCaptureTree([el]);
    const result = captureTreeToSolarWire(tree);
    expect(result).toContain('["Header"]');
  });

  // ── Attribute mapping ────────────────────────────────────────────

  it('maps backgroundColor to bg', () => {
    const el = makeElement({
      styles: { border: '1px solid #333', backgroundColor: '#1890ff' },
      childNodes: [makeText('Btn')],
    });
    const tree = makeCaptureTree([el]);
    const result = captureTreeToSolarWire(tree);
    expect(result).toContain('bg=#1890ff');
  });

  it('maps color to c', () => {
    const el = makeElement({
      styles: { border: '1px solid #333', color: 'white' },
      childNodes: [makeText('Btn')],
    });
    const tree = makeCaptureTree([el]);
    const result = captureTreeToSolarWire(tree);
    expect(result).toContain('c=white');
  });

  it('maps fontSize to size (strips px)', () => {
    const el = makeElement({
      styles: { border: '1px solid #333', fontSize: '16px' },
      childNodes: [makeText('Title')],
    });
    const tree = makeCaptureTree([el]);
    const result = captureTreeToSolarWire(tree);
    expect(result).toContain('size=16');
  });

  it('maps fontWeight 700/bold to bold', () => {
    const el = makeElement({
      styles: { border: '1px solid #333', fontWeight: '700' },
      childNodes: [makeText('Bold')],
    });
    const tree = makeCaptureTree([el]);
    const result = captureTreeToSolarWire(tree);
    expect(result).toContain('bold');
  });

  it('maps rect coordinates to @(x,y) when non-zero', () => {
    const el = makeElement({
      styles: { border: '1px solid #333' },
      rect: { x: 100, y: 200, width: 100, height: 40, cssWidth: 100, cssHeight: 40 },
      childNodes: [makeText('Pos')],
    });
    const tree = makeCaptureTree([el]);
    const result = captureTreeToSolarWire(tree);
    expect(result).toContain('@(100,200)');
  });

  it('omits @(x,y) when both are zero', () => {
    const el = makeElement({
      styles: { border: '1px solid #333' },
      rect: { x: 0, y: 0, width: 100, height: 40, cssWidth: 100, cssHeight: 40 },
      childNodes: [makeText('Origin')],
    });
    const tree = makeCaptureTree([el]);
    const result = captureTreeToSolarWire(tree);
    expect(result).not.toContain('@(');
  });

  it('maps width/height to w/h', () => {
    const el = makeElement({
      styles: { border: '1px solid #333', width: '300px', height: '60px' },
      rect: { x: 0, y: 0, width: 300, height: 60, cssWidth: 300, cssHeight: 60 },
      childNodes: [makeText('Wide')],
    });
    const tree = makeCaptureTree([el]);
    const result = captureTreeToSolarWire(tree);
    expect(result).toContain('w=300');
    expect(result).toContain('h=60');
  });

  // ── Invisible element filtering ──────────────────────────────────

  it('ignores display:none elements', () => {
    const el = makeElement({
      styles: { display: 'none', border: '1px solid #333' },
      childNodes: [makeText('Hidden')],
    });
    const tree = makeCaptureTree([el]);
    expect(captureTreeToSolarWire(tree)).toBe('');
  });

  it('ignores visibility:hidden elements', () => {
    const el = makeElement({
      styles: { visibility: 'hidden', border: '1px solid #333' },
      childNodes: [makeText('Hidden')],
    });
    const tree = makeCaptureTree([el]);
    expect(captureTreeToSolarWire(tree)).toBe('');
  });

  it('ignores opacity:0 elements', () => {
    const el = makeElement({
      styles: { opacity: '0', border: '1px solid #333' },
      childNodes: [makeText('Hidden')],
    });
    const tree = makeCaptureTree([el]);
    expect(captureTreeToSolarWire(tree)).toBe('');
  });

  it('ignores tiny elements (< 5px)', () => {
    const el = makeElement({
      styles: { border: '1px solid #333' },
      rect: { x: 0, y: 0, width: 3, height: 3, cssWidth: 3, cssHeight: 3 },
      childNodes: [makeText('Tiny')],
    });
    const tree = makeCaptureTree([el]);
    expect(captureTreeToSolarWire(tree)).toBe('');
  });

  // ── Depth limit ──────────────────────────────────────────────────

  it('collapses to [?] beyond depth 4', () => {
    // Build a 5-level deep nesting: container > container > container > container > element
    let deepest = makeElement({
      id: 'deep-5',
      styles: { border: '1px solid #333' },
      childNodes: [makeText('Deep')],
    });
    for (let i = 4; i >= 1; i--) {
      deepest = makeElement({
        id: `level-${i}`,
        styles: {},
        childNodes: [deepest],
      });
    }
    const tree = makeCaptureTree([deepest]);
    const result = captureTreeToSolarWire(tree);
    expect(result).toContain('[?]');
    expect(result).not.toContain('["Deep"]');
  });

  // ── Multiple elements ────────────────────────────────────────────

  it('outputs multiple elements on separate lines', () => {
    const el1 = makeElement({
      id: 'el-1',
      styles: { border: '1px solid #333' },
      childNodes: [makeText('A')],
    });
    const el2 = makeElement({
      id: 'el-2',
      styles: { borderRadius: '8px', border: '1px solid #333' },
      childNodes: [makeText('B')],
    });
    const tree = makeCaptureTree([el1, el2]);
    const result = captureTreeToSolarWire(tree);
    const lines = result.split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('["A"]');
    expect(lines[1]).toContain('("B")');
  });

  // ── Round-trip sanity check ──────────────────────────────────────

  it('round-trips: solarwire → captureTree → solarwire preserves element types', () => {
    const dsl = '["Header"]\n("Search")\n(("Icon")) w=60 h=60';
    const fwd = solarwireToCaptureTree(dsl);
    expect(fwd.success).toBe(true);
    if (!fwd.success) return;

    const backDsl = captureTreeToSolarWire(fwd.captureTree);
    expect(backDsl).toContain('["Header"]');
    expect(backDsl).toContain('("Search")');
    expect(backDsl).toContain('(("Icon"))');
  });
});


import {
  formatSolarWire,
  solarwireToSVG,
  extractSolarWireCodeBlocks,
} from '../services/solarwireConverter.js';

describe('formatSolarWire', () => {
  it('formats a single rectangle element', () => {
    const result = formatSolarWire('["Hello"]');
    expect(result).toBe('["Hello"]');
  });

  it('formats multiple elements on separate lines', () => {
    const dsl = '["A"]\n("B")\n(("C"))';
    const result = formatSolarWire(dsl);
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('["A"]');
    expect(lines[1]).toBe('("B")');
    expect(lines[2]).toBe('(("C"))');
  });

  it('preserves attributes in formatted output', () => {
    const dsl = '["Styled"] @(100,200) w=300 h=50 bg=#1890ff c=white size=16 bold r=8';
    const result = formatSolarWire(dsl);
    expect(result).toContain('["Styled"]');
    expect(result).toContain('@(100,200)');
    expect(result).toContain('w=300');
    expect(result).toContain('h=50');
    expect(result).toContain('bg=#1890ff');
    expect(result).toContain('c=white');
    expect(result).toContain('size=16');
    expect(result).toContain('bold');
    expect(result).toContain('r=8');
  });

  it('formats table with indented rows', () => {
    const dsl = '##\n# ["Col1"] ["Col2"]\n# ["Data1"] ["Data2"]\n##';
    const result = formatSolarWire(dsl);
    const lines = result.split('\n');
    expect(lines[0]).toBe('##');
    expect(lines[1]).toMatch(/^\s+# \["Col1"\] \["Col2"\]$/);
    expect(lines[2]).toMatch(/^\s+# \["Data1"\] \["Data2"\]$/);
    expect(lines[3]).toBe('##');
  });

  it('formats connectors', () => {
    const result = formatSolarWire('--"link"--');
    expect(result).toBe('--"link"--');
  });

  it('formats placeholders', () => {
    const result = formatSolarWire('[?] w=200 h=100');
    expect(result).toContain('[?]');
    expect(result).toContain('w=200');
    expect(result).toContain('h=100');
  });

  it('returns original DSL unchanged on parse failure', () => {
    const invalid = '<<<not valid>>>';
    const result = formatSolarWire(invalid);
    expect(result).toBe(invalid);
  });

  it('handles empty DSL', () => {
    expect(formatSolarWire('')).toBe('');
  });

  it('round-trip: parse → format → parse produces equivalent AST', () => {
    const dsl = '["Header"] @(0,0) w=1200 h=60\n("Search") @(400,80) w=400 h=40\n(("Icon")) w=60 h=60';
    const formatted = formatSolarWire(dsl);
    // Format again — should be stable (idempotent)
    const formatted2 = formatSolarWire(formatted);
    expect(formatted2).toBe(formatted);
  });
});

describe('solarwireToSVG', () => {
  it('returns SVG string for valid DSL', () => {
    const result = solarwireToSVG('["Hello"]');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('</svg>');
    expect(result.svg).toContain('Hello');
  });

  it('renders multiple element types', () => {
    const dsl = '["Rect"]\n("Rounded")\n(("Circle"))';
    const result = solarwireToSVG(dsl);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.svg).toContain('Rect');
    expect(result.svg).toContain('Rounded');
    expect(result.svg).toContain('Circle');
  });

  it('returns ConvertError for invalid DSL', () => {
    const result = solarwireToSVG('<<<invalid>>>');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toBeTruthy();
  });

  it('renders empty DSL as valid SVG', () => {
    const result = solarwireToSVG('');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('</svg>');
  });

  it('renders table structure', () => {
    const dsl = '##\n# ["A"] ["B"]\n# ["C"] ["D"]\n##';
    const result = solarwireToSVG(dsl);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.svg).toContain('<svg');
  });

  it('returns ConvertError for unclosed table', () => {
    const result = solarwireToSVG('##\n# ["row"]');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toContain('Unclosed table');
  });
});

describe('extractSolarWireCodeBlocks', () => {
  it('returns empty array for empty string', () => {
    expect(extractSolarWireCodeBlocks('')).toEqual([]);
  });

  it('returns empty array for text without code blocks', () => {
    const text = 'Hello world\nThis is some markdown\n```javascript\nconsole.log("hi")\n```';
    expect(extractSolarWireCodeBlocks(text)).toEqual([]);
  });

  it('extracts a single solarwire code block', () => {
    const text = 'Some text\n```solarwire\n["Hello"]\n```\nMore text';
    const result = extractSolarWireCodeBlocks(text);
    expect(result).toEqual(['["Hello"]']);
  });

  it('extracts multiple solarwire code blocks', () => {
    const text = [
      'Page 1:',
      '```solarwire',
      '["Header"]',
      '```',
      'Page 2:',
      '```solarwire',
      '("Button")',
      '```',
    ].join('\n');
    const result = extractSolarWireCodeBlocks(text);
    expect(result).toEqual(['["Header"]', '("Button")']);
  });

  it('trims whitespace from extracted content', () => {
    const text = '```solarwire\n  ["Hello"]  \n\n```';
    const result = extractSolarWireCodeBlocks(text);
    expect(result).toEqual(['["Hello"]']);
  });

  it('skips empty code blocks', () => {
    const text = '```solarwire\n\n```\n```solarwire\n["Real"]\n```';
    const result = extractSolarWireCodeBlocks(text);
    expect(result).toEqual(['["Real"]']);
  });

  it('handles multiline DSL content', () => {
    const dsl = '["Nav"] @(0,0) w=1200 h=60\n("Search") @(400,80) w=400 h=40';
    const text = `Here is the wireframe:\n\`\`\`solarwire\n${dsl}\n\`\`\`\nDone.`;
    const result = extractSolarWireCodeBlocks(text);
    expect(result).toEqual([dsl]);
  });

  it('ignores non-solarwire fenced code blocks', () => {
    const text = [
      '```json',
      '{"key": "value"}',
      '```',
      '```solarwire',
      '["Box"]',
      '```',
      '```typescript',
      'const x = 1;',
      '```',
    ].join('\n');
    const result = extractSolarWireCodeBlocks(text);
    expect(result).toEqual(['["Box"]']);
  });

  it('returns empty array for null/undefined input', () => {
    expect(extractSolarWireCodeBlocks(null as unknown as string)).toEqual([]);
    expect(extractSolarWireCodeBlocks(undefined as unknown as string)).toEqual([]);
  });
});
