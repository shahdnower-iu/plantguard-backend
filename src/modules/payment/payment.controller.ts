// src/modules/payment/payment.controller.ts

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validation';
import { createPayment, confirmPayment, getPaymentHistory } from './payment.service';

const router = Router();
router.use(authMiddleware);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createPaymentSchema = z.object({
  amount:      z.number().positive('Amount must be positive'),
  currency:    z.string().length(3).default('USD'),
  plan:        z.literal('PRO'),
  // Duration expressed in days — frontend can offer 30/90/365 options
  durationDays: z.number().int().min(1).max(365).default(30),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/payment  — create a payment intent
// Returns a reference code valid for 30 minutes.
router.post(
  '/',
  validate(createPaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await createPayment(req.user!.userId, req.body);
    res.status(201).json({
      message: 'Payment created. Use the reference to confirm within 30 minutes.',
      ...result,
    });
  }),
);

// POST /api/payment/:ref/confirm  — simulate payment confirmation → activate PRO
// If already PRO, days are added on top of the existing subscription end date.
router.post(
  '/:ref/confirm',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await confirmPayment(req.params.ref, req.user!.userId);
    res.json({
      message:             'Payment confirmed. PRO access activated.',
      subscriptionEndDate: result.subscriptionEndDate,
      daysAdded:           result.daysAdded,
    });
  }),
);

// GET /api/payment/history
router.get(
  '/history',
  asyncHandler(async (req: Request, res: Response) => {
    const payments = await getPaymentHistory(req.user!.userId);
    res.json({ payments });
  }),
);

export default router;
