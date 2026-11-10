// src/modules/scan/spread.controller.ts

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { scanUpload } from '../../middleware/upload';
import { scanRateLimiter } from '../../middleware/rateLimiter';
import { ValidationError } from '../../utils/errors';
import { performSpreadScan, getSpreadHistory } from './spread.service';

const router = Router();
router.use(authMiddleware);

// POST /api/spread/analyze
// multipart/form-data fields:
//   images[]  (1–4 files, required) — plant photos
//   plantId   (string, optional)    — link to an existing plant in your garden;
//                                      if omitted a new plant is created automatically
//
// Response includes:
//   data.plantId      — the plant this scan is linked to (new or existing)
//   data.plantCreated — true when the plant was auto-created from this scan
router.post(
  '/analyze',
  scanRateLimiter,
  scanUpload.array('images', 4),
  asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) throw new ValidationError('At least one image is required');

    const buffers   = files.map(f => f.buffer);
    const mimeTypes = files.map(f => f.mimetype);
    const plantId   = typeof req.body.plantId === 'string' ? req.body.plantId : undefined;

    const result = await performSpreadScan(req.user!.userId, plantId, buffers, mimeTypes);
    res.status(200).json({ success: true, data: result });
  }),
);

// GET /api/spread/history?plantId=optional
router.get(
  '/history',
  asyncHandler(async (req: Request, res: Response) => {
    const plantId = typeof req.query.plantId === 'string' ? req.query.plantId : undefined;
    res.json({ scans: await getSpreadHistory(req.user!.userId, plantId) });
  }),
);

export default router;