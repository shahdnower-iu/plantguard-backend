// src/services/onnxInference.ts

import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import path from 'path';

// ─── Constants ───────────────────────────────────────────────────────────────

let session: ort.InferenceSession | null = null;

const MODEL_PATH = path.join(process.cwd(), 'models/plant_disease.onnx');
const INPUT_SIZE  = 224;

// ImageNet normalization — matches Python training transform exactly:
//   transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD  = [0.229, 0.224, 0.225];

// ─── Class names — verified from ckpt["class_names"] (53 classes) ─────────────
// Index order matches the model output exactly. DO NOT reorder.
const CLASS_NAMES: string[] = [
    "Apple___Apple_scab",                                    //  0
    "Apple___Black_rot",                                     //  1
    "Apple___Cedar_apple_rust",                              //  2
    "Apple___healthy",                                       //  3
    "Cherry_(including_sour)___Powdery_mildew",              //  4
    "Cherry_(including_sour)___healthy",                     //  5
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot",    //  6
    "Corn_(maize)___Common_rust_",                           //  7
    "Corn_(maize)___Northern_Leaf_Blight",                   //  8
    "Corn_(maize)___healthy",                                //  9
    "Grape___Black_rot",                                     // 10
    "Grape___Esca_(Black_Measles)",                          // 11
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)",            // 12
    "Grape___healthy",                                       // 13
    "Orange__Healthy_Leaf",                                  // 14
    "Orange___Haunglongbing_(Citrus_greening)",              // 15
    "Peach___Bacterial_spot",                                // 16
    "Peach___healthy",                                       // 17
    "Pepper,_bell___Bacterial_spot",                         // 18
    "Pepper,_bell___healthy",                                // 19
    "Potato___Early_blight",                                 // 20
    "Potato___Late_blight",                                  // 21
    "Potato___healthy",                                      // 22
    "Strawberry___Leaf_scorch",                              // 23
    "Strawberry___healthy",                                  // 24
    "Tomato___Bacterial_spot",                               // 25
    "Tomato___Early_blight",                                 // 26
    "Tomato___Late_blight",                                  // 27
    "Tomato___Leaf_Mold",                                    // 28
    "Tomato___Septoria_leaf_spot",                           // 29
    "Tomato___Spider_mites Two-spotted_spider_mite",         // 30
    "Tomato___Target_Spot",                                  // 31
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus",                // 32
    "Tomato___Tomato_mosaic_virus",                          // 33
    "Tomato___healthy",                                      // 34
    "crape_jasmine___healthy",                               // 35
    "crape_jasmine___insect_bite",                           // 36
    "crape_jasmine___yld",                                   // 37
    "guava___anthracnose",                                   // 38
    "guava___healthy",                                       // 39
    "guava___insect_bite",                                   // 40
    "guava___multiple",                                      // 41
    "guava___scorch",                                        // 42
    "guava___yld",                                           // 43
    "hibiscus___blight",                                     // 44
    "hibiscus___death_leaf",                                 // 45
    "hibiscus___healthy",                                    // 46
    "hibiscus___scorch",                                     // 47
    "night_flowering_jasmine___early_blight",                // 48
    "night_flowering_jasmine___healthy",                     // 49
    "night_flowering_jasmine___red_spot",                    // 50
    "rose___blight",                                         // 51
    "rose___healthy",                                        // 52
];

// The ONNX model's input name is "input" and output name is "logits".
// Confirmed from Python: sess.run(["logits"], {"input": inp})
// We use these constants instead of session.inputNames[0] / outputNames[0]
// to avoid accidentally picking the wrong tensor (e.g. a softmax output).
const ONNX_INPUT_NAME  = 'input';
const ONNX_OUTPUT_NAME = 'logits';

const PATHOGEN_MAP: Record<string, string> = {
    // Fungal
    "scab":         "Fungal",
    "rot":          "Fungal",
    "rust":         "Fungal",
    "mildew":       "Fungal",
    "blight":       "Fungal",
    "mold":         "Fungal",
    "spot":         "Fungal",
    "blast":        "Fungal",
    "esca":         "Fungal",
    "scorch":       "Fungal",
    "streak":       "Fungal",
    "anthracnose":  "Fungal",
    // Viral
    "mottle":       "Viral",
    "virus":        "Viral",
    "curl":         "Viral",
    "mosaic":       "Viral",
    "greening":     "Viral",
    "yld":          "Viral",   // Yellow Leaf Disease
    // Bacterial
    "bacterial":    "Bacterial",
    // Pest-related
    "armyworm":     "Pest-related",
    "spider_mites": "Pest-related",
    "insect_bite":  "Pest-related",
    // Other / multi-cause
    "death_leaf":   "Environmental",
    "red_spot":     "Fungal",
    "multiple":     "Multiple",
    // Healthy
    "healthy":      "None",
};

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ModelPrediction {
    label:         string;
    raw_label:     string;
    plant_name:    string;
    healthy:       boolean;
    confidence:    number;
    pathogen_type: string;
    inference_ms:  number;
}

// ─── Model Loading ────────────────────────────────────────────────────────────

export async function loadModel(): Promise<void> {
    if (session) return;
    console.log(`🧠 Loading EfficientNet ONNX model: ${MODEL_PATH}`);
    session = await ort.InferenceSession.create(MODEL_PATH, {
        executionProviders: ['cpu'],
    });
    console.log('✅ EfficientNet model loaded');
    console.log('   Inputs :', session.inputNames);
    console.log('   Outputs:', session.outputNames);

    // Validate that the model exposes the expected names
    if (!session.inputNames.includes(ONNX_INPUT_NAME)) {
        console.warn(
            `⚠️  Expected input name "${ONNX_INPUT_NAME}" but model has: ${session.inputNames.join(', ')}`,
            '\n   Update ONNX_INPUT_NAME in onnxInference.ts to match.',
        );
    }
    if (!session.outputNames.includes(ONNX_OUTPUT_NAME)) {
        console.warn(
            `⚠️  Expected output name "${ONNX_OUTPUT_NAME}" but model has: ${session.outputNames.join(', ')}`,
            '\n   Update ONNX_OUTPUT_NAME in onnxInference.ts to match.',
        );
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferPathogen(label: string): string {
    const l = label.toLowerCase();
    for (const [keyword, ptype] of Object.entries(PATHOGEN_MAP)) {
        if (l.includes(keyword)) return ptype;
    }
    return 'Fungal';
}

function extractPlantName(rawLabel: string): string {
    // Standard separator is "___" (triple underscore).
    // "Orange__Healthy_Leaf" uses double underscore — handle both.
    const part = rawLabel.includes('___')
        ? rawLabel.split('___')[0]
        : rawLabel.split('__')[0];
    return part
        .replace(/\(.*?\)/g, '')
        .replace(/_/g, ' ')
        .replace(/,/g, '')
        .trim();
}

function formatLabel(rawLabel: string): string {
    // Support both "___" and "__" separators
    const sep    = rawLabel.includes('___') ? '___' : '__';
    const parts  = rawLabel.split(sep);
    const plant  = extractPlantName(rawLabel);
    const disease = parts[1] ? parts[1].replace(/_/g, ' ').trim() : 'Healthy';
    return disease.toLowerCase() === 'healthy'
        ? `Healthy ${plant}`
        : `${disease} (${plant})`;
}

/**
 * Numerically stable softmax.
 * ONLY call this on raw logits — not on values that are already probabilities.
 * The Python code does: np.exp(logits) / np.exp(logits).sum()
 * which is equivalent (just less numerically stable).
 */
function softmax(logits: Float32Array): number[] {
    let max = -Infinity;
    for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
    const exps = Array.from(logits).map(x => Math.exp(x - max));
    const sum  = exps.reduce((a, b) => a + b, 0);
    return exps.map(x => x / sum);
}

// ─── Preprocessing ────────────────────────────────────────────────────────────
//
// Matches the Python training pipeline exactly:
//   Image.open(IMG_PATH).convert("RGB")      → removeAlpha + toColorspace('srgb')
//   transforms.Resize((224, 224))            → sharp resize fit:'fill' (plain stretch)
//   transforms.ToTensor()                    → divide by 255
//   transforms.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225])
//
async function preprocess(imageBuffer: Buffer): Promise<Float32Array> {
    const { data } = await sharp(imageBuffer)
        .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
        .removeAlpha()
        .toColorspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true });

    const tensor = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);

    for (let c = 0; c < 3; c++) {
        const mean = IMAGENET_MEAN[c];
        const std  = IMAGENET_STD[c];
        for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
            const pixel = data[i * 3 + c] / 255.0;
            tensor[c * INPUT_SIZE * INPUT_SIZE + i] = (pixel - mean) / std;
        }
    }

    return tensor;
}

// ─── Inference ────────────────────────────────────────────────────────────────

export async function predictDisease(imageBuffer: Buffer): Promise<ModelPrediction> {
    await loadModel();

    const tensorData = await preprocess(imageBuffer);

    // Use explicit names — NOT session.inputNames[0] / outputNames[0]
    // The Python reference pins these as "input" → "logits"
    const feeds: Record<string, ort.Tensor> = {
        [ONNX_INPUT_NAME]: new ort.Tensor(
            'float32',
            tensorData,
            [1, 3, INPUT_SIZE, INPUT_SIZE],
        ),
    };

    const t0      = Date.now();
    const results = await session!.run(feeds, [ONNX_OUTPUT_NAME]);
    const inferenceMs = Date.now() - t0;

    // Get the logits tensor by explicit name
    const logitsTensor = results[ONNX_OUTPUT_NAME];
    if (!logitsTensor) {
        const available = Object.keys(results).join(', ');
        throw new Error(
            `Output "${ONNX_OUTPUT_NAME}" not found. Available: ${available}. ` +
            `Update ONNX_OUTPUT_NAME in onnxInference.ts.`,
        );
    }

    const logits = logitsTensor.data as Float32Array;

    // Apply softmax ONCE to convert raw logits → probabilities.
    // If the model already outputs probabilities (softmax layer baked in),
    // the warning below will fire and you should remove this call.
    const probs = softmax(logits);

    // Sanity check: probabilities should sum to ~1
    const sum = probs.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.01) {
        console.warn(`⚠️  Probabilities sum to ${sum.toFixed(4)} — model output may already be softmaxed.`);
    }

    let maxIdx = 0;
    for (let i = 1; i < probs.length; i++) {
        if (probs[i] > probs[maxIdx]) maxIdx = i;
    }

    const rawLabel = CLASS_NAMES[maxIdx] ?? `Unknown_class_${maxIdx}`;

    return {
        label:         formatLabel(rawLabel),
        raw_label:     rawLabel,
        plant_name:    extractPlantName(rawLabel),
        healthy:       rawLabel.toLowerCase().includes('healthy'),
        confidence:    Number(probs[maxIdx].toFixed(4)),
        pathogen_type: inferPathogen(rawLabel),
        inference_ms:  inferenceMs,
    };
}