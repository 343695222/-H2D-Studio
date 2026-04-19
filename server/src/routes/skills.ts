import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import os from 'os';
import * as skillStorage from '../services/skillStorage.js';
import type { Skill } from '../types.js';

const router = Router();

// 配置 multer 存储
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB 限制
  },
  fileFilter: (_req, file, cb) => {
    // 只接受 .zip 文件
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are allowed'));
    }
  },
});

// GET /api/skills — 获取所有skill列表
router.get('/', (_req, res) => {
  try {
    const skills = skillStorage.getAllSkills();
    // 返回时去掉 content 字段，减少传输量
    const skillsList = skills.map(({ content, ...rest }) => rest);
    res.json({
      success: true,
      skills: skillsList,
    });
  } catch (error) {
    console.error('Error getting skills:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: 'Failed to get skills',
      message: errorMessage,
    });
  }
});

// GET /api/skills/:name — 获取单个skill内容
router.get('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const skill = skillStorage.getSkill(name);
    
    if (!skill) {
      return res.status(404).json({
        success: false,
        error: 'Skill not found',
      });
    }
    
    res.json({
      success: true,
      skill,
    });
  } catch (error) {
    console.error('Error getting skill:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: 'Failed to get skill',
      message: errorMessage,
    });
  }
});

// POST /api/skills — 创建新skill
router.post('/', (req, res) => {
  try {
    const { name, content, title, description } = req.body;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: name',
      });
    }
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: content',
      });
    }
    
    // 检查名称是否合法
    const safeName = name.replace(/[\\/:*?"<>|]/g, '_');
    if (safeName !== name) {
      return res.status(400).json({
        success: false,
        error: 'Invalid skill name. Name cannot contain: \\\\ / : * ? " < > |',
      });
    }
    
    // 检查是否已存在
    if (skillStorage.skillExists(name)) {
      return res.status(409).json({
        success: false,
        error: `Skill '${name}' already exists`,
      });
    }
    
    const skill = skillStorage.createSkill(name, content, title, description);
    
    if (!skill) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create skill',
      });
    }
    
    res.status(201).json({
      success: true,
      skill,
    });
  } catch (error) {
    console.error('Error creating skill:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: 'Failed to create skill',
      message: errorMessage,
    });
  }
});

// PUT /api/skills/:name — 更新skill
router.put('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const { content, title, description } = req.body;
    
    // 检查是否存在
    if (!skillStorage.skillExists(name)) {
      return res.status(404).json({
        success: false,
        error: 'Skill not found',
      });
    }
    
    // 至少需要一个更新字段
    if (content === undefined && title === undefined && description === undefined) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update. Provide content, title, or description',
      });
    }
    
    const updates: Partial<{ content: string; title: string; description: string }> = {};
    if (content !== undefined) updates.content = content;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    
    const skill = skillStorage.updateSkill(name, updates);
    
    if (!skill) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update skill',
      });
    }
    
    res.json({
      success: true,
      skill,
    });
  } catch (error) {
    console.error('Error updating skill:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: 'Failed to update skill',
      message: errorMessage,
    });
  }
});

// DELETE /api/skills/:name — 删除skill
router.delete('/:name', (req, res) => {
  try {
    const { name } = req.params;
    
    // 检查是否存在
    if (!skillStorage.skillExists(name)) {
      return res.status(404).json({
        success: false,
        error: 'Skill not found',
      });
    }
    
    const success = skillStorage.deleteSkill(name);
    
    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete skill',
      });
    }
    
    res.json({
      success: true,
      message: `Skill '${name}' deleted successfully`,
    });
  } catch (error) {
    console.error('Error deleting skill:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete skill',
      message: errorMessage,
    });
  }
});

// POST /api/skills/upload — 上传 skill 压缩包
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    // 创建临时目录
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-upload-'));
    const zipPath = path.join(tempDir, 'upload.zip');
    
    // 保存上传的文件
    fs.writeFileSync(zipPath, req.file.buffer);
    
    // 解压 zip
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempDir, true);
    
    // 读取 skill-config.json（如果存在）
    let config: { skills?: Array<{ file: string; name?: string; title?: string; description?: string }> } | null = null;
    const configPath = path.join(tempDir, 'skill-config.json');
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (e) {
        console.warn('Failed to parse skill-config.json:', e);
      }
    }
    
    // 收集所有 .md 文件
    const imported: Array<{ name: string; title: string; action: 'created' | 'updated' }> = [];
    const skipped: string[] = [];
    const errors: Array<{ file: string; error: string }> = [];
    
    // 读取解压后的所有文件
    const entries = fs.readdirSync(tempDir);
    
    for (const entry of entries) {
      const entryPath = path.join(tempDir, entry);
      const stat = fs.statSync(entryPath);
      
      if (stat.isDirectory()) {
        // 处理子目录中的文件
        const subEntries = fs.readdirSync(entryPath);
        for (const subEntry of subEntries) {
          if (subEntry.endsWith('.md')) {
            const filePath = path.join(entryPath, subEntry);
            processSkillFile(filePath, subEntry, config, imported, errors);
          } else if (subEntry !== 'skill-config.json') {
            skipped.push(`${entry}/${subEntry}`);
          }
        }
      } else if (entry.endsWith('.md')) {
        // 处理根目录中的 .md 文件
        processSkillFile(entryPath, entry, config, imported, errors);
      } else if (entry !== 'skill-config.json' && entry !== 'upload.zip') {
        skipped.push(entry);
      }
    }
    
    // 清理临时目录
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to cleanup temp directory:', e);
    }
    
    res.json({
      success: true,
      imported,
      skipped,
      errors,
    });
  } catch (error) {
    console.error('Error uploading skills:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload skills',
      message: errorMessage,
    });
  }
});

// 辅助函数：处理单个 skill 文件
function processSkillFile(
  filePath: string,
  fileName: string,
  config: { skills?: Array<{ file: string; name?: string; title?: string; description?: string }> } | null,
  imported: Array<{ name: string; title: string; action: 'created' | 'updated' }>,
  errors: Array<{ file: string; error: string }>
): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // 从文件名获取默认 name
    const defaultName = fileName.replace(/\.md$/, '');
    
    // 查找配置中的元数据
    let metadata: { name?: string; title?: string; description?: string } | undefined;
    if (config?.skills) {
      const fileBaseName = path.basename(fileName);
      metadata = config.skills.find(s => 
        s.file === fileBaseName || 
        s.file === fileName ||
        s.file === path.basename(filePath)
      );
    }
    
    const name = metadata?.name || defaultName;
    const result = skillStorage.importSkillFromContent(name, content, {
      title: metadata?.title,
      description: metadata?.description,
    });
    
    imported.push({
      name: result.skill.name,
      title: result.skill.title,
      action: result.action,
    });
  } catch (error) {
    errors.push({
      file: fileName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// GET /api/skills/export — 导出所有 skill 为 zip 压缩包
router.get('/export', (_req, res) => {
  try {
    const skills = skillStorage.getAllSkillsForExport();
    
    if (skills.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No skills to export',
      });
    }
    
    // 创建临时目录
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-export-'));
    
    // 写入所有 skill 文件
    const skillEntries: Array<{ file: string; name: string; title: string; description?: string }> = [];
    
    for (const skill of skills) {
      const fileName = `${skill.name}.md`;
      const filePath = path.join(tempDir, fileName);
      fs.writeFileSync(filePath, skill.content, 'utf-8');
      
      skillEntries.push({
        file: fileName,
        name: skill.name,
        title: skill.title,
        description: skill.description,
      });
    }
    
    // 生成 skill-config.json
    const config = {
      name: 'H2D Skills Export',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      skills: skillEntries,
    };
    fs.writeFileSync(path.join(tempDir, 'skill-config.json'), JSON.stringify(config, null, 2), 'utf-8');
    
    // 创建 zip 文件
    const zip = new AdmZip();
    zip.addLocalFolder(tempDir);
    
    // 生成 zip 数据
    const zipBuffer = zip.toBuffer();
    
    // 清理临时目录
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to cleanup temp directory:', e);
    }
    
    // 设置响应头
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="h2d-skills-${timestamp}.zip"`);
    res.setHeader('Content-Length', zipBuffer.length);
    
    res.send(zipBuffer);
  } catch (error) {
    console.error('Error exporting skills:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: 'Failed to export skills',
      message: errorMessage,
    });
  }
});

export default router;
