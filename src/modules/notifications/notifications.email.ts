// src/modules/notifications/notifications.email.ts
// All email templates for the smart notification system.

import nodemailer from 'nodemailer';
import { env } from '../../config/env';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
});

// Shared email wrapper — consistent header/footer for all notification types
function wrapEmail(firstName: string, bodyHtml: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 520px; margin: auto; color: #2c2c2a;">
      <div style="background: #2d6a4f; padding: 20px 28px; border-radius: 10px 10px 0 0;">
        <h2 style="color: #fff; margin: 0; font-size: 20px;">🌿 PlantGuard</h2>
      </div>
      <div style="background: #f9f8f4; padding: 28px; border-radius: 0 0 10px 10px; border: 1px solid #e0dfd8;">
        <p style="margin: 0 0 16px; font-size: 15px;">Hi <strong>${firstName}</strong>,</p>
        ${bodyHtml}
        <hr style="border: none; border-top: 1px solid #e0dfd8; margin: 24px 0;" />
        <p style="font-size: 12px; color: #888; margin: 0;">
          You're receiving this because you have a PlantGuard account.
          Open the app to manage your notification settings.
        </p>
      </div>
    </div>`;
}

// ── 0. Task reminder (due today or tomorrow) ──────────────────────────────────
export async function sendTaskReminderEmail(
  to: string,
  firstName: string,
  tasks: { plantName: string; taskType: string; dueLabel: string }[]
): Promise<void> {
  const taskRows = tasks.map(t => `
    <tr>
      <td style="padding: 10px 14px; border-bottom: 1px solid #e0dfd8;">
        <strong>${t.plantName}</strong>
      </td>
      <td style="padding: 10px 14px; border-bottom: 1px solid #e0dfd8; text-transform: capitalize;">
        ${t.taskType.toLowerCase().replace('_', ' ')}
      </td>
      <td style="padding: 10px 14px; border-bottom: 1px solid #e0dfd8; color: ${t.dueLabel === 'Today' ? '#c0391b' : '#c8891a'}; font-weight: 600;">
        ${t.dueLabel}
      </td>
    </tr>`).join('');

  await transporter.sendMail({
    from: `"PlantGuard" <${env.GMAIL_USER}>`,
    to,
    subject: `🌿 You have ${tasks.length} plant task${tasks.length !== 1 ? 's' : ''} due soon`,
    html: wrapEmail(firstName, `
      <p style="font-size: 15px; margin: 0 0 16px;">
        Here are your upcoming plant care tasks:
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 16px;">
        <thead>
          <tr style="background: #f0efe8;">
            <th style="padding: 8px 14px; text-align: left; font-weight: 500;">Plant</th>
            <th style="padding: 8px 14px; text-align: left; font-weight: 500;">Task</th>
            <th style="padding: 8px 14px; text-align: left; font-weight: 500;">Due</th>
          </tr>
        </thead>
        <tbody>${taskRows}</tbody>
      </table>
      <div style="background: #e6f4ee; border-left: 4px solid #2d6a4f; padding: 12px 16px; border-radius: 4px; font-size: 14px;">
        💡 Open PlantGuard to mark tasks complete once done.
      </div>
    `),
  });
}

// ── 1. Overdue watering alert ──────────────────────────────────────────────────
export async function sendOverdueWateringEmail(
  to: string,
  firstName: string,
  plantName: string,
  daysMissed: number
): Promise<void> {
  await transporter.sendMail({
    from: `"PlantGuard" <${env.GMAIL_USER}>`,
    to,
    subject: `⚠️ ${plantName} needs water`,
    html: wrapEmail(firstName, `
      <p style="font-size: 15px; margin: 0 0 12px;">
        Your plant <strong>${plantName}</strong> was due to be watered
        <strong>${daysMissed} day${daysMissed !== 1 ? 's' : ''} ago</strong> and hasn't been marked as done yet.
      </p>
      <p style="font-size: 14px; color: #555; margin: 0 0 16px;">
        Skipping waterings can cause wilting, root stress, and makes plants more vulnerable to disease.
        Even a quick watering today can help.
      </p>
      <div style="background: #e6f4ee; border-left: 4px solid #2d6a4f; padding: 12px 16px; border-radius: 4px; font-size: 14px;">
        💡 Tip: Open PlantGuard → ${plantName} → mark watering as complete once done.
      </div>
    `),
  });
}

// ── 2. Health decline alert ────────────────────────────────────────────────────
export async function sendHealthDeclineEmail(
  to: string,
  firstName: string,
  plantName: string,
  previousScore: number,
  currentScore: number,
  latestDisease: string | null
): Promise<void> {
  const drop = previousScore - currentScore;
  await transporter.sendMail({
    from: `"PlantGuard" <${env.GMAIL_USER}>`,
    to,
    subject: `🔴 ${plantName}'s health is declining`,
    html: wrapEmail(firstName, `
      <p style="font-size: 15px; margin: 0 0 12px;">
        PlantGuard detected that <strong>${plantName}</strong>'s health score dropped
        by <strong>${drop} points</strong> (from ${previousScore} → ${currentScore}/100)
        based on your recent scans.
      </p>
      ${latestDisease ? `
      <p style="font-size: 14px; color: #555; margin: 0 0 16px;">
        Latest detected condition: <strong>${latestDisease}</strong>.
      </p>` : ''}
      <div style="background: #fdf1ee; border-left: 4px solid #c0391b; padding: 12px 16px; border-radius: 4px; font-size: 14px;">
        🔍 We recommend scanning <strong>${plantName}</strong> again and reviewing
        the recommended treatment in the scan results.
      </div>
    `),
  });
}

// ── 3. New disease detected alert ─────────────────────────────────────────────
export async function sendDiseaseDetectedEmail(
  to: string,
  firstName: string,
  plantName: string,
  diseaseName: string,
  confidence: number,
  recommendation: string
): Promise<void> {
  await transporter.sendMail({
    from: `"PlantGuard" <${env.GMAIL_USER}>`,
    to,
    subject: `🦠 Disease detected on ${plantName}`,
    html: wrapEmail(firstName, `
      <p style="font-size: 15px; margin: 0 0 12px;">
        A scan of <strong>${plantName}</strong> detected
        <strong>${diseaseName}</strong> with <strong>${confidence}% confidence</strong>.
      </p>
      <div style="background: #fff8e6; border-left: 4px solid #e6a817; padding: 12px 16px; border-radius: 4px; font-size: 14px; margin-bottom: 16px;">
        📋 Recommendation: ${recommendation}
      </div>
      <p style="font-size: 13px; color: #777; margin: 0;">
        Act quickly — early treatment prevents spread to nearby plants.
        Open PlantGuard to see the full diagnosis.
      </p>
    `),
  });
}

// ── 4. Weekly summary report email ────────────────────────────────────────────
export async function sendWeeklyReportEmail(
  to: string,
  firstName: string,
  overallScore: number,
  totalScans: number,
  plantsNeedingAttention: number,
  insight: string
): Promise<void> {
  const scoreColor = overallScore >= 80 ? '#2d6a4f' : overallScore >= 60 ? '#c8891a' : '#c0391b';
  const emoji      = overallScore >= 80 ? '🌟' : overallScore >= 60 ? '⚠️' : '🔴';

  await transporter.sendMail({
    from: `"PlantGuard" <${env.GMAIL_USER}>`,
    to,
    subject: `${emoji} Your PlantGuard weekly report`,
    html: wrapEmail(firstName, `
      <p style="font-size: 15px; margin: 0 0 20px;">${insight}</p>

      <div style="display: flex; gap: 12px; margin-bottom: 20px;">
        <div style="flex: 1; background: #fff; border: 1px solid #e0dfd8; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: ${scoreColor};">${overallScore}</div>
          <div style="font-size: 12px; color: #888; margin-top: 4px;">Overall health score</div>
        </div>
        <div style="flex: 1; background: #fff; border: 1px solid #e0dfd8; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: #2c2c2a;">${totalScans}</div>
          <div style="font-size: 12px; color: #888; margin-top: 4px;">Scans this week</div>
        </div>
        <div style="flex: 1; background: #fff; border: 1px solid #e0dfd8; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: ${plantsNeedingAttention > 0 ? '#c0391b' : '#2d6a4f'};">${plantsNeedingAttention}</div>
          <div style="font-size: 12px; color: #888; margin-top: 4px;">Plants need attention</div>
        </div>
      </div>

      <p style="font-size: 13px; color: #777; margin: 0;">
        Open PlantGuard to see the full report for each plant.
      </p>
    `),
  });
}
