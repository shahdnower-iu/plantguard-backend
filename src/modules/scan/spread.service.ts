// src/modules/scan/spread.service.ts
//
// Service 2 — Spread Analysis
//   • 1–4 plant images → Gemini Vision
//   • Returns: disease spread percentage, stage, severity, recommendations
//
// Auto-plant behaviour:
//   • If plantId is provided  → verify it belongs to the user, use it as-is.
//   • If plantId is omitted   → create a new Plant record named after the
//     detected disease (or "Scanned Plant" when no disease name is returned),
//     link the scan to it, and return the new plantId in the response.

import axios from 'axios';
import sharp from 'sharp';
import prisma from '../../config/connectionDb';
import { env } from '../../config/env';
import { ValidationError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { checkSpreadScanLimit, incrementSpreadScanCount } from '../user/user.service';
import { uploadSpreadScanImages } from '../../middleware/upload';

// ─── Constants ────────────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-2.5-flash';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpreadAnalysisResult {
  scanId: string;
  plantId: string;          // always present — either the supplied one or the auto-created one
  plantCreated: boolean;    // true when a new plant was created automatically
  valid: boolean;
  rejectReason?: string;
  imageUrls: string[];
  imagesAnalyzed: number;
  diseaseName?: string;
  pathogenType?: string;
  spreadPercentage?: number;
  confidence?: number;
  severity?: string;
  affectedAreaEstimate?: string;
  spreadRate?: string;
  diseaseStage?: string;
  plantPartAffected: string[];
  visualSymptoms: string[];
  riskToPlant?: string;
  analysis?: string;
  recommendations: string[];
  requiresLabConfirm: boolean;
  contagionRisk?: string;
  riskLabel?: string;
  _meta: { model: string; analyzed_at: string };
}

// ─── Gemini Vision prompt ─────────────────────────────────────────────────────

const SPREAD_PROMPT = `You are an expert plant pathologist analyzing plant disease spread.
You will receive 1–4 plant images. Analyze them together for disease spread.

If the images do NOT show a plant or are unrelated, respond with:
{"valid": false, "rejectReason": "Images do not show a plant with identifiable disease"}

Otherwise respond ONLY with a valid JSON object (no fences, no preamble):
{
  "valid": true,
  "diseaseName": "Common name of the disease",
  "pathogenType": "fungal | bacterial | viral | pest | abiotic",
  "spreadPercentage": 0-100,
  "confidence": 0-100,
  "severity": "mild | moderate | severe | critical",
  "affectedAreaEstimate": "e.g. 30% of leaf surface",
  "spreadRate": "slow | moderate | fast | very fast",
  "diseaseStage": "early | developing | advanced | terminal",
  "plantPartAffected": ["leaves", "stems", ...],
  "visualSymptoms": ["symptom 1", "symptom 2"],
  "riskToPlant": "Explanation of risk to the overall plant",
  "analysis": "2-3 sentence expert summary of what is observed across all images",
  "recommendations": ["Action 1", "Action 2", "Action 3"],
  "requiresLabConfirm": true/false,
  "contagionRisk": "low | medium | high",
  "riskLabel": "Safe | Monitor | Act Now | Urgent"
}`;

// ─── Gemini Vision call ───────────────────────────────────────────────────────

async function callGeminiVision(
  imageBuffers: Buffer[],
  mimeTypes: string[]
): Promise<any> {
  const imageParts = imageBuffers.map((buf, i) => ({
    inlineData: {
      mimeType: mimeTypes[i] ?? 'image/jpeg',
      data: buf.toString('base64'),
    },
  }));

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      system_instruction: { parts: [{ text: SPREAD_PROMPT }] },
      contents: [{
        role: 'user',
        parts: [
          { text: `Analyze these ${imageBuffers.length} plant image(s) for disease spread:` },
          ...imageParts,
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    },
    { timeout: 60_000 }
  );

  const text: string =
    res.data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ─── ID generator ─────────────────────────────────────────────────────────────

function generateId(): string {
  return 's' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

// ─── Helper: resolve or auto-create a Plant ───────────────────────────────────
//
// Returns { plantId, plantCreated }
//   • If the caller supplied a plantId, validate ownership and return it.
//   • Otherwise create a new Plant derived from Gemini's diseaseName field.

async function resolveOrCreatePlant(
  userId: string,
  suppliedPlantId: string | undefined,
  geminiResult: any,
  isValid: boolean,
  firstImageUrl: string,
): Promise<{ plantId: string; plantCreated: boolean }> {
  // ── Caller already knows which plant this is ──────────────────────────────
  if (suppliedPlantId) {
    const existing = await prisma.plant.findUnique({ where: { plant_id: suppliedPlantId } });
    if (!existing || existing.deletedAt) throw new NotFoundError('Plant');
    if (existing.userId !== userId) throw new ForbiddenError();
    return { plantId: suppliedPlantId, plantCreated: false };
  }

  // ── Auto-create a plant from the Gemini result ────────────────────────────
  // Use diseaseName when available; fall back to a generic label.
  const diseaseName: string | undefined = geminiResult.diseaseName;
  const plantName   = isValid && diseaseName ? `Plant – ${diseaseName}` : 'Scanned Plant';
  const plantType   = 'Unknown';   // Gemini doesn't return a plant species here

  // Determine initial health from severity
  const severity    = (geminiResult.severity ?? '').toLowerCase();
  const healthStatus =
    !isValid ? 'GOOD'
    : ['severe', 'critical'].includes(severity) ? 'POOR'
    : severity === 'moderate' ? 'FAIR'
    : 'GOOD';

  const plant = await prisma.plant.create({
    data: {
      userId,
      name:      plantName,
      plantType,
      imageUrl:  firstImageUrl,
      healthStatus: healthStatus as any,
      notes:     'Auto-created from spread analysis scan.',
    },
  });

  return { plantId: plant.plant_id, plantCreated: true };
}

// ─── Main: performSpreadScan ──────────────────────────────────────────────────

export async function performSpreadScan(
  userId: string,
  plantId: string | undefined,
  imageBuffers: Buffer[],
  mimeTypes: string[]
): Promise<SpreadAnalysisResult> {
  if (!imageBuffers.length || imageBuffers.length > 4) {
    throw new ValidationError('Please provide 1 to 4 images for spread analysis');
  }

  // 1. Enforce weekly quota (10 spread scans/week for FREE users)
  await checkSpreadScanLimit(userId);

  const scanId = generateId();

  // 2. Upload all images to Cloudinary
  const imageUrls = await uploadSpreadScanImages(imageBuffers, userId, scanId);

  // 3. Resize images for Gemini (max 1024px on longest side)
  const resizedBuffers = await Promise.all(
    imageBuffers.map(buf =>
      sharp(buf)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer()
    )
  );

  // 4. Resolve (or create) the plant BEFORE calling Gemini so that:
  //    a) ownership/existence errors surface immediately with a clear message, and
  //    b) the FK is valid when we insert the scan row regardless of Gemini's result.
  //    For auto-creation we pass a placeholder geminiResult — the plant will be
  //    updated with the real health status after Gemini responds.
  const { plantId: resolvedPlantId, plantCreated } = await resolveOrCreatePlant(
    userId,
    plantId,
    {},      // geminiResult not available yet — only used for auto-create naming/health
    true,    // assume valid until Gemini says otherwise
    imageUrls[0] ?? '',
  );

  // 5. Call Gemini Vision
  let geminiResult: any;
  try {
    geminiResult = await callGeminiVision(resizedBuffers, mimeTypes);
  } catch (err: any) {
    throw new ValidationError(`Spread analysis failed: ${err.message}`);
  }

  const isValid = geminiResult.valid !== false;

  // Update the auto-created plant's name/health now that we have Gemini's result
  if (plantCreated) {
    const diseaseName: string | undefined = geminiResult.diseaseName;
    const severity = (geminiResult.severity ?? '').toLowerCase();
    const healthStatus =
      !isValid ? 'GOOD'
      : ['severe', 'critical'].includes(severity) ? 'POOR'
      : severity === 'moderate' ? 'FAIR'
      : 'GOOD';

    await prisma.plant.update({
      where: { plant_id: resolvedPlantId },
      data: {
        name:         isValid && diseaseName ? `Plant – ${diseaseName}` : 'Scanned Plant',
        healthStatus: healthStatus as any,
      },
    });
  }

  // 6. Persist scan to DB + increment counter
  const [scan] = await Promise.all([
    prisma.spreadScanHistory.create({
      data: {
        spread_scan_id:       scanId,
        userId,
        plantId:              resolvedPlantId,
        imageUrls,
        valid:                isValid,
        rejectReason:         isValid ? undefined : geminiResult.rejectReason,
        diseaseName:          geminiResult.diseaseName,
        pathogenType:         geminiResult.pathogenType,
        spreadPercentage:     geminiResult.spreadPercentage,
        confidence:           geminiResult.confidence,
        severity:             geminiResult.severity,
        affectedAreaEstimate: geminiResult.affectedAreaEstimate,
        spreadRate:           geminiResult.spreadRate,
        diseaseStage:         geminiResult.diseaseStage,
        plantPartAffected:    geminiResult.plantPartAffected ?? [],
        visualSymptoms:       geminiResult.visualSymptoms ?? [],
        riskToPlant:          geminiResult.riskToPlant,
        analysis:             geminiResult.analysis,
        recommendations:      geminiResult.recommendations ?? [],
        requiresLabConfirm:   geminiResult.requiresLabConfirm ?? false,
        contagionRisk:        geminiResult.contagionRisk,
        riskLabel:            geminiResult.riskLabel,
        imagesAnalyzed:       imageBuffers.length,
        modelUsed:            GEMINI_MODEL,
      },
    }),
    incrementSpreadScanCount(userId),
    // Update existing (non-auto-created) plant's health status from severity
    ...(!plantCreated && isValid && geminiResult.severity
      ? [prisma.plant.update({
          where: { plant_id: resolvedPlantId },
          data: {
            healthStatus: ['severe', 'critical'].includes(geminiResult.severity) ? 'POOR' : 'FAIR',
          },
        })]
      : []),
  ]);

  return {
    scanId:               scan.spread_scan_id,
    plantId:              resolvedPlantId,
    plantCreated,
    valid:                isValid,
    rejectReason:         scan.rejectReason ?? undefined,
    imageUrls,
    imagesAnalyzed:       imageBuffers.length,
    diseaseName:          scan.diseaseName ?? undefined,
    pathogenType:         scan.pathogenType ?? undefined,
    spreadPercentage:     scan.spreadPercentage ?? undefined,
    confidence:           scan.confidence ?? undefined,
    severity:             scan.severity ?? undefined,
    affectedAreaEstimate: scan.affectedAreaEstimate ?? undefined,
    spreadRate:           scan.spreadRate ?? undefined,
    diseaseStage:         scan.diseaseStage ?? undefined,
    plantPartAffected:    scan.plantPartAffected,
    visualSymptoms:       scan.visualSymptoms,
    riskToPlant:          scan.riskToPlant ?? undefined,
    analysis:             scan.analysis ?? undefined,
    recommendations:      scan.recommendations,
    requiresLabConfirm:   scan.requiresLabConfirm,
    contagionRisk:        scan.contagionRisk ?? undefined,
    riskLabel:            scan.riskLabel ?? undefined,
    _meta: { model: GEMINI_MODEL, analyzed_at: new Date().toISOString() },
  };
}

// ─── History ──────────────────────────────────────────────────────────────────

export async function getSpreadHistory(userId: string, plantId?: string) {
  return prisma.spreadScanHistory.findMany({
    where:   { userId, ...(plantId ? { plantId } : {}) },
    orderBy: { createdAt: 'desc' },
    take:    50,
  });
}