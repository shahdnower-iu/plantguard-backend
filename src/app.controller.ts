// src/app.controller.ts

import { Application, Request, Response } from 'express';
import authRoutes         from './modules/auth/auth.controller';
import userRoutes         from './modules/user/user.controller';
import paymentRoutes      from './modules/payment/payment.controller';
import plantRoutes        from './modules/plant/plant.controller';
import detectRoutes       from './modules/scan/detect.controller';
import spreadRoutes       from './modules/scan/spread.controller';
import chatRoutes         from './modules/chat/chat.controller';
import analyticsRoutes    from './modules/analytics/analytics.controller';
import notificationRoutes from './modules/notifications/notifications.controller';

export function registerRoutes(app: Application): void {
  app.use('/api/auth',          authRoutes);
  app.use('/api/user',          userRoutes);
  app.use('/api/payment',       paymentRoutes);
  app.use('/api/plants',        plantRoutes);
  app.use('/api/detect',        detectRoutes);
  app.use('/api/spread',        spreadRoutes);
  app.use('/api/chat',          chatRoutes);
  app.use('/api/analytics',     analyticsRoutes);
  app.use('/api/notifications', notificationRoutes);

  app.get('/api', (_req: Request, res: Response) => {
    res.json({
      name:    'PlantGuard API',
      version: '5.0.0',
      freeTier: {
        diseaseScans: '15 per week',
        spreadScans:  '10 per week',
      },
      endpoints: {
        auth: [
          'POST /api/auth/register',
          'POST /api/auth/verify-email',
          'POST /api/auth/login',
          'POST /api/auth/google',
          'POST /api/auth/refresh',
          'POST /api/auth/logout',
        ],
        user: [
          'GET    /api/user/profile',
          'PUT    /api/user/profile',
          'POST   /api/user/profile/image    — multipart, field: image',
          'PUT    /api/user/password',
          'DELETE /api/user/account',
          'GET    /api/user/subscription',
          'POST   /api/user/upgrade          — admin/testing: force PRO',
        ],
        payment: [
          'POST /api/payment                 — create payment intent',
          'POST /api/payment/:ref/confirm    — confirm → activate/extend PRO',
          'GET  /api/payment/history',
        ],
        plants: [
          'GET    /api/plants',
          'GET    /api/plants/:id',
          'POST   /api/plants                — optional image (multipart)',
          'PUT    /api/plants/:id',
          'DELETE /api/plants/:id',
          'GET    /api/plants/:id/care-schedule',
          'POST   /api/plants/:id/care-schedule',
          'POST   /api/plants/:id/care-schedule/:sid/complete',
          'DELETE /api/plants/:id/care-schedule/:sid',
        ],
        scans: [
          'POST /api/detect/predict          — 1 image → YOLOv8 + Gemini advice',
          'GET  /api/detect/history',
          'POST /api/spread/analyze          — 1–4 images → Gemini Vision spread analysis',
          'GET  /api/spread/history',
        ],
        chat: [
          'POST   /api/chat/sessions         — create session (optional scan context)',
          'POST   /api/chat                  — send message (JSON or multipart with image)',
          'GET    /api/chat/sessions',
          'GET    /api/chat/sessions/:id/messages',
          'DELETE /api/chat/sessions/:id',
        ],
        analytics: [
          'GET /api/analytics/overview',
          'GET /api/analytics/plant/:plantId/timeline',
          'GET /api/analytics/report?month=YYYY-MM',
        ],
        notifications: [
          'GET  /api/notifications',
          'GET  /api/notifications?unread=true',
          'GET  /api/notifications/unread-count',
          'POST /api/notifications/:id/read',
          'POST /api/notifications/read-all',
        ],
      },
    });
  });
}
