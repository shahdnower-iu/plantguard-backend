// src/modules/scan/detect.service.ts

import { predictDisease } from '../../services/onnxInference';
import axios from 'axios';
import prisma from '../../config/connectionDb';
import { env } from '../../config/env';
import { ValidationError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { checkDiseaseScanLimit, incrementDiseaseScanCount } from '../user/user.service';
import { uploadToCloudinary } from '../../middleware/upload';

// ─── Constants ────────────────────────────────────────────────────────────────
const GEMINI_MODEL = 'gemini-2.5-flash';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ModelPrediction {
  label:         string;
  raw_label:     string;
  plant_name:    string; // ← new field from onnxInference
  healthy:       boolean;
  confidence:    number;
  pathogen_type: string;
  inference_ms:  number;
}

export interface DiseaseAdvice {
  disease_overview: string;
  cause:            string;
  treatment:        string[];
  prevention:       string[];
  urgency:          'low' | 'medium' | 'high' | 'critical';
}

export interface DetectScanResult {
  scanId:       string;
  plantId:      string;
  plantCreated: boolean;
  imageUrl:     string;
  healthy:      boolean;
  disease:      string | null;
  diagnosis:    string;
  plantName:    string;   // e.g. "Healthy Strawberry" or "Early Blight (Tomato)"
  plantType:    string;   // e.g. "Strawberry" or "Tomato" — fixes TYPE: NONE
  confidence:   number;
  pathogenType: string;
  inferenceMs:  number;
  advice:       DiseaseAdvice | null;
  _meta:        { model: string; gemini_model: string; analyzed_at: string };
}

// ─── Gemini Prompts ───────────────────────────────────────────────────────────

const DISEASE_ADVICE_PROMPT = `You are an expert plant pathologist.
You will be given a plant disease name and its raw model label.
Respond ONLY with a valid JSON object — no markdown fences, no preamble.

{
  "disease_overview": "2-3 sentences: what this disease is and why it develops",
  "cause": "The specific pathogen or cause and how it spreads",
  "treatment": ["Step 1", "Step 2", "Step 3"],
  "prevention": ["Tip 1", "Tip 2", "Tip 3"],
  "urgency": "low | medium | high | critical"
}`;

const HEALTHY_ADVICE_PROMPT = `You are an expert botanist and plant care specialist.
You will be given a healthy plant species name.
Respond ONLY with a valid JSON object — no markdown fences, no preamble.

{
  "disease_overview": "2-3 sentences describing this plant and its characteristics",
  "cause": "N/A — plant is healthy",
  "treatment": ["Care tip 1", "Care tip 2", "Care tip 3"],
  "prevention": ["How to keep it healthy tip 1", "Tip 2", "Tip 3"],
  "urgency": "low"
}`;

// ─── Gemini Call ──────────────────────────────────────────────────────────────

async function callGeminiForAdvice(
  label:     string,
  rawLabel:  string,
  isHealthy: boolean,
): Promise<DiseaseAdvice> {
  const systemPrompt  = isHealthy ? HEALTHY_ADVICE_PROMPT : DISEASE_ADVICE_PROMPT;
  const userMessage   = isHealthy
    ? `Plant: "${label}"\nRaw label: "${rawLabel}"`
    : `Disease: "${label}"\nRaw label: "${rawLabel}"`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents:           [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig:   { temperature: 0.15 },
    },
    { timeout: 35_000 },
  );

  const text: string =
    res.data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  return JSON.parse(text.replace(/```json|```/g, '').trim()) as DiseaseAdvice;
}

function generateId(): string {
  return 'c' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

// ─── Resolve or Auto-create Plant ────────────────────────────────────────────

async function resolveOrCreatePlant(
  userId:           string,
  suppliedPlantId:  string | undefined,
  plantType:        string,
  displayName:      string,
  isHealthy:        boolean,
  imageUrl:         string,
): Promise<{ plantId: string; plantCreated: boolean }> {
  if (suppliedPlantId) {
    const existing = await prisma.plant.findUnique({ where: { plant_id: suppliedPlantId } });
    if (!existing || existing.deletedAt) throw new NotFoundError('Plant');
    if (existing.userId !== userId)      throw new ForbiddenError();
    return { plantId: suppliedPlantId, plantCreated: false };
  }

  const plant = await prisma.plant.create({
    data: {
      userId,
      name:         displayName,
      plantType,
      imageUrl,
      healthStatus: isHealthy ? 'GOOD' : 'POOR',
      notes:        'Auto-created from disease detection scan.',
    },
  });

  return { plantId: plant.plant_id, plantCreated: true };
}

// ─── Main Perform Scan ────────────────────────────────────────────────────────

export async function performScan(
  userId:      string,
  plantId:     string | undefined,
  imageBuffer: Buffer,
): Promise<DetectScanResult> {
  await checkDiseaseScanLimit(userId);

  const scanId   = generateId();
  const imageUrl = await uploadToCloudinary(imageBuffer, `plantguard/${userId}/modelScan`, scanId);

  let prediction: ModelPrediction;
  try {
    prediction = await (await import('../../services/onnxInference')).predictDisease(imageBuffer);
  } catch (err: any) {
    throw new ValidationError(`Disease detection failed: ${err.message}`);
  }

  // Trust the model's own healthy classification directly. Low confidence means
  // "uncertain", not "assume healthy" — it must never flip a diseased prediction
  // to healthy, or the plant's name/status will disagree with its actual scan result.
  const isHealthy  = prediction.healthy;
  const plantType  = prediction.plant_name;              // e.g. "Tomato"
  // Build the display name from isHealthy + plantType instead of trusting
  // prediction.label verbatim. The model's free-text label and its `healthy`
  // boolean come from separate parts of the model and can disagree (e.g. a
  // low-confidence guess labeled "Healthy Pepper bell" while healthy=false),
  // which previously let the plant's name contradict its own health badge.
  // For diseased predictions we still want the specific disease name, so fall
  // back to the raw label there (it's just never used to construct "Healthy ...").
  const plantName  = isHealthy ? `Healthy ${plantType}` : prediction.label;

  // Always call Gemini — healthy plants get care tips, diseased get treatment advice
  let advice: DiseaseAdvice | null = null;
  try {
    advice = await callGeminiForAdvice(prediction.label, prediction.raw_label, isHealthy);
  } catch (err: any) {
    const geminiErr = err?.response?.data ?? err.message;
    console.error('[detect.service] Gemini advice failed:', JSON.stringify(geminiErr));
  }

  const { plantId: resolvedPlantId, plantCreated } = await resolveOrCreatePlant(
    userId, plantId, plantType, plantName, isHealthy, imageUrl,
  );

  const [scan] = await Promise.all([
    prisma.scanHistory.create({
      data: {
        scan_id:        scanId,
        userId,
        plantId:        resolvedPlantId,
        imageUrl,
        disease:        isHealthy ? null : prediction.label,
        healthy:        isHealthy,
        confidence:     prediction.confidence,
        diagnosis:      prediction.label,
        recommendation: advice ? advice.treatment.join(' | ') : 'Plant appears healthy.',
      },
    }),
    incrementDiseaseScanCount(userId),
    prisma.plant.update({
      where: { plant_id: resolvedPlantId },
      data:  { healthStatus: isHealthy ? 'GOOD' : 'POOR' },
    }),
  ]);

  return {
    scanId:       scan.scan_id,
    plantId:      resolvedPlantId,
    plantCreated,
    imageUrl,
    healthy:      isHealthy,
    disease:      isHealthy ? null : prediction.label,
    diagnosis:    prediction.label,
    plantName,    // "Healthy Strawberry" or "Early Blight (Tomato)"
    plantType,    // "Strawberry" or "Tomato"  ← frontend should show this, not pathogenType
    confidence:   prediction.confidence,
    pathogenType: prediction.pathogen_type,
    inferenceMs:  prediction.inference_ms,
    advice,       // always populated now
    _meta: {
      model:        'plant_disease.onnx (EfficientNet)',
      gemini_model: GEMINI_MODEL,
      analyzed_at:  new Date().toISOString(),
    },
  };
}

export async function getDetectHistory(userId: string, plantId?: string) {
  return prisma.scanHistory.findMany({
    where:   { userId, ...(plantId ? { plantId } : {}) },
    orderBy: { createdAt: 'desc' },
    take:    50,
  });
}