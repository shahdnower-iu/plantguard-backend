// src/modules/notifications/notifications.service.ts
// Idea 7 — Smart Notification System
//
// Timing architecture (replaces the fragile 2-minute exact-match approach):
// ─────────────────────────────────────────────────────────────────────────
//  • Cron runs checkCareReminders() every 5 minutes
//  • "Due soon" window  = nextDue is between NOW-5min and NOW+30min
//    → sends a TASK_REMINDER in-app notification (no email — too intrusive)
//    → guard: skip if a TASK_REMINDER for this (userId, plantId, taskType)
//      was already sent in the last 23 hours
//  • "Overdue" window   = nextDue < NOW-24h  AND  lastCompleted is null
//    OR lastCompleted < nextDue (i.e. the task wasn't done after it was due)
//    → sends an OVERDUE_WATERING / OVERDUE_FERTILIZING notification + email
//    → guard: skip if the same overdue notification was sent in the last 3 days
//
// Why this is reliable:
//  • A ±5 min cron jitter is irrelevant — the "due soon" window is 35 minutes wide
//  • The NOW-5min lookback catches any task the cron missed on the previous tick
//  • The 23-hour guard prevents duplicates across every run within the same day
//  • All guards are DB-backed so server restarts don't cause double-sends
//
// Other alert types (unchanged):
//   HEALTH_DECLINE  — runs daily at 08:05 via checkHealthDeclines()
//   DISEASE_DETECTED — called inline from scan.service.ts
//   WEEKLY_REPORT   — runs every Monday at 08:00 via sendWeeklyReports()

// src/modules/notifications/notifications.service.ts
// Idea 7 — Smart Notification System

import { NotificationType, NotificationStatus } from '@prisma/client';
import prisma from '../../config/connectionDb';
import {
  sendTaskReminderEmail,
  sendOverdueWateringEmail,
  sendHealthDeclineEmail,
  sendDiseaseDetectedEmail,
  sendWeeklyReportEmail,
} from './notifications.email';
import { getPlantsOverview } from '../analytics/analytics.service';

// ─── Shared row types ─────────────────────────────────────────────────────────

type CareScheduleRow = {
  care_schedule_id: string;
  userId:        string;
  plantId:       string;
  taskType:      string;
  nextDue:       Date;
  lastCompleted: Date | null;
  user:  { user_id: string; email: string; firstName: string; timezone: string };
  plant: { plant_id: string; name: string };
};

// ─── In-app notification read/list ───────────────────────────────────────────

export async function getUserNotifications(userId: string, onlyUnread = false) {
  return prisma.notification.findMany({
    where: {
      userId,
      // FIX: filter by status field (not readAt) so it's consistent with how
      // markNotificationRead / markAllRead write the read state.
      // status !== READ means PENDING, SENT, and FAILED all show as "unread" —
      // which is correct: user hasn't acknowledged any of them yet.
      ...(onlyUnread ? { status: { not: NotificationStatus.READ } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      notification_id: true, type: true, status: true, title: true, body: true,
      metadata: true, sentAt: true, readAt: true, createdAt: true,
      plant: { select: { plant_id: true, name: true } },
    },
  });
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  const n = await prisma.notification.findUnique({ where: { notification_id: notificationId } });
  if (!n || n.userId !== userId) return;
  await prisma.notification.update({
    where: { notification_id: notificationId },
    data:  { readAt: new Date(), status: NotificationStatus.READ },
  });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, status: { not: NotificationStatus.READ } },
    data:  { readAt: new Date(), status: NotificationStatus.READ },
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  // FIX: count by status (not readAt) to be consistent with getUserNotifications
  return prisma.notification.count({
    where: { userId, status: { not: NotificationStatus.READ } },
  });
}

// ─── Internal helper — create DB record then send email ──────────────────────

async function createAndSend(params: {
  userId:    string;
  plantId?:  string;
  type:      NotificationType;
  title:     string;
  body:      string;
  metadata?: object;
  sendEmail: () => Promise<void>;
}): Promise<string | null> {

  let notificationId: string;
  try {
    console.log(
      `[Notifications] Creating record | type=${params.type} userId=${params.userId} plantId=${params.plantId ?? 'none'}`
    );
    const notification = await prisma.notification.create({
      data: {
        userId:   params.userId,
        plantId:  params.plantId ?? null,
        type:     params.type,
        title:    params.title,
        body:     params.body,
        metadata: params.metadata ?? undefined,
        status:   NotificationStatus.PENDING,
      },
      select: { notification_id: true },
    });
    notificationId = notification.notification_id;
    console.log(`[Notifications] ✓ DB record created | id=${notificationId}`);
  } catch (err) {
    console.error('[Notifications] ✗ prisma.notification.create FAILED', {
      type:    params.type,
      userId:  params.userId,
      plantId: params.plantId ?? null,
      title:   params.title,
      error:   err,
    });
    return null;
  }

  try {
    await params.sendEmail();
    await prisma.notification.update({
      where: { notification_id: notificationId },
      data:  { status: NotificationStatus.SENT, sentAt: new Date() },
    });
    console.log(`[Notifications] ✓ Email sent | notification=${notificationId} → SENT`);
  } catch (err) {
    console.error(`[Notifications] ✗ Email failed | notification=${notificationId}:`, err);
    await prisma.notification.update({
      where: { notification_id: notificationId },
      data:  { status: NotificationStatus.FAILED },
    }).catch(e =>
      console.error(`[Notifications] Could not mark ${notificationId} as FAILED:`, e)
    );
  }

  return notificationId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED CARE REMINDER — runs every 5 minutes via cron
// ═══════════════════════════════════════════════════════════════════════════════

const LOOKBACK_MS          =  5 * 60 * 1000;
const DUE_SOON_WINDOW_MS   = 30 * 60 * 1000;
const OVERDUE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const REMINDER_COOLDOWN_MS = 23 * 60 * 60 * 1000;
const OVERDUE_COOLDOWN_MS  =  3 * 24 * 60 * 60 * 1000;

export async function checkCareReminders(): Promise<void> {
  const now          = new Date();
  const windowStart  = new Date(now.getTime() - LOOKBACK_MS);
  const windowEnd    = new Date(now.getTime() + DUE_SOON_WINDOW_MS);
  const overdueStart = new Date(now.getTime() - OVERDUE_THRESHOLD_MS);

  console.log(
    `[Notifications] checkCareReminders() | now=${now.toISOString()}` +
    ` | due-soon: ${windowStart.toISOString()} → ${windowEnd.toISOString()}` +
    ` | overdue threshold: nextDue < ${overdueStart.toISOString()}`
  );

  let schedules: CareScheduleRow[];
  try {
    schedules = await prisma.careSchedule.findMany({
      where: {
        OR: [
          { nextDue: { gte: windowStart, lte: windowEnd } },
          { nextDue: { lt: overdueStart } },
        ],
      },
      include: {
        user:  { select: { user_id: true, email: true, firstName: true, timezone: true } },
        plant: { select: { plant_id: true, name: true } },
      },
    }) as CareScheduleRow[];
  } catch (err) {
    console.error('[Notifications] checkCareReminders — DB query failed:', err);
    return;
  }

  console.log(`[Notifications] checkCareReminders — ${schedules.length} schedule(s) in window`);
  if (schedules.length === 0) return;

  let dueSoonCount = 0;
  let overdueCount = 0;

  for (const schedule of schedules) {
    try {
      const isDueSoon = schedule.nextDue >= windowStart && schedule.nextDue <= windowEnd;
      const isOverdue = schedule.nextDue < overdueStart;

      if (isOverdue) {
        await handleOverdue(schedule, now);
        overdueCount++;
      } else if (isDueSoon) {
        await handleDueSoon(schedule, now);
        dueSoonCount++;
      }
    } catch (err) {
      console.error(
        `[Notifications] checkCareReminders — error for scheduleId=${schedule.care_schedule_id}:`, err
      );
    }
  }

  console.log(
    `[Notifications] checkCareReminders done | due-soon=${dueSoonCount} overdue=${overdueCount}`
  );
}

async function handleDueSoon(schedule: CareScheduleRow, now: Date): Promise<void> {
  const cooldownFrom = new Date(now.getTime() - REMINDER_COOLDOWN_MS);

  const alreadySent = await prisma.notification.findFirst({
    where: {
      userId:   schedule.userId,
      plantId:  schedule.plantId,
      type:     NotificationType.TASK_REMINDER,
      createdAt: { gte: cooldownFrom },
      metadata: { path: ['taskType'], equals: schedule.taskType },
    },
  });

  if (alreadySent) {
    console.log(
      `[Notifications] SKIP due-soon | plant="${schedule.plant.name}" taskType=${schedule.taskType}` +
      ` — reminder already sent (id=${alreadySent.notification_id})`
    );
    return;
  }

  const taskLabel = schedule.taskType.toLowerCase().replace(/_/g, ' ');
  const localTime = new Intl.DateTimeFormat('en', {
    hour: '2-digit', minute: '2-digit',
    timeZone: schedule.user.timezone || 'UTC',
  }).format(schedule.nextDue);

  const minutesUntilDue = Math.round(
    (schedule.nextDue.getTime() - now.getTime()) / 60_000
  );
  const timeLabel =
    minutesUntilDue <= 0 ? 'right now' :
    minutesUntilDue < 60 ? `in ${minutesUntilDue} minute${minutesUntilDue !== 1 ? 's' : ''}` :
    `at ${localTime}`;

  await createAndSend({
    userId:  schedule.userId,
    plantId: schedule.plantId,
    type:    NotificationType.TASK_REMINDER,
    title:   `Time to ${taskLabel} ${schedule.plant.name}`,
    body:    `Your scheduled ${taskLabel} for ${schedule.plant.name} is due ${timeLabel}.`,
    metadata: {
      taskType: schedule.taskType, plantName: schedule.plant.name,
      dueAt: schedule.nextDue.toISOString(), localTime, reminderType: 'due-soon',
    },
    sendEmail: async () => { /* in-app only — email fires on overdue path */ },
  });
}

async function handleOverdue(schedule: CareScheduleRow, now: Date): Promise<void> {
  if (
    schedule.lastCompleted !== null &&
    schedule.lastCompleted >= schedule.nextDue
  ) {
    console.log(
      `[Notifications] SKIP overdue | plant="${schedule.plant.name}" taskType=${schedule.taskType}` +
      ` — completed after due date`
    );
    return;
  }

  const notifType: NotificationType =
    schedule.taskType === 'WATER'
      ? NotificationType.OVERDUE_WATERING
      : NotificationType.OVERDUE_FERTILIZING;

  const cooldownFrom = new Date(now.getTime() - OVERDUE_COOLDOWN_MS);
  const alreadySent = await prisma.notification.findFirst({
    where: {
      userId: schedule.userId, plantId: schedule.plantId,
      type: notifType, createdAt: { gte: cooldownFrom },
    },
  });

  if (alreadySent) {
    console.log(
      `[Notifications] SKIP overdue | plant="${schedule.plant.name}" — alert already sent`
    );
    return;
  }

  const daysMissed = Math.max(
    1,
    Math.floor((now.getTime() - schedule.nextDue.getTime()) / (24 * 60 * 60 * 1000))
  );
  const taskLabel = schedule.taskType === 'WATER' ? 'watering' : 'fertilizing';

  await createAndSend({
    userId:   schedule.userId,
    plantId:  schedule.plantId,
    type:     notifType,
    title:    `${schedule.plant.name} needs ${taskLabel}`,
    body:     `Overdue by ${daysMissed} day${daysMissed !== 1 ? 's' : ''}.`,
    metadata: { daysMissed, taskType: schedule.taskType },
    sendEmail: () => sendOverdueWateringEmail(
      schedule.user.email, schedule.user.firstName,
      schedule.taskType === 'FERTILIZE'
        ? `${schedule.plant.name} (fertilizing)`
        : schedule.plant.name,
      daysMissed
    ),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DAILY DIGEST — checkUpcomingTasks()
// ═══════════════════════════════════════════════════════════════════════════════

export async function checkUpcomingTasks(): Promise<void> {
  console.log('[Notifications] checkUpcomingTasks() started');

  const now   = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const midnight = new Date(now);
  midnight.setHours(23, 59, 59, 999);

  let upcoming: CareScheduleRow[];
  try {
    upcoming = await prisma.careSchedule.findMany({
      where:   { nextDue: { gte: now, lte: in48h } },
      include: {
        user:  { select: { user_id: true, email: true, firstName: true, timezone: true } },
        plant: { select: { plant_id: true, name: true } },
      },
      orderBy: { nextDue: 'asc' },
    }) as CareScheduleRow[];
  } catch (err) {
    console.error('[Notifications] checkUpcomingTasks — DB query failed:', err);
    return;
  }

  console.log(`[Notifications] checkUpcomingTasks — ${upcoming.length} schedule(s) due in next 48h`);
  if (upcoming.length === 0) return;

  const byUser = new Map<string, CareScheduleRow[]>();
  for (const s of upcoming) {
    const list = byUser.get(s.userId) ?? [];
    list.push(s);
    byUser.set(s.userId, list);
  }

  let sent = 0;
  for (const [userId, schedules] of byUser) {
    try {
      const user = schedules[0].user;
      const recentDigest = await prisma.notification.findFirst({
        where: {
          userId, type: NotificationType.TASK_REMINDER,
          createdAt: { gte: new Date(now.getTime() - 20 * 60 * 60 * 1000) },
          metadata:  { path: ['reminderType'], equals: 'daily-digest' },
        },
      });
      if (recentDigest) {
        console.log(`[Notifications] SKIP daily digest for userId=${userId} — already sent today`);
        continue;
      }

      const taskLines = schedules.map(s => ({
        plantName: s.plant.name, taskType: s.taskType,
        dueLabel: s.nextDue <= midnight ? 'Today' : 'Tomorrow',
      }));

      const taskSummary = taskLines
        .map(t => `${t.taskType.toLowerCase().replace(/_/g, ' ')} ${t.plantName} (${t.dueLabel})`)
        .join(', ');

      await createAndSend({
        userId,
        type:  NotificationType.TASK_REMINDER,
        title: `You have ${schedules.length} care task${schedules.length !== 1 ? 's' : ''} due soon`,
        body:  taskSummary,
        metadata: { taskCount: schedules.length, tasks: taskLines, reminderType: 'daily-digest' },
        sendEmail: () => sendTaskReminderEmail(user.email, user.firstName, taskLines),
      });
      sent++;
    } catch (err) {
      console.error(`[Notifications] checkUpcomingTasks — failed for userId=${userId}:`, err);
    }
  }

  console.log(`[Notifications] checkUpcomingTasks done — digest sent to ${sent} user(s)`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH DECLINE — checkHealthDeclines()
// ═══════════════════════════════════════════════════════════════════════════════

function modelScanScore(s: { healthy: boolean; confidence: number | null }): number {
  return s.healthy ? 100 : Math.round(100 - (s.confidence ?? 0.5) * 100);
}

export async function checkHealthDeclines(): Promise<void> {
  console.log('[Notifications] checkHealthDeclines() started');

  let plants: Array<{ plant_id: string; userId: string; name: string }>;
  try {
    plants = await prisma.plant.findMany({
      where:  { deletedAt: null },
      select: { plant_id: true, userId: true, name: true },
    });
  } catch (err) {
    console.error('[Notifications] checkHealthDeclines — DB query failed:', err);
    return;
  }

  console.log(`[Notifications] checkHealthDeclines — checking ${plants.length} plant(s)`);

  for (const plant of plants) {
    try {
      const recentScans = await prisma.scanHistory.findMany({
        where:   { plantId: plant.plant_id },
        orderBy: { createdAt: 'desc' },
        take:    2,
        select:  { healthy: true, confidence: true, disease: true },
      });

      if (recentScans.length < 2) continue;

      const latestScore   = modelScanScore(recentScans[0]);
      const previousScore = modelScanScore(recentScans[1]);
      const drop          = previousScore - latestScore;

      if (drop < 15) continue;

      const recentAlert = await prisma.notification.findFirst({
        where: {
          userId:  plant.userId, plantId: plant.plant_id,
          type:    NotificationType.HEALTH_DECLINE,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });
      if (recentAlert) {
        console.log(`[Notifications] SKIP HEALTH_DECLINE for plantId=${plant.plant_id} — already sent this week`);
        continue;
      }

      const user = await prisma.user.findUnique({
        where:  { user_id: plant.userId },
        select: { email: true, firstName: true },
      });
      if (!user) continue;

      await createAndSend({
        userId:   plant.userId,
        plantId:  plant.plant_id,
        type:     NotificationType.HEALTH_DECLINE,
        title:    `${plant.name}'s health is declining`,
        body:     `Health score dropped from ${previousScore} to ${latestScore}/100.`,
        metadata: { previousScore, latestScore, drop },
        sendEmail: () => sendHealthDeclineEmail(
          user.email, user.firstName, plant.name,
          previousScore, latestScore, recentScans[0].disease
        ),
      });
    } catch (err) {
      console.error(`[Notifications] checkHealthDeclines — failed for plantId=${plant.plant_id}:`, err);
    }
  }

  console.log(`[Notifications] checkHealthDeclines done`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISEASE DETECTED — inline, called from scan.service.ts
// ═══════════════════════════════════════════════════════════════════════════════

export async function notifyDiseaseDetected(params: {
  userId:         string;
  plantId?:       string;
  plantName:      string;
  diseaseName:    string;
  confidence:     number;
  recommendation: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where:  { user_id: params.userId },
    select: { email: true, firstName: true },
  });
  if (!user) return;

  await createAndSend({
    userId:   params.userId,
    plantId:  params.plantId,
    type:     NotificationType.DISEASE_DETECTED,
    title:    `Disease detected on ${params.plantName}`,
    body:     `${params.diseaseName} detected with ${params.confidence}% confidence.`,
    metadata: { diseaseName: params.diseaseName, confidence: params.confidence },
    sendEmail: () => sendDiseaseDetectedEmail(
      user.email, user.firstName,
      params.plantName, params.diseaseName,
      params.confidence, params.recommendation
    ),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEEKLY REPORT — sendWeeklyReports() — every Monday 08:00
//
// FIX: was calling getMonthlyReport() which returns current-month data.
// A weekly report sent on Monday should cover the past 7 days, NOT the month.
// We now query scans directly for the last 7 days per user.
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendWeeklyReports(): Promise<void> {
  console.log('[Notifications] sendWeeklyReports() started');

  let users: Array<{ user_id: string; email: string; firstName: string }>;
  try {
    users = await prisma.user.findMany({
      where:  { deletedAt: null },
      select: { user_id: true, email: true, firstName: true },
    });
  } catch (err) {
    console.error('[Notifications] sendWeeklyReports — DB query failed:', err);
    return;
  }

  let sent  = 0;
  const now = new Date();
  // FIX: weekly window = last 7 days, not current month
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  for (const user of users) {
    try {
      // FIX: skip guard — only skip if the user has NO plants at all
      // Previously: skipped if totalScans===0 AND totalPlantsTracked===0
      // Problem: if user has plants but did 0 scans this week, they should
      // still receive the report (it tells them to scan more)
      const plantCount = await prisma.plant.count({
        where: { userId: user.user_id, deletedAt: null },
      });
      if (plantCount === 0) {
        console.log(`[Notifications] SKIP weekly report for userId=${user.user_id} — no plants`);
        continue;
      }

      // FIX: query last 7 days of scans directly instead of using getMonthlyReport
      const [modelScans, spreadScans] = await Promise.all([
        prisma.scanHistory.findMany({
          where: { userId: user.user_id, createdAt: { gte: weekStart, lte: now } },
          select: { healthy: true, confidence: true },
        }),
        prisma.spreadScanHistory.findMany({
          where: { userId: user.user_id, createdAt: { gte: weekStart, lte: now } },
          select: { valid: true, spreadPercentage: true, confidence: true },
        }),
      ]);

      const totalScansThisWeek = modelScans.length + spreadScans.length;

      // Compute weekly scores
      const weeklyScores: number[] = [
        ...modelScans.map(s =>
          s.healthy ? 100 : Math.round(100 - (s.confidence ?? 0.5) * 100)
        ),
        ...spreadScans
          .filter(s => s.valid)
          .map(s => {
            if (s.spreadPercentage === null) return 50;
            return Math.max(0, Math.round(100 - s.spreadPercentage * ((s.confidence ?? 50) / 100)));
          }),
      ];

      // FIX: use the real-time plants overview for plantsNeedingAttention
      const overview = await getPlantsOverview(user.user_id);

      const weeklyAvgScore = weeklyScores.length > 0
        ? Math.round(weeklyScores.reduce((a, b) => a + b, 0) / weeklyScores.length)
        : overview.overallHealthScore; // fall back to all-time score if no scans this week

      // Build insight sentence
      let insight: string;
      if (totalScansThisWeek === 0) {
        insight = `You didn't scan any plants this week. Regular scans help catch diseases early — consider scanning your ${plantCount} plant${plantCount !== 1 ? 's' : ''}.`;
      } else if (weeklyAvgScore >= 80) {
        insight = `Great week! Your plants averaged ${weeklyAvgScore}/100 health across ${totalScansThisWeek} scan${totalScansThisWeek !== 1 ? 's' : ''} — keep up the good work.`;
      } else if (weeklyAvgScore >= 60) {
        insight = `Mixed week — average health score was ${weeklyAvgScore}/100 across ${totalScansThisWeek} scan${totalScansThisWeek !== 1 ? 's' : ''}. Check any flagged plants.`;
      } else {
        insight = `Tough week — average health was ${weeklyAvgScore}/100. ${overview.plantsNeedingAttention} plant${overview.plantsNeedingAttention !== 1 ? 's need' : ' needs'} immediate attention.`;
      }

      // FIX: guard — don't send if we already sent a weekly report in the last 6 days
      // (prevents double-sends if the cron fires twice on Monday)
      const recentReport = await prisma.notification.findFirst({
        where: {
          userId: user.user_id,
          type:   NotificationType.WEEKLY_REPORT,
          createdAt: { gte: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000) },
        },
      });
      if (recentReport) {
        console.log(`[Notifications] SKIP weekly report for userId=${user.user_id} — already sent this week`);
        continue;
      }

      await createAndSend({
        userId: user.user_id,
        type:   NotificationType.WEEKLY_REPORT,
        title:  'Your weekly PlantGuard report',
        body:   insight,
        metadata: {
          overallScore:           weeklyAvgScore,
          totalScans:             totalScansThisWeek,
          plantsNeedingAttention: overview.plantsNeedingAttention,
          weekStart:              weekStart.toISOString(),
          weekEnd:                now.toISOString(),
        },
        sendEmail: () => sendWeeklyReportEmail(
          user.email, user.firstName,
          weeklyAvgScore,
          totalScansThisWeek,
          overview.plantsNeedingAttention,
          insight
        ),
      });
      sent++;
    } catch (err) {
      console.error(`[Notifications] sendWeeklyReports — failed for userId=${user.user_id}:`, err);
    }
  }

  console.log(`[Notifications] sendWeeklyReports done — sent to ${sent}/${users.length} user(s)`);
}