// src/modules/chat/chat.controller.ts

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validation';
import { upload, uploadToCloudinary } from '../../middleware/upload';
import { ValidationError } from '../../utils/errors';
import {
  sendMessage,
  createSession,
  getUserSessions,
  getSessionMessages,
  deleteSession,
} from './chat.service';

const router = Router();
router.use(authMiddleware);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const sendMessageSchema = z.object({
  message:   z.string().min(1).max(4000),
  sessionId: z.string().min(1).optional().nullable().transform(v => v ?? undefined),
  model:     z.string().optional(),
  imageUrl:  z.string().url().optional(),   // pre-uploaded Cloudinary URL
});

const createSessionSchema = z.object({
  title:    z.string().min(1).max(100).optional(),
  model:    z.string().optional(),
  // Optional scan context — all three must be provided together if used
  plantId:  z.string().optional(),
  scanId:   z.string().optional(),
  scanType: z.enum(['disease', 'spread']).optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/chat/sessions — create a new session (optionally linked to a scan)
router.post(
  '/sessions',
  validate(createSessionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const session = await createSession({ userId: req.user!.userId, ...req.body });
    res.status(201).json({ session });
  }),
);

// POST /api/chat — send a message (creates session if sessionId not provided)
// Supports two content types:
//   1. application/json  — { message, sessionId?, model?, imageUrl? }
//   2. multipart/form-data — same fields + optional "image" file
router.post(
  '/',
  upload.single('image'),   // multer runs even for JSON (no-op if no file)
  asyncHandler(async (req: Request, res: Response) => {
    // If a file was uploaded, push it to Cloudinary and set imageUrl in body
    if (req.file) {
      const userId = req.user!.userId;
      req.body.imageUrl = await uploadToCloudinary(
        req.file.buffer,
        `plantguard/${userId}/chat`,
        `msg_${Date.now()}`
      );
    }

    // Validate after potential imageUrl injection
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(', '));
    }

    const { message, sessionId, model, imageUrl } = parsed.data;

    const result = await sendMessage({
      userId:         req.user!.userId,
      message,
      sessionId,
      requestedModel: model,
      imageUrl,
    });

    res.status(200).json(result);
  }),
);

// GET /api/chat/sessions — list all sessions (sidebar)
router.get(
  '/sessions',
  asyncHandler(async (req: Request, res: Response) => {
    const sessions = await getUserSessions(req.user!.userId);
    res.json({ sessions });
  }),
);

// GET /api/chat/sessions/:id/messages — load messages for a session
router.get(
  '/sessions/:id/messages',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await getSessionMessages(req.params.id, req.user!.userId);
    res.json(data);
  }),
);

// DELETE /api/chat/sessions/:id
router.delete(
  '/sessions/:id',
  asyncHandler(async (req: Request, res: Response) => {
    await deleteSession(req.params.id, req.user!.userId);
    res.json({ message: 'Session deleted' });
  }),
);

export default router;
