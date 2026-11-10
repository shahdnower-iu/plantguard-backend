// src/modules/user/user.service.ts

// import prisma from '../../config/connectionDb';
// import { hashPassword, verifyPassword } from '../../utils/hash';
// import { uploadToCloudinary } from '../../middleware/upload';
// import {
//   NotFoundError,
//   ForbiddenError,
//   ValidationError,
//   ConflictError,
//   QuotaExceededError,
// } from '../../utils/errors';
// import { env } from '../../config/env';
// import { GoogleGenerativeAI } from '@google/generative-ai';
// import { resolveTimezone } from '../../utils/timezone';

// // ─── Free-tier weekly scan limits ─────────────────────────────────────────────

// const FREE_DISEASE_SCANS_PER_WEEK = 15;
// const FREE_SPREAD_SCANS_PER_WEEK  = 10;

// /** Returns the ISO week key for "right now", e.g. "2026-W17" */
// function currentWeekKey(): string {
//   const now = new Date();
//   const jan4 = new Date(now.getFullYear(), 0, 4);
//   const week = Math.ceil(((now.getTime() - jan4.getTime()) / 86_400_000 + jan4.getDay() + 1) / 7);
//   return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
// }

// // ─── Quota checks ─────────────────────────────────────────────────────────────

// /**
//  * Check and guard the disease-scan weekly quota for FREE users.
//  * Resets the counter automatically when a new ISO week starts.
//  * PRO users pass through immediately.
//  */
// export async function checkDiseaseScanLimit(userId: string): Promise<void> {
//   const user = await prisma.user.findUnique({
//     where:  { user_id: userId },
//     select: { subscription: true, diseaseScansThisWeek: true, diseaseScanWeekKey: true },
//   });
//   if (!user) throw new NotFoundError('User');
//   if (user.subscription === 'PRO') return;

//   const weekKey = currentWeekKey();
//   const count   = user.diseaseScanWeekKey === weekKey ? user.diseaseScansThisWeek : 0;

//   if (count >= FREE_DISEASE_SCANS_PER_WEEK) {
//     throw new QuotaExceededError(
//       `Free plan: ${FREE_DISEASE_SCANS_PER_WEEK} disease detection scans per week. ` +
//       `Upgrade to PRO for unlimited scans.`
//     );
//   }
// }

// /**
//  * Check and guard the spread-scan weekly quota for FREE users.
//  */
// export async function checkSpreadScanLimit(userId: string): Promise<void> {
//   const user = await prisma.user.findUnique({
//     where:  { user_id: userId },
//     select: { subscription: true, spreadScansThisWeek: true, spreadScanWeekKey: true },
//   });
//   if (!user) throw new NotFoundError('User');
//   if (user.subscription === 'PRO') return;

//   const weekKey = currentWeekKey();
//   const count   = user.spreadScanWeekKey === weekKey ? user.spreadScansThisWeek : 0;

//   if (count >= FREE_SPREAD_SCANS_PER_WEEK) {
//     throw new QuotaExceededError(
//       `Free plan: ${FREE_SPREAD_SCANS_PER_WEEK} spread analysis scans per week. ` +
//       `Upgrade to PRO for unlimited scans.`
//     );
//   }
// }

// /** Increment disease-scan counter (call after a successful scan). */
// export async function incrementDiseaseScanCount(userId: string): Promise<void> {
//   const weekKey = currentWeekKey();
//   const user = await prisma.user.findUnique({
//     where:  { user_id: userId },
//     select: { diseaseScansThisWeek: true, diseaseScanWeekKey: true },
//   });
//   if (!user) return;

//   const isNewWeek = user.diseaseScanWeekKey !== weekKey;
//   await prisma.user.update({
//     where: { user_id: userId },
//     data: {
//       totalScans:           { increment: 1 },
//       diseaseScansThisWeek: isNewWeek ? 1 : { increment: 1 },
//       diseaseScanWeekKey:   weekKey,
//     },
//   });
// }

// /** Increment spread-scan counter (call after a successful scan). */
// export async function incrementSpreadScanCount(userId: string): Promise<void> {
//   const weekKey = currentWeekKey();
//   const user = await prisma.user.findUnique({
//     where:  { user_id: userId },
//     select: { spreadScansThisWeek: true, spreadScanWeekKey: true },
//   });
//   if (!user) return;

//   const isNewWeek = user.spreadScanWeekKey !== weekKey;
//   await prisma.user.update({
//     where: { user_id: userId },
//     data: {
//       totalScans:          { increment: 1 },
//       spreadScansThisWeek: isNewWeek ? 1 : { increment: 1 },
//       spreadScanWeekKey:   weekKey,
//     },
//   });
// }

// // ─── Profile ──────────────────────────────────────────────────────────────────

// export async function getUserProfile(userId: string) {
//   const user = await prisma.user.findUnique({
//     where:  { user_id: userId, deletedAt: null },
//     select: {
//       user_id: true, email: true, firstName: true, lastName: true,
//       phoneNumber: true, country: true, city: true, timezone: true,
//       profileImage: true, authProvider: true, subscription: true,
//       subscriptionStartDate: true, subscriptionEndDate: true,
//       totalScans: true, diseaseScansThisWeek: true, spreadScansThisWeek: true,
//       createdAt: true,
//     },
//   });
//   if (!user) throw new NotFoundError('User');
//   return user;
// }

// export async function updateUserProfile(
//   userId: string,
//   data: {
//     firstName?: string;
//     lastName?: string;
//     phoneNumber?: string;
//     country?: string;
//     city?: string;
//     timezone?: string;
//   }
// ) {
//   return prisma.user.update({
//     where: { user_id: userId },
//     data,
//     select: {
//       user_id: true, email: true, firstName: true, lastName: true,
//       phoneNumber: true, country: true, city: true, timezone: true,
//       profileImage: true,
//     },
//   });
// }

// export async function updateProfileImage(userId: string, buffer: Buffer): Promise<string> {
//   const profileImage = await uploadToCloudinary(buffer, `plantguard/${userId}/profile`, 'image');
//   await prisma.user.update({ where: { user_id: userId }, data: { profileImage } });
//   return profileImage;
// }

// export async function changePassword(
//   userId: string,
//   currentPassword: string,
//   newPassword: string
// ): Promise<void> {
//   const user = await prisma.user.findUnique({ where: { user_id: userId } });
//   if (!user) throw new NotFoundError('User');
//   if (user.authProvider === 'GOOGLE' || !user.password) {
//     throw new ValidationError('Google accounts cannot change password here');
//   }

//   const valid = await verifyPassword(currentPassword, user.password);
//   if (!valid) throw new ValidationError('Current password is incorrect');

//   const hashed = await hashPassword(newPassword);
//   await prisma.user.update({ where: { user_id: userId }, data: { password: hashed } });
// }

// export async function softDeleteAccount(userId: string): Promise<void> {
//   await prisma.user.update({
//     where: { user_id: userId },
//     data:  { deletedAt: new Date() },
//   });
// }

// // ─── Subscription ─────────────────────────────────────────────────────────────

// export async function getSubscriptionStatus(userId: string) {
//   const user = await prisma.user.findUnique({
//     where:  { user_id: userId },
//     select: {
//       subscription: true,
//       subscriptionStartDate: true,
//       subscriptionEndDate: true,
//       diseaseScansThisWeek: true,
//       spreadScansThisWeek: true,
//       diseaseScanWeekKey: true,
//       spreadScanWeekKey: true,
//     },
//   });
//   if (!user) throw new NotFoundError('User');

//   const weekKey = currentWeekKey();
//   return {
//     plan: user.subscription,
//     subscriptionStartDate: user.subscriptionStartDate,
//     subscriptionEndDate:   user.subscriptionEndDate,
//     isActive: user.subscription === 'PRO' &&
//               !!user.subscriptionEndDate &&
//               user.subscriptionEndDate > new Date(),
//     weeklyUsage: {
//       diseaseScans: {
//         used:  user.diseaseScanWeekKey === weekKey ? user.diseaseScansThisWeek : 0,
//         limit: FREE_DISEASE_SCANS_PER_WEEK,
//       },
//       spreadScans: {
//         used:  user.spreadScanWeekKey === weekKey ? user.spreadScansThisWeek : 0,
//         limit: FREE_SPREAD_SCANS_PER_WEEK,
//       },
//     },
//   };
// }

// /** Admin/testing: force-upgrade a user to PRO. */
// export async function adminUpgradeToPro(userId: string, days = 30): Promise<void> {
//   const user = await prisma.user.findUnique({
//     where:  { user_id: userId },
//     select: { subscriptionEndDate: true },
//   });
//   if (!user) throw new NotFoundError('User');

//   const now   = new Date();
//   // If already PRO and still active, extend from the current end date
//   const base  = user.subscriptionEndDate && user.subscriptionEndDate > now
//     ? user.subscriptionEndDate
//     : now;

//   const endDate = new Date(base);
//   endDate.setDate(endDate.getDate() + days);

//   await prisma.user.update({
//     where: { user_id: userId },
//     data: {
//       subscription:          'PRO',
//       subscriptionStartDate: now,
//       subscriptionEndDate:   endDate,
//     },
//   });
// }




// // ─── Seasonal tip ─────────────────────────────────────────────────────────────
// // Uses gemini to generate a personalised gardening
// // tip based on the user's country, city, and the current season in their timezone.
// // No extra API key needed — reuses GEMINI_API_KEY from env.

// // ─── Seasonal tip ─────────────────────────────────────────────────────────────
// // Uses Google Gemini 2.5 Flash-Lite (fast & cost-effective) to generate a 
// // personalised gardening tip based on the user's country, city, and current season.

// const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

// const model = genAI.getGenerativeModel({
//   model: "gemini-2.5-flash-lite",        // or "gemini-2.5-flash" if you prefer
//   generationConfig: {
//     maxOutputTokens: 150,
//     temperature: 0.7,
//   },
// });

// /** Returns the current season name for a given IANA timezone */
// function getSeasonForTimezone(timezone: string): { season: string; hemisphere: 'north' | 'south' } {
//   const now = new Date();
  
//   // Get the month in the user's local timezone
//   const localMonth = parseInt(
//     new Intl.DateTimeFormat('en', { 
//       month: 'numeric', 
//       timeZone: timezone 
//     }).format(now),
//     10
//   );

//   // Rough heuristic to detect southern hemisphere
//   const southernZones = ['Australia', 'Pacific/Auckland', 'America/Argentina', 
//     'America/Sao_Paulo', 'Africa/Johannesburg', 'Indian/'];
  
//   const isSouthern = southernZones.some(z => timezone.includes(z));

//   const hemisphere = isSouthern ? 'south' : 'north';

//   // Northern Hemisphere seasons
//   let northSeason: string;
//   if (localMonth >= 3 && localMonth <= 5) northSeason = 'Spring';
//   else if (localMonth >= 6 && localMonth <= 8) northSeason = 'Summer';
//   else if (localMonth >= 9 && localMonth <= 11) northSeason = 'Autumn';
//   else northSeason = 'Winter';

//   // Flip seasons for Southern Hemisphere
//   const season = isSouthern
//     ? ({ Spring: 'Autumn', Summer: 'Winter', Autumn: 'Spring', Winter: 'Summer' }[northSeason] ?? northSeason)
//     : northSeason;

//   return { season, hemisphere };
// }

// export async function getSeasonalTip(userId: string): Promise<{
//   tip: string;
//   season: string;
//   location: string;
//   generatedAt: string;
// }> {
//   const user = await prisma.user.findUnique({ 
//     where: { user_id: userId },
//     select: { city: true, country: true, timezone: true }
//   });

//   if (!user) throw new NotFoundError('User');

//   const timezone = user.timezone || 'Africa/Cairo';
//   const { season } = getSeasonForTimezone(timezone);

//   // Build location context
//   const locationParts = [user.city, user.country].filter(Boolean);
//   const locationLabel = locationParts.length > 0 
//     ? locationParts.join(', ') 
//     : 'your region';

//   const prompt = `You are an expert gardening advisor. Give ONE practical, specific plant care tip 
// for a home gardener in ${locationLabel} during ${season}.

// Rules:
// - Exactly 2-3 sentences. No more.
// - Be specific to the season and local climate (mention heat, humidity, rain, frost, or dry season if relevant).
// - Focus on one actionable thing the gardener can do TODAY or this week.
// - Do not start with "In ${season}..." or generic introductions. Start directly with the advice.
// - Use natural, friendly tone. No bullet points, no headings, plain prose only.`;

//   try {
//     const result = await model.generateContent(prompt);
//     const response = await result.response;
//     let tip = response.text().trim();

//     // Fallback in case Gemini returns empty or weird response
//     if (!tip || tip.length < 20) {
//       tip = `Check your plants regularly for signs of stress. Ensure they receive appropriate water and sunlight suited to ${season.toLowerCase()} conditions in ${locationLabel}.`;
//     }

//     return {
//       tip,
//       season,
//       location: locationLabel,
//       generatedAt: new Date().toISOString(),
//     };

//   } catch (error) {
//     console.error('Gemini API error while generating seasonal tip:', error);
    
//     // Graceful fallback
//     return {
//       tip: `Pay close attention to your plants this ${season.toLowerCase()}. Adjust watering and placement based on the changing weather in ${locationLabel}.`,
//       season,
//       location: locationLabel,
//       generatedAt: new Date().toISOString(),
//     };
//   }
// }


// src/modules/user/user.service.ts

import prisma from '../../config/connectionDb';
import { hashPassword, verifyPassword } from '../../utils/hash';
import { uploadToCloudinary } from '../../middleware/upload';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  QuotaExceededError,
} from '../../utils/errors';
import { env } from '../../config/env';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { resolveTimezone } from '../../utils/timezone';

// ─── Free-tier weekly scan limits ─────────────────────────────────────────────

const FREE_DISEASE_SCANS_PER_WEEK = 15;
const FREE_SPREAD_SCANS_PER_WEEK  = 10;

/** Returns the ISO week key for "right now", e.g. "2026-W17" */
function currentWeekKey(): string {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const week = Math.ceil(((now.getTime() - jan4.getTime()) / 86_400_000 + jan4.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ─── Quota checks ─────────────────────────────────────────────────────────────

export async function checkDiseaseScanLimit(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where:  { user_id: userId },
    select: { subscription: true, diseaseScansThisWeek: true, diseaseScanWeekKey: true },
  });
  if (!user) throw new NotFoundError('User');
  if (user.subscription === 'PRO') return;

  const weekKey = currentWeekKey();
  const count   = user.diseaseScanWeekKey === weekKey ? user.diseaseScansThisWeek : 0;

  if (count >= FREE_DISEASE_SCANS_PER_WEEK) {
    throw new QuotaExceededError(
      `Free plan: ${FREE_DISEASE_SCANS_PER_WEEK} disease detection scans per week. ` +
      `Upgrade to PRO for unlimited scans.`
    );
  }
}

export async function checkSpreadScanLimit(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where:  { user_id: userId },
    select: { subscription: true, spreadScansThisWeek: true, spreadScanWeekKey: true },
  });
  if (!user) throw new NotFoundError('User');
  if (user.subscription === 'PRO') return;

  const weekKey = currentWeekKey();
  const count   = user.spreadScanWeekKey === weekKey ? user.spreadScansThisWeek : 0;

  if (count >= FREE_SPREAD_SCANS_PER_WEEK) {
    throw new QuotaExceededError(
      `Free plan: ${FREE_SPREAD_SCANS_PER_WEEK} spread analysis scans per week. ` +
      `Upgrade to PRO for unlimited scans.`
    );
  }
}

export async function incrementDiseaseScanCount(userId: string): Promise<void> {
  const weekKey = currentWeekKey();
  const user = await prisma.user.findUnique({
    where:  { user_id: userId },
    select: { diseaseScansThisWeek: true, diseaseScanWeekKey: true },
  });
  if (!user) return;

  const isNewWeek = user.diseaseScanWeekKey !== weekKey;
  await prisma.user.update({
    where: { user_id: userId },
    data: {
      totalScans:           { increment: 1 },
      diseaseScansThisWeek: isNewWeek ? 1 : { increment: 1 },
      diseaseScanWeekKey:   weekKey,
    },
  });
}

export async function incrementSpreadScanCount(userId: string): Promise<void> {
  const weekKey = currentWeekKey();
  const user = await prisma.user.findUnique({
    where:  { user_id: userId },
    select: { spreadScansThisWeek: true, spreadScanWeekKey: true },
  });
  if (!user) return;

  const isNewWeek = user.spreadScanWeekKey !== weekKey;
  await prisma.user.update({
    where: { user_id: userId },
    data: {
      totalScans:          { increment: 1 },
      spreadScansThisWeek: isNewWeek ? 1 : { increment: 1 },
      spreadScanWeekKey:   weekKey,
    },
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { user_id: userId, deletedAt: null },
    select: {
      user_id: true, email: true, firstName: true, lastName: true,
      phoneNumber: true, country: true, city: true, timezone: true,
      profileImage: true, authProvider: true, subscription: true,
      subscriptionStartDate: true, subscriptionEndDate: true,
      totalScans: true, diseaseScansThisWeek: true, spreadScansThisWeek: true,
      createdAt: true,
    },
  });
  if (!user) throw new NotFoundError('User');
  return user;
}

export async function updateUserProfile(
  userId: string,
  data: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    country?: string;
    city?: string;
    timezone?: string;
  }
) {
  return prisma.user.update({
    where: { user_id: userId },
    data,
    select: {
      user_id: true, email: true, firstName: true, lastName: true,
      phoneNumber: true, country: true, city: true, timezone: true,
      profileImage: true,
    },
  });
}

export async function updateProfileImage(userId: string, buffer: Buffer): Promise<string> {
  const profileImage = await uploadToCloudinary(buffer, `plantguard/${userId}/profile`, 'image');
  await prisma.user.update({ where: { user_id: userId }, data: { profileImage } });
  return profileImage;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { user_id: userId } });
  if (!user) throw new NotFoundError('User');
  if (user.authProvider === 'GOOGLE' || !user.password) {
    throw new ValidationError('Google accounts cannot change password here');
  }

  const valid = await verifyPassword(currentPassword, user.password);
  if (!valid) throw new ValidationError('Current password is incorrect');

  const hashed = await hashPassword(newPassword);
  await prisma.user.update({ where: { user_id: userId }, data: { password: hashed } });
}

export async function softDeleteAccount(userId: string): Promise<void> {
  await prisma.user.update({
    where: { user_id: userId },
    data:  { deletedAt: new Date() },
  });
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export async function getSubscriptionStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { user_id: userId },
    select: {
      subscription: true,
      subscriptionStartDate: true,
      subscriptionEndDate: true,
      diseaseScansThisWeek: true,
      spreadScansThisWeek: true,
      diseaseScanWeekKey: true,
      spreadScanWeekKey: true,
    },
  });
  if (!user) throw new NotFoundError('User');

  const weekKey = currentWeekKey();
  return {
    plan: user.subscription,
    subscriptionStartDate: user.subscriptionStartDate,
    subscriptionEndDate:   user.subscriptionEndDate,
    isActive: user.subscription === 'PRO' &&
              !!user.subscriptionEndDate &&
              user.subscriptionEndDate > new Date(),
    weeklyUsage: {
      diseaseScans: {
        used:  user.diseaseScanWeekKey === weekKey ? user.diseaseScansThisWeek : 0,
        limit: FREE_DISEASE_SCANS_PER_WEEK,
      },
      spreadScans: {
        used:  user.spreadScanWeekKey === weekKey ? user.spreadScansThisWeek : 0,
        limit: FREE_SPREAD_SCANS_PER_WEEK,
      },
    },
  };
}

export async function adminUpgradeToPro(userId: string, days = 30): Promise<void> {
  const user = await prisma.user.findUnique({
    where:  { user_id: userId },
    select: { subscriptionEndDate: true },
  });
  if (!user) throw new NotFoundError('User');

  const now   = new Date();
  const base  = user.subscriptionEndDate && user.subscriptionEndDate > now
    ? user.subscriptionEndDate
    : now;

  const endDate = new Date(base);
  endDate.setDate(endDate.getDate() + days);

  await prisma.user.update({
    where: { user_id: userId },
    data: {
      subscription:          'PRO',
      subscriptionStartDate: now,
      subscriptionEndDate:   endDate,
    },
  });
}

// ─── Seasonal tip ─────────────────────────────────────────────────────────────
// Accepts optional `city` and `country` overrides from the request.
// Falls back to the values stored in the user's DB profile.
// If neither source provides location, defaults to a generic response.

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash-lite',
  generationConfig: {
    maxOutputTokens: 150,
    temperature: 0.7,
  },
});

/** Returns the current season name for a given IANA timezone */
function getSeasonForTimezone(timezone: string): { season: string; hemisphere: 'north' | 'south' } {
  const now = new Date();

  const localMonth = parseInt(
    new Intl.DateTimeFormat('en', {
      month: 'numeric',
      timeZone: timezone,
    }).format(now),
    10
  );

  const southernZones = [
    'Australia', 'Pacific/Auckland', 'America/Argentina',
    'America/Sao_Paulo', 'Africa/Johannesburg', 'Indian/',
  ];

  const isSouthern = southernZones.some(z => timezone.includes(z));
  const hemisphere = isSouthern ? 'south' : 'north';

  let northSeason: string;
  if      (localMonth >= 3 && localMonth <= 5)  northSeason = 'Spring';
  else if (localMonth >= 6 && localMonth <= 8)  northSeason = 'Summer';
  else if (localMonth >= 9 && localMonth <= 11) northSeason = 'Autumn';
  else                                           northSeason = 'Winter';

  const season = isSouthern
    ? ({ Spring: 'Autumn', Summer: 'Winter', Autumn: 'Spring', Winter: 'Summer' }[northSeason] ?? northSeason)
    : northSeason;

  return { season, hemisphere };
}

export async function getSeasonalTip(
  userId: string,
  /** Optional overrides supplied by the client (query params or body) */
  overrides?: { city?: string; country?: string }
): Promise<{
  tip: string;
  season: string;
  location: string;
  generatedAt: string;
}> {
  // ── 1. Fetch the user's stored profile ──────────────────────────────────────
  const user = await prisma.user.findUnique({
    where:  { user_id: userId },
    select: { city: true, country: true, timezone: true },
  });

  if (!user) throw new NotFoundError('User');

  // ── 2. Resolve location: client override → DB value → undefined ─────────────
  const city    = overrides?.city?.trim()    || user.city    || undefined;
  const country = overrides?.country?.trim() || user.country || undefined;

  // ── 3. Bail early if we have no location at all ─────────────────────────────
  if (!city && !country) {
    return {
      tip: 'Please add your city and country in your profile settings to receive a personalised seasonal gardening tip.',
      season: 'Unknown',
      location: 'Unknown',
      generatedAt: new Date().toISOString(),
    };
  }

  // ── 4. Determine season from timezone ───────────────────────────────────────
  const timezone = user.timezone || 'UTC';
  const { season } = getSeasonForTimezone(timezone);

  // ── 5. Build human-readable location label ──────────────────────────────────
  const locationLabel = [city, country].filter(Boolean).join(', ');

  // ── 6. Call Gemini ───────────────────────────────────────────────────────────
  const prompt = `You are an expert gardening advisor. Give ONE practical, specific plant care tip \
for a home gardener in ${locationLabel} during ${season}.

Rules:
- Exactly 2-3 sentences. No more.
- Be specific to the season and local climate (mention heat, humidity, rain, frost, or dry season if relevant).
- Focus on one actionable thing the gardener can do TODAY or this week.
- Do not start with "In ${season}..." or generic introductions. Start directly with the advice.
- Use natural, friendly tone. No bullet points, no headings, plain prose only.`;

  try {
    const result   = await model.generateContent(prompt);
    const response = await result.response;
    let tip        = response.text().trim();

    if (!tip || tip.length < 20) {
      tip = `Check your plants regularly for signs of stress. Ensure they receive appropriate water and sunlight suited to ${season.toLowerCase()} conditions in ${locationLabel}.`;
    }

    return { tip, season, location: locationLabel, generatedAt: new Date().toISOString() };

  } catch (error) {
    console.error('Gemini API error while generating seasonal tip:', error);

    return {
      tip: `Pay close attention to your plants this ${season.toLowerCase()}. Adjust watering and placement based on the changing weather in ${locationLabel}.`,
      season,
      location: locationLabel,
      generatedAt: new Date().toISOString(),
    };
  }
}