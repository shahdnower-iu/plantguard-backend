// src/modules/notifications/notifications.controller.ts

import { Router, Request, Response } from 'express';
import { NotificationType, NotificationStatus } from '@prisma/client';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import prisma from '../../config/connectionDb';
import {
  getUserNotifications,
  markNotificationRead,
  markAllRead,
  getUnreadCount,
  checkCareReminders,
  checkUpcomingTasks,
  checkHealthDeclines,
  sendWeeklyReports,
} from './notifications.service';

const router = Router();
router.use(authMiddleware);

// GET /api/notifications
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const onlyUnread = req.query.unread === 'true';
  const notifications = await getUserNotifications(req.user!.userId, onlyUnread);
  res.json({ notifications });
}));

// GET /api/notifications/unread-count
router.get('/unread-count', asyncHandler(async (req: Request, res: Response) => {
  const count = await getUnreadCount(req.user!.userId);
  res.json({ count });
}));

// POST /api/notifications/:id/read
router.post('/:id/read', asyncHandler(async (req: Request, res: Response) => {
  await markNotificationRead(req.params.id, req.user!.userId);
  res.json({ message: 'Marked as read' });
}));

// POST /api/notifications/read-all
router.post('/read-all', asyncHandler(async (req: Request, res: Response) => {
  await markAllRead(req.user!.userId);
  res.json({ message: 'All notifications marked as read' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG ENDPOINTS — Remove or restrict to admin before production
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/notifications/debug/test-db-write
// Step 1 of debugging: verifies raw Prisma write works at all.
// If this fails → schema or DB connection issue.
// If this succeeds but jobs produce nothing → bug is in service logic.
router.post('/debug/test-db-write', asyncHandler(async (req: Request, res: Response) => {
  console.log('[Debug] Attempting raw prisma.notification.create...');
  try {
    const record = await prisma.notification.create({
      data: {
        userId: req.user!.userId,
        type:   NotificationType.TASK_REMINDER,
        status: NotificationStatus.PENDING,
        title:  '[Debug] DB write test',
        body:   'Direct write to verify Prisma + Neon connectivity.',
      },
      select: { notification_id: true, createdAt: true },
    });
    console.log(`[Debug] ✓ Created: ${record.notification_id}`);
    res.json({ success: true, id: record.notification_id, createdAt: record.createdAt });
  } catch (err) {
    console.error('[Debug] ✗ Failed:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
}));

// POST /api/notifications/debug/run-care-reminders
// Manually trigger the unified due-soon + overdue check.
// Use this instead of waiting for the 5-minute cron — watch server logs.
router.post('/debug/run-care-reminders', asyncHandler(async (_req: Request, res: Response) => {
  console.log('[Debug] Manually triggering checkCareReminders()...');
  try {
    await checkCareReminders();
    res.json({ success: true, message: 'checkCareReminders() completed — check server logs' });
  } catch (err) {
    console.error('[Debug] checkCareReminders() threw:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
}));

// POST /api/notifications/debug/run-upcoming-check
router.post('/debug/run-upcoming-check', asyncHandler(async (_req: Request, res: Response) => {
  console.log('[Debug] Manually triggering checkUpcomingTasks()...');
  try {
    await checkUpcomingTasks();
    res.json({ success: true, message: 'checkUpcomingTasks() completed — check server logs' });
  } catch (err) {
    console.error('[Debug] checkUpcomingTasks() threw:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
}));

// POST /api/notifications/debug/run-health-check
router.post('/debug/run-health-check', asyncHandler(async (_req: Request, res: Response) => {
  console.log('[Debug] Manually triggering checkHealthDeclines()...');
  try {
    await checkHealthDeclines();
    res.json({ success: true, message: 'checkHealthDeclines() completed — check server logs' });
  } catch (err) {
    console.error('[Debug] checkHealthDeclines() threw:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
}));

// POST /api/notifications/debug/run-weekly-report
router.post('/debug/run-weekly-report', asyncHandler(async (_req: Request, res: Response) => {
  console.log('[Debug] Manually triggering sendWeeklyReports()...');
  try {
    await sendWeeklyReports();
    res.json({ success: true, message: 'sendWeeklyReports() completed — check server logs' });
  } catch (err) {
    console.error('[Debug] sendWeeklyReports() threw:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
}));

export default router;