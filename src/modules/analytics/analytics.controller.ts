// src/modules/analytics/analytics.controller.ts

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { ValidationError } from '../../utils/errors';
import { getPlantTimeline, getMonthlyReport, getPlantsOverview } from './analytics.service';

const router = Router();
router.use(authMiddleware);

// ─── GET /api/analytics/overview ─────────────────────────────────────────────
// All user's plants ranked by urgency (most sick first).
// Use this to build the main dashboard health summary card.
router.get('/overview', asyncHandler(async (req: Request, res: Response) => {
  const data = await getPlantsOverview(req.user!.userId);
  res.json(data);
}));

// ─── GET /api/analytics/plant/:plantId/timeline ───────────────────────────────
// Full health timeline for a single plant — every scan score plotted over time.
// Use this to build the per-plant health chart on the plant detail page.
router.get('/plant/:plantId/timeline', asyncHandler(async (req: Request, res: Response) => {
  const data = await getPlantTimeline(req.params.plantId, req.user!.userId);
  res.json(data);
}));

// ─── GET /api/analytics/report?month=YYYY-MM ─────────────────────────────────
// Monthly summary report. Defaults to current month if no param given.
// Use this to build the monthly report card / email.
router.get('/report', asyncHandler(async (req: Request, res: Response) => {
  let month = typeof req.query.month === 'string' ? req.query.month : '';

  // Default to current month if not provided
  if (!month) {
    const now = new Date();
    month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  // Validate format YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new ValidationError('month must be in format YYYY-MM (e.g. 2026-04)');
  }

  const data = await getMonthlyReport(req.user!.userId, month);
  res.json(data);
}));

export default router;
