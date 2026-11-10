// src/modules/user/user.controller.ts

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { validate, emailSchema, passwordSchema } from '../../middleware/validation';
import { upload } from '../../middleware/upload';
import {
  getUserProfile,
  updateUserProfile,
  updateProfileImage,
  changePassword,
  softDeleteAccount,
  getSubscriptionStatus,
  adminUpgradeToPro,
  getSeasonalTip,
} from './user.service';

const router = Router();
router.use(authMiddleware);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  firstName:   z.string().min(1).optional(),
  lastName:    z.string().min(1).optional(),
  phoneNumber: z.string().optional(),
  country:     z.string().optional(),
  city:        z.string().optional(),
  timezone:    z.string().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword:     passwordSchema,
});

// ─── Profile ──────────────────────────────────────────────────────────────────

// GET /api/user/profile
router.get('/profile', asyncHandler(async (req: Request, res: Response) => {
  const user = await getUserProfile(req.user!.userId);
  res.json({ user });
}));

// PUT /api/user/profile
router.put('/profile', validate(updateProfileSchema), asyncHandler(async (req: Request, res: Response) => {
  const user = await updateUserProfile(req.user!.userId, req.body);
  res.json({ user });
}));

// POST /api/user/profile/image  — multipart/form-data, field: image
router.post(
  '/profile/image',
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Image file is required', code: 'VALIDATION_ERROR' });
      return;
    }
    const imageUrl = await updateProfileImage(req.user!.userId, req.file.buffer);
    res.json({ imageUrl });
  }),
);

// PUT /api/user/password
router.put('/password', validate(changePasswordSchema), asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  await changePassword(req.user!.userId, currentPassword, newPassword);
  res.json({ message: 'Password updated successfully' });
}));

// DELETE /api/user/account
router.delete('/account', asyncHandler(async (req: Request, res: Response) => {
  await softDeleteAccount(req.user!.userId);
  res.json({ message: 'Account deleted' });
}));

// ─── Subscription ─────────────────────────────────────────────────────────────

// GET /api/user/subscription
router.get('/subscription', asyncHandler(async (req: Request, res: Response) => {
  const status = await getSubscriptionStatus(req.user!.userId);
  res.json(status);
}));

// POST /api/user/upgrade  — admin/testing only
router.post('/upgrade', asyncHandler(async (req: Request, res: Response) => {
  const days = Number(req.body.days) || 30;
  await adminUpgradeToPro(req.user!.userId, days);
  res.json({ message: `Upgraded to PRO for ${days} days` });
}));

// ─── Seasonal tip ─────────────────────────────────────────────────────────────
//
// GET /api/user/seasonal-tip
//
// Optional query parameters (override the user's saved profile values):
//   ?city=Cairo&country=Egypt
//
// Priority: query param → DB profile value → "no location" fallback
//
router.get('/seasonal-tip', asyncHandler(async (req: Request, res: Response) => {
  // Extract optional location overrides from the query string
  const city    = typeof req.query.city    === 'string' ? req.query.city    : undefined;
  const country = typeof req.query.country === 'string' ? req.query.country : undefined;

  const result = await getSeasonalTip(req.user!.userId, { city, country });
  res.json(result);
}));

export default router;