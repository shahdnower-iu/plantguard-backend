// src/modules/notifications/notifications.job.ts
//
// Schedule overview:
//   Every 5 min   — checkCareReminders() — due-soon + overdue detection
//   07:00 daily   — checkUpcomingTasks() — morning digest email
//   08:05 daily   — checkHealthDeclines()
//   Monday 08:00  — sendWeeklyReports()
//
// All daily/weekly jobs run in Africa/Cairo timezone.
// Set NOTIFICATIONS_ENABLED=false in .env to disable all jobs.

import cron from 'node-cron';
import {
  checkCareReminders,
  checkUpcomingTasks,
  checkHealthDeclines,
  sendWeeklyReports,
} from './notifications.service';

// Wraps any cron callback: logs start/finish with timing, catches all errors.
// Without this, an unhandled rejection inside a cron tick is silently swallowed.
function safeJob(label: string, fn: () => Promise<void>): () => void {
  return async () => {
    const start = Date.now();
    console.log(`[Notifications] ▶ ${label}`);
    try {
      await fn();
      console.log(`[Notifications] ✓ ${label} — ${Date.now() - start}ms`);
    } catch (err) {
      console.error(`[Notifications] ✗ ${label} — unhandled error:`, err);
    }
  };
}

export function startNotificationJobs(): void {
  if (process.env.NOTIFICATIONS_ENABLED === 'false') {
    console.log('[Notifications] Jobs disabled via NOTIFICATIONS_ENABLED=false');
    return;
  }

  const tz = { timezone: 'Africa/Cairo' };

  // ── Every 5 minutes — due-soon + overdue care reminders ───────────────────
  //
  // Why every 5 minutes instead of every minute?
  //   The "due soon" detection window is 35 minutes wide (5 min lookback +
  //   30 min lookahead), so a ±5 min jitter is completely irrelevant.
  //   Running every minute added 5× the DB queries for no reliability gain.
  //
  // Why no timezone option here?
  //   The function compares UTC timestamps directly — no timezone conversion needed.
  //   nextDue is stored as an absolute UTC moment; we compare it to Date.now() UTC.
  cron.schedule(
    '*/5 * * * *',
    safeJob('care reminders (due-soon + overdue)', checkCareReminders)
  );

  // ── 07:00 daily — morning digest email ────────────────────────────────────
  cron.schedule(
    '0 7 * * *',
    safeJob('daily task digest', checkUpcomingTasks),
    tz
  );

  // ── 08:05 daily — health decline check ────────────────────────────────────
  cron.schedule(
    '5 8 * * *',
    safeJob('health decline check', checkHealthDeclines),
    tz
  );

  // ── Monday 08:00 — weekly report ──────────────────────────────────────────
  cron.schedule(
    '0 8 * * 1',
    safeJob('weekly report', sendWeeklyReports),
    tz
  );

  console.log('[Notifications] ✓ Jobs started:');
  console.log('  Every 5 min  — due-soon + overdue care reminders');
  console.log('  07:00 daily  — morning task digest');
  console.log('  08:05 daily  — health decline check');
  console.log('  08:00 Monday — weekly report\n');
}