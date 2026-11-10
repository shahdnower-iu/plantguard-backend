// src/modules/scan/detect.controller.ts

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { upload } from '../../middleware/upload';
import { scanLimiter } from '../../middleware/rateLimiter';
import { ValidationError } from '../../utils/errors';
import { performScan, getDetectHistory } from './detect.service';

const router = Router();
router.use(authMiddleware);

// POST /api/detect/predict
// multipart/form-data:
//   image   (file, required)    — plant photo
//   plantId (string, optional)  — link to a plant in your garden
router.post(
  '/predict',
  scanLimiter,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new ValidationError('Image is required');

    const result = await performScan(
      req.user!.userId,
      req.body.plantId ?? undefined,
      req.file.buffer
    );

    res.status(200).json({ success: true, data: result });
  }),
);

// GET /api/detect/history?plantId=optional
router.get(
  '/history',
  asyncHandler(async (req: Request, res: Response) => {
    const plantId = typeof req.query.plantId === 'string' ? req.query.plantId : undefined;
    res.json({ scans: await getDetectHistory(req.user!.userId, plantId) });
  }),
);

export default router;
