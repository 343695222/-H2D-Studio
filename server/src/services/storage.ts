import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Project, PageCapture, PageSummary, PageKnowledgeSummary } from '../types.js';
import { generateId, getCurrentTimestamp } from '../utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

// 验证 CaptureTree 格式是否合法
function isValidCaptureTree(tree: unknown): boolean {
  if (!tree || typeof tree !== 'object') return false;
  const t = tree as Record<string, unknown>;
  const root = t.root;
  if (!root || typeof root !== 'object') return false;
  const r = root as Record<string, unknown>;
  if (r.nodeType === undefined || r.nodeType === null) return false;
  if (r.nodeType === 1) {
    if (!r.tag || typeof r.tag !== 'string') return false;
    if (!Array.isArray(r.childNodes)) return false;
    if (!r.rect || typeof r.rect !== 'object') return false;
  }
  return true;
}

// Ensure data directories exist
export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  }
}

// Extract color from style string
function extractColors(style: string): string[] {
  const colors: string[] = [];
  // Match hex colors
  const hexMatches = style.match(/#[a-fA-F0-9]{3,8}/g);
  if (hexMatches) colors.push(...hexMatches);
  // Match rgb/rgba colors
  const rgbMatches = style.match(/rgba?\([^)]+\)/g);
  if (rgbMatches) colors.push(...rgbMatches);
  // Match common color names
  const colorNames = ['red', 'blue', 'green', 'black', 'white', 'gray', 'grey', 'yellow', 'orange', 'purple', 'pink', 'brown', 'cyan', 'magenta'];
  for (const name of colorNames) {
    const regex = new RegExp(`\\b${name}\\b`, 'gi');
    if (regex.test(style)) colors.push(name);
  }
  return [...new Set(colors)].slice(0, 5);
}

// Extract font families from style string
function extractFontFamilies(style: string): string[] {
  const fonts: string[] = [];
  const match = style.match(/font-family:\s*([^;]+)/i);
  if (match) {
    const fontList = match[1].split(',').map(f => f.trim().replace(/["']/g, ''));
    fonts.push(...fontList.slice(0, 3));
  }
  return fonts;
}

// Extract spacing values from style string
function extractSpacing(style: string): number[] {
  const values: number[] = [];
  const matches = style.match(/(\d+(?:\.\d+)?)(?:px|rem|em)/g);
  if (matches) {
    for (const match of matches) {
      const num = parseFloat(match);
      if (num > 0 && num < 200) values.push(num);
    }
  }
  return values;
}

// Generate knowledge summary from capture tree
function generatePageKnowledgeSummary(captureTree: unknown): PageKnowledgeSummary {
  const tree = captureTree as Record<string, unknown>;
  
  // Extract document title
  const documentTitle = (tree.documentTitle as string) || '';
  
  // The actual CaptureTree structure: { root: { nodeType:1, tag, childNodes, styles:{...} } }
  const root = (tree.root as Record<string, unknown>) || tree;
  
  // Extract top-level components from root's childNodes
  const topComponents: Array<{ tag: string; id?: string; className?: string }> = [];
  const rootChildren = (root.childNodes as Array<Record<string, unknown>>) || [];
  for (const child of rootChildren.slice(0, 20)) {
    if (child.tag) {
      const attrs = (child.attributes as Record<string, string>) || {};
      topComponents.push({
        tag: String(child.tag),
        id: attrs.id,
        className: attrs.class,
      });
    }
  }
  
  // Extract visible text (recursive) - TextSnapshot has { nodeType: 3, text: "..." }
  let visibleText = '';
  function extractText(node: Record<string, unknown>): void {
    if (visibleText.length >= 2000) return;
    
    // TextSnapshot node: nodeType === 3
    if (node.nodeType === 3 && node.text) {
      const text = String(node.text).trim();
      if (text && text !== '\n' && text.length > 1) {
        visibleText += text + ' ';
      }
    }
    
    // Recurse into childNodes (not children)
    const nodeChildren = node.childNodes as Array<Record<string, unknown>>;
    if (Array.isArray(nodeChildren)) {
      for (const child of nodeChildren) {
        extractText(child);
        if (visibleText.length >= 2000) break;
      }
    }
  }
  extractText(root);
  visibleText = visibleText.slice(0, 2000).trim();
  
  // Extract styles and tags
  const allTags: string[] = [];
  const colorSet = new Set<string>();
  const fontSet = new Set<string>();
  let flexCount = 0;
  let gridCount = 0;
  let blockCount = 0;
  
  function analyzeNode(node: Record<string, unknown>): void {
    if (node.tag) {
      allTags.push(String(node.tag));
    }
    // styles is an object like { display: "flex", color: "rgb(0,0,0)", ... }
    const styles = node.styles as Record<string, string> | undefined;
    if (styles && typeof styles === 'object') {
      const display = styles.display || '';
      if (display === 'flex' || display === 'inline-flex') flexCount++;
      else if (display === 'grid' || display === 'inline-grid') gridCount++;
      else if (display === 'block') blockCount++;
      
      // Extract colors
      if (styles.color && styles.color.startsWith('rgb')) colorSet.add(styles.color);
      if (styles.backgroundColor && styles.backgroundColor.startsWith('rgb') && styles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        colorSet.add(styles.backgroundColor);
      }
      
      // Extract fonts
      if (styles.fontFamily) {
        const firstFont = styles.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        if (firstFont) fontSet.add(firstFont);
      }
    }
    
    const nodeChildren = node.childNodes as Array<Record<string, unknown>>;
    if (Array.isArray(nodeChildren)) {
      for (const child of nodeChildren) {
        analyzeNode(child);
      }
    }
  }
  analyzeNode(root);
  
  // Determine layout type
  let layoutType: 'flex' | 'grid' | 'block' | 'mixed' = 'block';
  const total = flexCount + gridCount + blockCount;
  if (total > 0) {
    if (flexCount > total * 0.5) layoutType = 'flex';
    else if (gridCount > total * 0.5) layoutType = 'grid';
    else if (flexCount > 0 || gridCount > 0) layoutType = 'mixed';
  }
  
  // Extract main colors and fonts from collected sets
  const colors = Array.from(colorSet).slice(0, 10);
  const fontFamilies = Array.from(fontSet);
  
  // No need for regex-based extraction since we parse styles objects directly
  const spacingValues: number[] = [];
  
  // Component stats
  const byTag: Record<string, number> = {};
  for (const tag of allTags) {
    byTag[tag] = (byTag[tag] || 0) + 1;
  }
  
  return {
    documentTitle,
    topComponents,
    visibleText,
    mainStyles: {
      primaryColors: colors,
      fontFamilies: fontFamilies.length > 0 ? fontFamilies : ['system-ui'],
      spacingRange: {
        min: spacingValues.length > 0 ? Math.min(...spacingValues) : 0,
        max: spacingValues.length > 0 ? Math.max(...spacingValues) : 0,
      },
    },
    layoutType,
    componentStats: {
      total: allTags.length,
      byTag,
    },
  };
}

// Get project directory path
function getProjectDir(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId);
}

// Get project meta file path
function getProjectMetaPath(projectId: string): string {
  return path.join(getProjectDir(projectId), 'meta.json');
}

// Get pages directory path
function getPagesDir(projectId: string): string {
  return path.join(getProjectDir(projectId), 'pages');
}

// Get page directory path
function getPageDir(projectId: string, pageId: string): string {
  return path.join(getPagesDir(projectId), pageId);
}

// Create a new project
export function createProject(name: string, description: string): Project {
  const id = generateId();
  const timestamp = getCurrentTimestamp();

  const project: Project = {
    id,
    name,
    description,
    createdAt: timestamp,
    updatedAt: timestamp,
    pageCount: 0,
  };

  const projectDir = getProjectDir(id);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(getPagesDir(id), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'prd'), { recursive: true });

  fs.writeFileSync(getProjectMetaPath(id), JSON.stringify(project, null, 2));

  return project;
}

// Get all projects
export function getProjects(): Project[] {
  ensureDataDir();

  if (!fs.existsSync(PROJECTS_DIR)) {
    return [];
  }

  const projectIds = fs.readdirSync(PROJECTS_DIR);
  const projects: Project[] = [];

  for (const id of projectIds) {
    const project = getProject(id);
    if (project) {
      projects.push(project);
    }
  }

  // Sort by updatedAt descending
  return projects.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

// Get a single project by ID
export function getProject(id: string): Project | null {
  const metaPath = getProjectMetaPath(id);

  if (!fs.existsSync(metaPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(content) as Project;
  } catch (error) {
    console.error(`Error reading project ${id}:`, error);
    return null;
  }
}

// Update a project
export function updateProject(
  id: string,
  updates: Partial<Pick<Project, 'name' | 'description'>>
): Project | null {
  const project = getProject(id);
  if (!project) {
    return null;
  }

  try {
    if (updates.name !== undefined) {
      project.name = updates.name.trim();
    }
    if (updates.description !== undefined) {
      project.description = updates.description.trim();
    }
    project.updatedAt = getCurrentTimestamp();

    fs.writeFileSync(getProjectMetaPath(id), JSON.stringify(project, null, 2));
    return project;
  } catch (error) {
    console.error(`Error updating project ${id}:`, error);
    return null;
  }
}

// Delete a project
export function deleteProject(id: string): boolean {
  const projectDir = getProjectDir(id);

  if (!fs.existsSync(projectDir)) {
    return false;
  }

  try {
    fs.rmSync(projectDir, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error(`Error deleting project ${id}:`, error);
    return false;
  }
}

// Save a page capture
export function savePage(
  projectId: string,
  pageData: { name: string; url: string; description?: string },
  captureTree: unknown,
  screenshotBase64?: string
): PageCapture {
  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const pageId = generateId();
  const timestamp = getCurrentTimestamp();

  const page: PageCapture = {
    id: pageId,
    projectId,
    name: pageData.name,
    url: pageData.url,
    description: pageData.description,
    capturedAt: timestamp,
  };

  const pageDir = getPageDir(projectId, pageId);
  fs.mkdirSync(pageDir, { recursive: true });

  // Save capture.json
  fs.writeFileSync(
    path.join(pageDir, 'capture.json'),
    JSON.stringify(captureTree, null, 2)
  );

  // Generate knowledge summary
  const knowledgeSummary = generatePageKnowledgeSummary(captureTree);
  
  // Save summary.json
  const summary: PageSummary = {
    id: pageId,
    name: pageData.name,
    url: pageData.url,
    capturedAt: timestamp,
    screenshotPath: screenshotBase64 ? `/data/projects/${projectId}/pages/${pageId}/screenshot.png` : '',
    hasEdited: false,
    knowledgeSummary,
  };
  fs.writeFileSync(
    path.join(pageDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  // Save screenshot if provided
  if (screenshotBase64) {
    // Strip data URL prefix if present (e.g., "data:image/png;base64,")
    const base64Data = screenshotBase64.includes(',') 
      ? screenshotBase64.split(',')[1] 
      : screenshotBase64;
    const screenshotBuffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(path.join(pageDir, 'screenshot.png'), screenshotBuffer);
  }

  // Update project page count and updatedAt
  project.pageCount = getPages(projectId).length + 1;
  project.updatedAt = timestamp;
  fs.writeFileSync(getProjectMetaPath(projectId), JSON.stringify(project, null, 2));

  return page;
}

// Get all pages for a project
export function getPages(projectId: string): PageSummary[] {
  const pagesDir = getPagesDir(projectId);

  if (!fs.existsSync(pagesDir)) {
    return [];
  }

  const pageIds = fs.readdirSync(pagesDir);
  const pages: PageSummary[] = [];

  for (const pageId of pageIds) {
    const summaryPath = path.join(pagesDir, pageId, 'summary.json');
    if (fs.existsSync(summaryPath)) {
      try {
        const content = fs.readFileSync(summaryPath, 'utf-8');
        pages.push(JSON.parse(content) as PageSummary);
      } catch (error) {
        console.error(`Error reading page ${pageId}:`, error);
      }
    }
  }

  // Sort by capturedAt descending
  return pages.sort((a, b) =>
    new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
  );
}

// Get a single page with full capture data
export function getPage(
  projectId: string,
  pageId: string
): { page: PageCapture; captureTree: unknown; editedTree?: unknown } | null {
  const pagesDir = getPagesDir(projectId);
  const pageDir = path.join(pagesDir, pageId);

  if (!fs.existsSync(pageDir)) {
    return null;
  }

  try {
    // Read summary.json for page metadata
    const summaryContent = fs.readFileSync(
      path.join(pageDir, 'summary.json'),
      'utf-8'
    );
    const summary = JSON.parse(summaryContent) as PageSummary;

    // Read capture.json
    const captureContent = fs.readFileSync(
      path.join(pageDir, 'capture.json'),
      'utf-8'
    );
    const captureTree = JSON.parse(captureContent);

    // Read edited.json if exists (with format validation)
    let editedTree: unknown | undefined;
    const editedPath = path.join(pageDir, 'edited.json');
    if (fs.existsSync(editedPath)) {
      try {
        const editedContent = fs.readFileSync(editedPath, 'utf-8');
        const parsed = JSON.parse(editedContent);
        // 验证 edited.json 格式是否合法
        if (isValidCaptureTree(parsed)) {
          editedTree = parsed;
        } else {
          console.warn(`edited.json for page ${pageId} has invalid CaptureTree format, falling back to capture.json`);
          // 删除坏的 edited.json，防止后续继续读到坏数据
          try {
            fs.unlinkSync(editedPath);
            console.log(`Deleted invalid edited.json for page ${pageId}`);
          } catch (unlinkErr) {
            console.error(`Failed to delete invalid edited.json for page ${pageId}:`, unlinkErr);
          }
          // 更新 summary.json 的 hasEdited 标记
          try {
            summary.hasEdited = false;
            fs.writeFileSync(path.join(pageDir, 'summary.json'), JSON.stringify(summary, null, 2));
          } catch { /* ignore */ }
        }
      } catch (parseErr) {
        console.warn(`edited.json for page ${pageId} is not valid JSON, falling back to capture.json:`, parseErr);
        try {
          fs.unlinkSync(editedPath);
        } catch { /* ignore */ }
      }
    }

    const page: PageCapture = {
      id: summary.id,
      projectId,
      name: summary.name,
      url: summary.url,
      capturedAt: summary.capturedAt,
    };

    return { page, captureTree, editedTree };
  } catch (error) {
    console.error(`Error reading page ${pageId}:`, error);
    return null;
  }
}

// Update a page with edited data
export function updatePage(
  projectId: string,
  pageId: string,
  editedTree: unknown
): boolean {
  const pageDir = getPageDir(projectId, pageId);

  if (!fs.existsSync(pageDir)) {
    return false;
  }

  // 验证 editedTree 格式，防止保存坏数据
  if (!isValidCaptureTree(editedTree)) {
    console.error(`updatePage: editedTree for page ${pageId} has invalid CaptureTree format, refusing to save`);
    return false;
  }

  try {
    // Save edited.json
    fs.writeFileSync(
      path.join(pageDir, 'edited.json'),
      JSON.stringify(editedTree, null, 2)
    );

    // Update summary.json
    const summaryPath = path.join(pageDir, 'summary.json');
    const summaryContent = fs.readFileSync(summaryPath, 'utf-8');
    const summary = JSON.parse(summaryContent) as PageSummary;
    summary.hasEdited = true;
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    // Update project updatedAt
    const project = getProject(projectId);
    if (project) {
      project.updatedAt = getCurrentTimestamp();
      fs.writeFileSync(
        getProjectMetaPath(projectId),
        JSON.stringify(project, null, 2)
      );
    }

    return true;
  } catch (error) {
    console.error(`Error updating page ${pageId}:`, error);
    return false;
  }
}

// Delete a page
export function deletePage(projectId: string, pageId: string): boolean {
  const pageDir = getPageDir(projectId, pageId);

  if (!fs.existsSync(pageDir)) {
    return false;
  }

  try {
    fs.rmSync(pageDir, { recursive: true, force: true });

    // Update project page count
    const project = getProject(projectId);
    if (project) {
      project.pageCount = getPages(projectId).length;
      project.updatedAt = getCurrentTimestamp();
      fs.writeFileSync(
        getProjectMetaPath(projectId),
        JSON.stringify(project, null, 2)
      );
    }

    return true;
  } catch (error) {
    console.error(`Error deleting page ${pageId}:`, error);
    return false;
  }
}

export function buildProjectContext(projectId: string): string {
  const project = getProject(projectId);
  if (!project) return '';
  
  const pages = getPages(projectId);
  
  // 1. 项目基本信息
  let context = `## 项目: ${project.name}\n`;
  if (project.description) context += `描述: ${project.description}\n`;
  context += `页面数: ${pages.length}\n\n`;
  
  // 2. 全局设计规范（聚合所有页面的 knowledgeSummary）
  const allColors: string[] = [];
  const allFonts: string[] = [];
  const allTags: Record<string, number> = {};
  let totalComponents = 0;
  
  // 3. 每个页面摘要
  context += `## 已捕获页面\n\n`;
  for (const page of pages) {
    context += `### ${page.name}\n`;
    context += `- URL: ${page.url}\n`;
    context += `- 捕获时间: ${page.capturedAt}\n`;
    
    const ks = page.knowledgeSummary;
    if (ks) {
      context += `- 布局: ${ks.layoutType}\n`;
      context += `- 组件数: ${ks.componentStats.total}\n`;
      totalComponents += ks.componentStats.total;
      
      // 收集颜色和字体
      if (ks.mainStyles?.primaryColors) allColors.push(...ks.mainStyles.primaryColors);
      if (ks.mainStyles?.fontFamilies) allFonts.push(...ks.mainStyles.fontFamilies);
      
      // 收集标签统计
      if (ks.componentStats?.byTag) {
        for (const [tag, count] of Object.entries(ks.componentStats.byTag)) {
          allTags[tag] = (allTags[tag] || 0) + count;
        }
      }
      
      // 可见文本摘要（前200字）
      if (ks.visibleText) {
        context += `- 核心文本: ${ks.visibleText.slice(0, 200)}...\n`;
      }
    }
    context += '\n';
  }
  
  // 4. 设计规范汇总
  const uniqueColors = [...new Set(allColors)].slice(0, 8);
  const uniqueFonts = [...new Set(allFonts)].slice(0, 5);
  
  context += `## 设计规范\n`;
  context += `- 主色调: ${uniqueColors.join(', ') || '未知'}\n`;
  context += `- 字体: ${uniqueFonts.join(', ') || '未知'}\n`;
  context += `- 总组件数: ${totalComponents}\n`;
  context += `- 主要组件: ${Object.entries(allTags).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => `${tag}(${count})`).join(', ')}\n`;
  
  return context;
}
