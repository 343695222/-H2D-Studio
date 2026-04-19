import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '..', '.env');

// Mask API key for display (e.g., "sk-abc...xyz")
function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 10) return '';
  const prefix = apiKey.slice(0, 7);
  const suffix = apiKey.slice(-4);
  return `${prefix}...${suffix}`;
}

// GET /api/settings - Get current settings (with masked API key)
router.get('/', (_req, res) => {
  try {
    // Read from environment variables (loaded by dotenv)
    const apiKey = process.env.AI_API_KEY || '';
    const settings = {
      ai: {
        provider: process.env.AI_PROVIDER || 'openai',
        apiKey: maskApiKey(apiKey),
        baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.AI_MODEL || 'gpt-4o',
      },
      server: {
        port: parseInt(process.env.PORT || '3200', 10),
        host: process.env.HOST || '127.0.0.1',
      },
    };

    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error reading settings:', error);
    res.status(500).json({ success: false, error: 'Failed to read settings' });
  }
});

// PUT /api/settings - Update settings
router.put('/', (req, res) => {
  try {
    const { ai } = req.body;

    if (!ai || typeof ai !== 'object') {
      res.status(400).json({ success: false, error: 'Invalid settings format' });
      return;
    }

    // Read current .env content
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    // Update environment variables
    const updates: Record<string, string> = {
      AI_PROVIDER: ai.provider || 'openai',
      AI_API_KEY: ai.apiKey || '',
      AI_BASE_URL: ai.baseUrl || 'https://api.openai.com/v1',
      AI_MODEL: ai.model || 'gpt-4o',
    };

    // Update or append each variable
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const line = `${key}=${value}`;

      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, line);
      } else {
        envContent += `\n${line}`;
      }
    }

    // Write back to .env
    fs.writeFileSync(envPath, envContent.trim() + '\n');

    // Update in-memory environment variables
    for (const [key, value] of Object.entries(updates)) {
      process.env[key] = value;
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        ai: {
          provider: updates.AI_PROVIDER,
          apiKey: maskApiKey(updates.AI_API_KEY),
          baseUrl: updates.AI_BASE_URL,
          model: updates.AI_MODEL,
        },
      },
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// POST /api/settings/test-ai - Test AI connection
router.post('/test-ai', async (_req, res) => {
  try {
    const provider = process.env.AI_PROVIDER || 'openai';
    const apiKey = process.env.AI_API_KEY || '';
    const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.AI_MODEL || 'gpt-4o';

    if (!apiKey) {
      res.status(400).json({ success: false, error: 'AI API key is not configured' });
      return;
    }

    // Test connection by listing models or making a simple request
    let testUrl: string;
    if (provider === 'openai' || provider === 'custom') {
      testUrl = `${baseUrl}/models`;
    } else if (provider === 'anthropic') {
      testUrl = 'https://api.anthropic.com/v1/models';
    } else {
      testUrl = `${baseUrl}/models`;
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      delete headers['Authorization'];
    }

    const response = await fetch(testUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(502).json({
        success: false,
        error: 'AI connection test failed',
        details: `HTTP ${response.status}: ${errorText}`,
      });
      return;
    }

    const data = await response.json() as { data?: Array<{ id: string }> };
    res.json({
      success: true,
      message: 'AI connection successful',
      data: {
        provider,
        model,
        availableModels: Array.isArray(data.data) ? data.data.slice(0, 5).map((m) => m.id) : undefined,
      },
    });
  } catch (error) {
    console.error('Error testing AI connection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test AI connection',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
