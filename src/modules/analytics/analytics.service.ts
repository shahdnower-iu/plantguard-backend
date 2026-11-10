// src/modules/analytics/analytics.service.ts
// Idea 5 — Scan Data Analysis & User Health Insights
//
// Provides three levels of insight per user:
//   1. Per-plant health timeline    — scan scores over time, trend direction
//   2. Monthly report               — summary of what happened this month
//   3. Cross-plant overview         — which plant needs the most attention

import prisma from '../../config/connectionDb';
import { NotFoundError } from '../../utils/errors';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HealthPoint {
  date: string;          // ISO date string
  score: number;         // 0–100 (100 = perfectly healthy)
  source: 'model' | 'spread';
  disease: string | null;
  confidence: number;
}

// FIX: trend direction is a plain string union so the frontend can compare with ===
export type TrendDirection = 'improving' | 'declining' | 'stable' | 'insufficient_data';

export interface TrendResult {
  direction: TrendDirection;
  changePercentage: number;  // e.g. +12 = improved 12 points, -8 = worsened 8
  averageScore: number;
  latestScore: number;
}

export interface PlantInsight {
  plantId: string;
  plantName: string;
  plantType: string;
  healthStatus: string;
  totalScans: number;
  timeline: HealthPoint[];
  trend: TrendResult;
  mostFrequentDisease: string | null;
  lastScanned: string | null;
}

export interface MonthlyReport {
  month: string;                  // e.g. "April 2026"
  totalScans: number;
  // FIX: renamed to match what frontend + api.ts expect
  diseasedScans: number;
  healthyScans: number;
  newPlants: number;              // FIX: added — plants created this month
  mostProblematicPlant: string | null;
  mostCommonDisease: string | null;
  // FIX: renamed from overallHealthScore → avgHealthScore
  avgHealthScore: number;
  // FIX: added topDiseases array expected by the frontend charts
  topDiseases: { name: string; count: number }[];
  plantSummaries: {
    plantId: string;
    plantName: string;
    scansThisMonth: number;
    diseases: string[];
    averageScore: number;
  }[];
  insight: string;
}

// ─── Helper: convert a scan to a 0–100 health score ──────────────────────────

function modelScanToScore(scan: { healthy: boolean; confidence: number | null }): number {
  if (scan.healthy) return 100;
  return Math.round(100 - (scan.confidence ?? 0.5) * 100);
}

function spreadScanToScore(scan: { valid: boolean; spreadPercentage: number | null; confidence: number | null }): number {
  if (!scan.valid || scan.spreadPercentage === null) return 50;
  const spreadPenalty = scan.spreadPercentage;
  const confFactor    = (scan.confidence ?? 50) / 100;
  return Math.max(0, Math.round(100 - spreadPenalty * confFactor));
}

// ─── Helper: linear regression slope → trend direction ───────────────────────

function calcTrend(points: HealthPoint[]): TrendResult {
  if (points.length < 2) {
    return {
      direction: 'insufficient_data',
      changePercentage: 0,
      averageScore: points[0]?.score ?? 0,
      latestScore: points[0]?.score ?? 0,
    };
  }

  const scores = points.map(p => p.score);
  const n = scores.length;
  const avg = scores.reduce((a, b) => a + b, 0) / n;

  const xMean = (n - 1) / 2;
  const slope = scores.reduce((sum, s, i) => sum + (i - xMean) * (s - avg), 0) /
                scores.reduce((sum, _, i) => sum + (i - xMean) ** 2, 0);

  const change = Math.round(scores[n - 1] - scores[0]);

  return {
    direction: slope > 1.5 ? 'improving' : slope < -1.5 ? 'declining' : 'stable',
    changePercentage: change,
    averageScore: Math.round(avg),
    latestScore: scores[n - 1],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHT 1 — Per-plant health timeline
// GET /api/analytics/plant/:plantId/timeline
// ═══════════════════════════════════════════════════════════════════════════════

export async function getPlantTimeline(
  plantId: string,
  userId: string
): Promise<PlantInsight> {
  const plant = await prisma.plant.findUnique({
    where: { plant_id: plantId, deletedAt: null },
  });
  if (!plant) throw new NotFoundError('Plant');
  if (plant.userId !== userId) throw new NotFoundError('Plant');

  const [modelScans, spreadScans] = await Promise.all([
    prisma.scanHistory.findMany({
      where: { plantId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, healthy: true, confidence: true, disease: true },
    }),
    prisma.spreadScanHistory.findMany({
      where: { plantId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, valid: true, spreadPercentage: true, confidence: true, diseaseName: true },
    }),
  ]);

  const timeline: HealthPoint[] = [
    ...modelScans.map((s: typeof modelScans[0]) => ({
      date: s.createdAt.toISOString(),
      score: modelScanToScore(s),
      source: 'model' as const,
      disease: s.disease,
      confidence: Math.round((s.confidence ?? 0) * 100),
    })),
    ...spreadScans.map((s: typeof spreadScans[0]) => ({
      date: s.createdAt.toISOString(),
      score: spreadScanToScore(s),
      source: 'spread' as const,
      disease: s.diseaseName ?? null,
      confidence: s.confidence ?? 0,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const diseaseCounts = new Map<string, number>();
  timeline.forEach(p => {
    if (p.disease) diseaseCounts.set(p.disease, (diseaseCounts.get(p.disease) ?? 0) + 1);
  });
  const mostFrequentDisease = diseaseCounts.size > 0
    ? [...diseaseCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : null;

  return {
    plantId: plant.plant_id,
    plantName: plant.name,
    plantType: plant.plantType,
    healthStatus: plant.healthStatus,
    totalScans: timeline.length,
    timeline,
    trend: calcTrend(timeline),
    mostFrequentDisease,
    lastScanned: timeline.at(-1)?.date ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHT 2 — Monthly report
// GET /api/analytics/report?month=2026-04
// ═══════════════════════════════════════════════════════════════════════════════

export async function getMonthlyReport(
  userId: string,
  month: string   // format "YYYY-MM"
): Promise<MonthlyReport> {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(year, mon - 1, 1);
  const end   = new Date(year, mon, 1);

  const [modelScans, spreadScans, newPlantsCount] = await Promise.all([
    prisma.scanHistory.findMany({
      where: { userId, createdAt: { gte: start, lt: end } },
      include: { plant: { select: { plant_id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.spreadScanHistory.findMany({
      where: { userId, createdAt: { gte: start, lt: end } },
      include: { plant: { select: { plant_id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    // FIX: count plants created this month
    prisma.plant.count({
      where: { userId, deletedAt: null, createdAt: { gte: start, lt: end } },
    }),
  ]);

  const totalScans = modelScans.length + spreadScans.length;

  const plantMap = new Map<string, {
    name: string;
    scans: number;
    diseases: string[];
    scores: number[];
  }>();

  const addEntry = (plantId: string | null, plantName: string | null, score: number, disease: string | null) => {
    if (!plantId || !plantName) return;
    if (!plantMap.has(plantId)) {
      plantMap.set(plantId, { name: plantName, scans: 0, diseases: [], scores: [] });
    }
    const entry = plantMap.get(plantId)!;
    entry.scans++;
    entry.scores.push(score);
    if (disease) entry.diseases.push(disease);
  };

  let allScores: number[] = [];
  let allDiseases: string[] = [];

  modelScans.forEach((s: typeof modelScans[0]) => {
    const score = modelScanToScore(s);
    allScores.push(score);
    if (s.disease) allDiseases.push(s.disease);
    addEntry(s.plantId ?? null, s.plant?.name ?? null, score, s.disease);
  });

  spreadScans.forEach((s: typeof spreadScans[0]) => {
    if (!s.valid) return;
    const score = spreadScanToScore(s);
    allScores.push(score);
    if (s.diseaseName) allDiseases.push(s.diseaseName);
    addEntry(s.plantId ?? null, s.plant?.name ?? null, score, s.diseaseName ?? null);
  });

  // Most problematic plant = lowest average health score
  let mostProblematicPlant: string | null = null;
  let lowestAvg = Infinity;
  plantMap.forEach((data) => {
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    if (avg < lowestAvg) { lowestAvg = avg; mostProblematicPlant = data.name; }
  });

  // Disease frequency map
  const diseaseCounts = new Map<string, number>();
  allDiseases.forEach(d => diseaseCounts.set(d, (diseaseCounts.get(d) ?? 0) + 1));

  const mostCommonDisease = diseaseCounts.size > 0
    ? [...diseaseCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : null;

  // FIX: build topDiseases array for frontend charts
  const topDiseases = [...diseaseCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // FIX: renamed from overallHealthScore → avgHealthScore
  const avgHealthScore = allScores.length > 0
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : 100;

  // Healthy = score >= 70 (consistent with the health score shown in the UI).
  // Using the same computed scores that already exist in allScores ensures
  // the pie chart and the avgHealthScore always tell the same story.
  // e.g. a plant with 44% confidence of disease scores 56/100 → "diseased" scan
  //      a plant with 10% confidence scores 90/100 → "healthy" scan
  const healthyScans = allScores.filter(score => score >= 70).length;
  const diseasedScans = allScores.length - healthyScans;

  // Human-readable insight
  let insight: string;
  if (totalScans === 0) {
    insight = 'No scans were performed this month. Consider scanning your plants regularly.';
  } else if (avgHealthScore >= 80) {
    insight = `Great month! Your plants scored an average health of ${avgHealthScore}/100 — keep up the care routine.`;
  } else if (avgHealthScore >= 60) {
    insight = `Your plants had a mixed month (avg score ${avgHealthScore}/100).${mostCommonDisease ? ` Watch out for ${mostCommonDisease}.` : ''}`;
  } else {
    insight = `A tough month — average health score was ${avgHealthScore}/100.${mostProblematicPlant ? ` ${mostProblematicPlant} needs the most attention.` : ''} Consider reviewing your care schedule.`;
  }

  const monthName = start.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return {
    month: monthName,
    totalScans,
    diseasedScans,          // FIX: was diseasesDetected
    healthyScans,
    newPlants: newPlantsCount, // FIX: added
    mostProblematicPlant,
    mostCommonDisease,
    avgHealthScore,         // FIX: was overallHealthScore
    topDiseases,            // FIX: added
    plantSummaries: [...plantMap.entries()].map(([plantId, data]) => ({
      plantId,
      plantName: data.name,
      scansThisMonth: data.scans,
      diseases: [...new Set(data.diseases)],
      averageScore: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
    })),
    insight,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHT 3 — Cross-plant overview (all plants, ranked by urgency)
// GET /api/analytics/overview
// ═══════════════════════════════════════════════════════════════════════════════

export async function getPlantsOverview(userId: string): Promise<{
  plants: {
    plantId: string;
    plantName: string;
    plantType: string;
    // FIX: renamed latestScore → latestHealthScore to match api.ts PlantOverview type
    latestHealthScore: number | null;
    // FIX: trend is now a plain string (not TrendResult object) so frontend can === compare
    trend: TrendDirection | 'no_data';
    // FIX: added scanCount field expected by frontend
    scanCount: number;
    lastScanned: string | null;
    urgencyRank: number;
  }[];
  overallHealthScore: number;
  totalPlantsTracked: number;
  plantsNeedingAttention: number;
}> {
  const plants = await prisma.plant.findMany({
    where: { userId, deletedAt: null },
    select: { plant_id: true, name: true, plantType: true, healthStatus: true },
  });

  const results = await Promise.all(
    plants.map(async (p: typeof plants[0]) => {
      // FIX: fetch scans directly instead of re-calling getPlantTimeline to avoid deep recursion cost
      const [modelScans, spreadScans] = await Promise.all([
        prisma.scanHistory.findMany({
          where: { plantId: p.plant_id },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true, healthy: true, confidence: true, disease: true },
        }),
        prisma.spreadScanHistory.findMany({
          where: { plantId: p.plant_id },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true, valid: true, spreadPercentage: true, confidence: true, diseaseName: true },
        }),
      ]);

      const timeline: HealthPoint[] = [
        ...modelScans.map((s: typeof modelScans[0]) => ({
          date: s.createdAt.toISOString(),
          score: modelScanToScore(s),
          source: 'model' as const,
          disease: s.disease,
          confidence: Math.round((s.confidence ?? 0) * 100),
        })),
        ...spreadScans.map((s: typeof spreadScans[0]) => ({
          date: s.createdAt.toISOString(),
          score: spreadScanToScore(s),
          source: 'spread' as const,
          disease: s.diseaseName ?? null,
          confidence: s.confidence ?? 0,
        })),
      ].sort((a, b) => a.date.localeCompare(b.date));

      const scanCount = timeline.length;
      const lastScanned = timeline.at(-1)?.date ?? null;

      // FIX: plants with zero scans → latestHealthScore = null (not 0)
      // This prevents them from showing 0/100 and being ranked as "most urgent"
      if (scanCount === 0) {
        return {
          plantId: p.plant_id,
          plantName: p.name,
          plantType: p.plantType,
          latestHealthScore: null as number | null,
          trend: 'no_data' as const,
          scanCount: 0,
          lastScanned: null,
          urgencyRank: 0,
        };
      }

      const trendResult = calcTrend(timeline);

      return {
        plantId: p.plant_id,
        plantName: p.name,
        plantType: p.plantType,
        // FIX: renamed from latestScore → latestHealthScore
        latestHealthScore: trendResult.latestScore as number | null,
        // FIX: extract direction string, not the whole TrendResult object
        trend: trendResult.direction as TrendDirection | 'no_data',
        scanCount,
        lastScanned,
        urgencyRank: 0,
      };
    })
  );

  // Sort: plants with scans (lowest score = most urgent) first, then unscanned plants at the end
  results.sort((a, b) => {
    if (a.latestHealthScore === null && b.latestHealthScore === null) return 0;
    if (a.latestHealthScore === null) return 1;
    if (b.latestHealthScore === null) return -1;
    return a.latestHealthScore - b.latestHealthScore;
  });
  results.forEach((r, i) => { r.urgencyRank = i + 1; });

  const scored = results.filter(r => r.latestHealthScore !== null);
  const overallHealthScore = scored.length > 0
    ? Math.round(scored.reduce((sum, r) => sum + (r.latestHealthScore ?? 0), 0) / scored.length)
    : 100;

  return {
    plants: results,
    overallHealthScore,
    totalPlantsTracked: results.length,
    plantsNeedingAttention: results.filter(r => r.latestHealthScore !== null && r.latestHealthScore < 60).length,
  };
}