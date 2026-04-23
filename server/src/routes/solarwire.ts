import { Router } from 'express';
import { parse } from '../lib/solarwire/index.js';
import {
  solarwireToCaptureTree,
  captureTreeToSolarWire,
  solarwireToSVG,
} from '../services/solarwireConverter.js';

const router = Router();

// POST /api/solarwire/parse — Parse DSL text into AST
router.post('/parse', (req, res) => {
  try {
    const { dsl } = req.body;

    if (typeof dsl !== 'string') {
      res.status(400).json({
        success: false,
        error: { message: 'Missing or invalid "dsl" field: expected a string' },
      });
      return;
    }

    const ast = parse(dsl);
    res.json({ success: true, ast });
  } catch (err: unknown) {
    const e = err as { message?: string; line?: number; column?: number };
    res.status(400).json({
      success: false,
      error: {
        message: e.message ?? 'Failed to parse SolarWire DSL',
        line: e.line,
        column: e.column,
      },
    });
  }
});

// POST /api/solarwire/render-svg — Render DSL to SVG string
router.post('/render-svg', (req, res) => {
  try {
    const { dsl } = req.body;

    if (typeof dsl !== 'string') {
      res.status(400).json({
        success: false,
        error: { message: 'Missing or invalid "dsl" field: expected a string' },
      });
      return;
    }

    const result = solarwireToSVG(dsl);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Error rendering SolarWire SVG:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error while rendering SVG' },
    });
  }
});

// POST /api/solarwire/to-capture-tree — Convert DSL to CaptureTree
router.post('/to-capture-tree', (req, res) => {
  try {
    const { dsl, title, width, height } = req.body;

    if (typeof dsl !== 'string') {
      res.status(400).json({
        success: false,
        error: { message: 'Missing or invalid "dsl" field: expected a string' },
      });
      return;
    }

    const result = solarwireToCaptureTree(dsl, { title, width, height });

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Error converting SolarWire to CaptureTree:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error during conversion' },
    });
  }
});

// POST /api/solarwire/from-capture-tree — Convert CaptureTree to DSL string
router.post('/from-capture-tree', (req, res) => {
  try {
    const { captureTree } = req.body;

    if (!captureTree || typeof captureTree !== 'object') {
      res.status(400).json({
        success: false,
        error: { message: 'Missing or invalid "captureTree" field: expected an object' },
      });
      return;
    }

    const dsl = captureTreeToSolarWire(captureTree);
    res.json({ success: true, dsl });
  } catch (error) {
    console.error('Error converting CaptureTree to SolarWire:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error during conversion' },
    });
  }
});

export default router;
