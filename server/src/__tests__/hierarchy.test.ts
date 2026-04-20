import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getPageHierarchy,
  setPageParent,
  getPageHierarchyTree,
  deletePageFromHierarchy,
  createProject,
  savePage,
  ensureDataDir,
} from '../services/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// Minimal valid capture tree for savePage
const minimalCaptureTree = {
  root: {
    nodeType: 1,
    tag: 'div',
    childNodes: [],
    rect: { x: 0, y: 0, width: 100, height: 100 },
    styles: {},
    attributes: {},
  },
};

let projectId: string;

beforeEach(() => {
  ensureDataDir();
  const project = createProject('test-hierarchy', 'test');
  projectId = project.id;
});

afterEach(() => {
  // Clean up test project
  const projectDir = path.join(DATA_DIR, 'projects', projectId);
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

describe('getPageHierarchy', () => {
  it('returns empty object when no hierarchy file exists', () => {
    const hierarchy = getPageHierarchy(projectId);
    expect(hierarchy).toEqual({});
  });

  it('returns stored hierarchy after setPageParent', () => {
    const page = savePage(projectId, { name: 'Page A', url: 'https://a.com' }, minimalCaptureTree);
    setPageParent(projectId, page.id, null);
    const hierarchy = getPageHierarchy(projectId);
    expect(hierarchy[page.id]).toBeNull();
  });
});

describe('setPageParent', () => {
  it('sets a page as top-level (parentId = null)', () => {
    const page = savePage(projectId, { name: 'Page A', url: 'https://a.com' }, minimalCaptureTree);
    const result = setPageParent(projectId, page.id, null);
    expect(result).toBe(true);
    expect(getPageHierarchy(projectId)[page.id]).toBeNull();
  });

  it('sets a page as child of another page', () => {
    const parent = savePage(projectId, { name: 'Parent', url: 'https://parent.com' }, minimalCaptureTree);
    const child = savePage(projectId, { name: 'Child', url: 'https://child.com' }, minimalCaptureTree);
    setPageParent(projectId, parent.id, null);
    const result = setPageParent(projectId, child.id, parent.id);
    expect(result).toBe(true);
    expect(getPageHierarchy(projectId)[child.id]).toBe(parent.id);
  });

  it('rejects direct cycle (A → B → A)', () => {
    const a = savePage(projectId, { name: 'A', url: 'https://a.com' }, minimalCaptureTree);
    const b = savePage(projectId, { name: 'B', url: 'https://b.com' }, minimalCaptureTree);
    setPageParent(projectId, a.id, null);
    setPageParent(projectId, b.id, a.id);
    // Now try to set A's parent to B — would create A→B→A cycle
    const result = setPageParent(projectId, a.id, b.id);
    expect(result).toBe(false);
    // Hierarchy should be unchanged
    expect(getPageHierarchy(projectId)[a.id]).toBeNull();
  });

  it('rejects indirect cycle (A → B → C → A)', () => {
    const a = savePage(projectId, { name: 'A', url: 'https://a.com' }, minimalCaptureTree);
    const b = savePage(projectId, { name: 'B', url: 'https://b.com' }, minimalCaptureTree);
    const c = savePage(projectId, { name: 'C', url: 'https://c.com' }, minimalCaptureTree);
    setPageParent(projectId, a.id, null);
    setPageParent(projectId, b.id, a.id);
    setPageParent(projectId, c.id, b.id);
    // Try to set A's parent to C — would create A→C→B→A cycle
    const result = setPageParent(projectId, a.id, c.id);
    expect(result).toBe(false);
  });

  it('allows setting self-parent to null', () => {
    const a = savePage(projectId, { name: 'A', url: 'https://a.com' }, minimalCaptureTree);
    setPageParent(projectId, a.id, null);
    const result = setPageParent(projectId, a.id, null);
    expect(result).toBe(true);
  });
});

describe('getPageHierarchyTree', () => {
  it('returns empty array when no hierarchy exists', () => {
    const tree = getPageHierarchyTree(projectId);
    expect(tree).toEqual([]);
  });

  it('returns flat list when all pages are top-level', () => {
    const a = savePage(projectId, { name: 'A', url: 'https://a.com' }, minimalCaptureTree);
    const b = savePage(projectId, { name: 'B', url: 'https://b.com' }, minimalCaptureTree);
    setPageParent(projectId, a.id, null);
    setPageParent(projectId, b.id, null);
    const tree = getPageHierarchyTree(projectId);
    expect(tree).toHaveLength(2);
    expect(tree.every(n => n.parentId === null)).toBe(true);
    expect(tree.every(n => n.children.length === 0)).toBe(true);
  });

  it('builds correct parent-child tree', () => {
    const parent = savePage(projectId, { name: 'Parent', url: 'https://parent.com' }, minimalCaptureTree);
    const child = savePage(projectId, { name: 'Child', url: 'https://child.com' }, minimalCaptureTree);
    setPageParent(projectId, parent.id, null);
    setPageParent(projectId, child.id, parent.id);
    const tree = getPageHierarchyTree(projectId);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(parent.id);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe(child.id);
  });

  it('populates name, url, screenshotPath, hasEdited from page summaries', () => {
    const page = savePage(projectId, { name: 'My Page', url: 'https://mypage.com' }, minimalCaptureTree);
    setPageParent(projectId, page.id, null);
    const tree = getPageHierarchyTree(projectId);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('My Page');
    expect(tree[0].url).toBe('https://mypage.com');
    expect(tree[0].hasEdited).toBe(false);
  });

  it('total node count equals hierarchy entry count', () => {
    const a = savePage(projectId, { name: 'A', url: 'https://a.com' }, minimalCaptureTree);
    const b = savePage(projectId, { name: 'B', url: 'https://b.com' }, minimalCaptureTree);
    const c = savePage(projectId, { name: 'C', url: 'https://c.com' }, minimalCaptureTree);
    setPageParent(projectId, a.id, null);
    setPageParent(projectId, b.id, a.id);
    setPageParent(projectId, c.id, b.id);
    const hierarchy = getPageHierarchy(projectId);
    const tree = getPageHierarchyTree(projectId);
    // Count all nodes in tree recursively
    function countNodes(nodes: typeof tree): number {
      return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
    }
    expect(countNodes(tree)).toBe(Object.keys(hierarchy).length);
  });
});

describe('deletePageFromHierarchy', () => {
  it('removes page from hierarchy', () => {
    const a = savePage(projectId, { name: 'A', url: 'https://a.com' }, minimalCaptureTree);
    setPageParent(projectId, a.id, null);
    deletePageFromHierarchy(projectId, a.id);
    const hierarchy = getPageHierarchy(projectId);
    expect(hierarchy[a.id]).toBeUndefined();
  });

  it('promotes direct children to top-level when parent is deleted', () => {
    const parent = savePage(projectId, { name: 'Parent', url: 'https://parent.com' }, minimalCaptureTree);
    const child1 = savePage(projectId, { name: 'Child1', url: 'https://child1.com' }, minimalCaptureTree);
    const child2 = savePage(projectId, { name: 'Child2', url: 'https://child2.com' }, minimalCaptureTree);
    setPageParent(projectId, parent.id, null);
    setPageParent(projectId, child1.id, parent.id);
    setPageParent(projectId, child2.id, parent.id);
    deletePageFromHierarchy(projectId, parent.id);
    const hierarchy = getPageHierarchy(projectId);
    expect(hierarchy[parent.id]).toBeUndefined();
    expect(hierarchy[child1.id]).toBeNull();
    expect(hierarchy[child2.id]).toBeNull();
  });

  it('does not affect grandchildren (only promotes direct children)', () => {
    const gp = savePage(projectId, { name: 'GP', url: 'https://gp.com' }, minimalCaptureTree);
    const parent = savePage(projectId, { name: 'Parent', url: 'https://parent.com' }, minimalCaptureTree);
    const child = savePage(projectId, { name: 'Child', url: 'https://child.com' }, minimalCaptureTree);
    setPageParent(projectId, gp.id, null);
    setPageParent(projectId, parent.id, gp.id);
    setPageParent(projectId, child.id, parent.id);
    // Delete the middle node (parent)
    deletePageFromHierarchy(projectId, parent.id);
    const hierarchy = getPageHierarchy(projectId);
    // child was a direct child of parent, so it gets promoted to null
    expect(hierarchy[child.id]).toBeNull();
    // gp is unaffected
    expect(hierarchy[gp.id]).toBeNull();
  });

  it('is a no-op for non-existent page', () => {
    const a = savePage(projectId, { name: 'A', url: 'https://a.com' }, minimalCaptureTree);
    setPageParent(projectId, a.id, null);
    deletePageFromHierarchy(projectId, 'non-existent-id');
    const hierarchy = getPageHierarchy(projectId);
    expect(hierarchy[a.id]).toBeNull();
  });
});
