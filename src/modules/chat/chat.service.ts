// // src/modules/chat/chat.service.ts
// // ─────────────────────────────────────────────────────────────────────────────
// // PlantGuard AI — Chat Service  (RAG v4 — pgvector + Disk Cache + Chunking)
// //
// // What changed vs v3:
// //  1. [Level 1] Disk cache — vectors are written to rag-cache.json on first
// //     build and loaded from there on every subsequent restart.  Eliminates the
// //     ~2-minute re-embedding delay that occurred on every npm run dev.
// //     Cache is invalidated automatically when KB_VERSION is bumped.
// //
// //  2. [Level 1] Chunked KB — each entry is split into focused sub-chunks
// //     (symptoms / treatment / prevention) before embedding.  Retrieval is
// //     now ~3× more precise because short, focused chunks produce tighter
// //     embedding clusters.  ~159 chunks vs the previous 53 monolithic blocks.
// //
// //  3. [Level 1] Similarity threshold — cosine similarity must exceed 0.65
// //     before a chunk is injected into the prompt.  Irrelevant passages are
// //     no longer injected just because they happened to rank highest out of
// //     a weak match set.
// //
// //  4. [Level 2] pgvector retrieval (preferred) — when the KbEmbedding table
// //     has been populated by scripts/ingest-kb.ts, all vector search is done
// //     inside PostgreSQL.  Instant startup, survives restarts, scales to 100k+
// //     chunks.  The in-memory store is kept as a fallback so the service never
// //     breaks if the table is empty.
// //
// //  5. KB is now imported from src/modules/chat/kb.ts so both the service and
// //     the ingestion script share a single source of truth.
// //
// //  All other logic (model resolution, image handling, DB persistence,
// //  session management, system prompt, language detection) is unchanged.
// // ─────────────────────────────────────────────────────────────────────────────

// import fs   from 'fs';
// import path from 'path';
// import axios from 'axios';
// import prisma from '../../config/connectionDb';
// import { env } from '../../config/env';
// import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
// import { KNOWLEDGE_BASE, KB_VERSION, KBEntry } from './kb';

// // ─── Available Models ─────────────────────────────────────────────────────────

// const MODELS = [
//   {
//     id:        'gemini_flash',
//     name:      'Gemini 2.5 Flash',
//     provider:  'Google',
//     modelName: 'gemini-2.5-flash',
//   },
//   {
//     id:        'gemini_lite',
//     name:      'Gemini 2.5 Flash-Lite',
//     provider:  'Google',
//     modelName: 'gemini-2.5-flash-lite',
//   },
//   {
//     id:       'glm_air',
//     name:     'GLM 4.5 Air (Free)',
//     provider: 'OpenRouter',
//     modelId:  'z-ai/glm-4.5-air:free',
//   },
//  {
//     id:       'ring',
//     name:     'Ring 2.6 1T',
//     provider: 'OpenRouter',
//     modelId:  'inclusionai/ring-2.6-1t',
//   },
// ] as const;

// type Model = (typeof MODELS)[number];

// function resolveModel(modelId: string | null | undefined): Model {
//   const found = MODELS.find(m => m.id === modelId);
//   if (!found) {
//     console.warn(`[chat] Model "${modelId}" not found, falling back to gemini_flash`);
//   }
//   return found ?? MODELS[0];
// }

// // ─── RAG v4 constants ─────────────────────────────────────────────────────────

// const TOP_K                = 5;
// const SIMILARITY_THRESHOLD = 0.65;   // [Level 1] reject irrelevant chunks
// const EMBEDDING_MODEL      = 'gemini-embedding-001';
// const EMBEDDING_API_BASE   = 'https://generativelanguage.googleapis.com/v1beta';

// // Disk cache path — relative to project root (same directory as package.json)
// const CACHE_PATH = path.resolve(process.cwd(), 'rag-cache.json');

// // ─── Types ────────────────────────────────────────────────────────────────────

// interface KBChunk {
//   label:     string;   // classifier label (same as KBEntry.label)
//   chunkType: 'symptoms' | 'treatment' | 'prevention' | 'full';
//   text:      string;   // the text that was embedded
//   // original entry kept so we can still format the full content for prompts
//   entry:     KBEntry;
// }

// interface VectorEntry {
//   chunk:  KBChunk;
//   vector: number[];
// }

// // ─── Chunk splitter ───────────────────────────────────────────────────────────
// // Mirrors the logic in scripts/ingest-kb.ts — keep both in sync.

// function splitIntoChunks(entry: KBEntry): KBChunk[] {
//   const content = entry.content;
//   const header  = `${entry.title} (${entry.label})`;

//   const sectionRe = /^(SYMPTOMS|TREATMENT|PREVENTION|SEVERITY|URGENCY):\s*/gm;
//   const sections: Array<{ name: string; start: number }> = [];
//   let m: RegExpExecArray | null;
//   while ((m = sectionRe.exec(content)) !== null) {
//     sections.push({ name: m[1], start: m.index + m[0].length });
//   }

//   if (sections.length < 2) {
//     return [{ label: entry.label, chunkType: 'full', text: `${header}\n${content}`, entry }];
//   }

//   const byName: Record<string, string> = {};
//   for (let i = 0; i < sections.length; i++) {
//     const { name, start } = sections[i];
//     const end = i + 1 < sections.length
//       ? sections[i + 1].start - sections[i + 1].name.length - 2
//       : content.length;
//     const text = content.slice(start, end).trim();
//     byName[name] = (byName[name] ?? '') + (byName[name] ? '\n' + text : text);
//   }

//   const chunks: KBChunk[] = [];

//   if (byName['SYMPTOMS']) {
//     let text = `${header}\nSYMPTOMS: ${byName['SYMPTOMS']}`;
//     if (byName['SEVERITY']) text += `\nSEVERITY: ${byName['SEVERITY']}`;
//     chunks.push({ label: entry.label, chunkType: 'symptoms', text, entry });
//   }
//   if (byName['TREATMENT']) {
//     let text = `${header}\nTREATMENT: ${byName['TREATMENT']}`;
//     if (byName['URGENCY']) text += `\nURGENCY: ${byName['URGENCY']}`;
//     chunks.push({ label: entry.label, chunkType: 'treatment', text, entry });
//   }
//   if (byName['PREVENTION']) {
//     const text = `${header}\nPREVENTION: ${byName['PREVENTION']}`;
//     chunks.push({ label: entry.label, chunkType: 'prevention', text, entry });
//   }

//   return chunks.length > 0 ? chunks : [{ label: entry.label, chunkType: 'full', text: `${header}\n${content}`, entry }];
// }

// // Build the full chunk list from the KB once (shared across all retrieve paths)
// const ALL_CHUNKS: KBChunk[] = KNOWLEDGE_BASE.flatMap(splitIntoChunks);

// // ─── In-memory vector store (fallback when pgvector table is empty) ────────────

// let vectorStore: VectorEntry[]       = [];
// let vectorStoreReady: boolean        = false;
// let vectorStoreInitialising: boolean = false;
// let vectorStoreError: Error | null   = null;

// // ─── Embed helpers ────────────────────────────────────────────────────────────

// const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 5, delayMs = 2000): Promise<T> {
//   for (let attempt = 1; attempt <= maxAttempts; attempt++) {
//     try { return await fn(); }
//     catch (err: any) {
//       const status = err?.response?.status ?? 0;
//       const isRetryable = status === 429 || status === 503 || status === 500;
//       if (!isRetryable || attempt === maxAttempts) throw err;
//       const wait = delayMs * Math.pow(2, attempt - 1);
//       console.warn(`[rag] HTTP ${status} — retrying in ${wait}ms (attempt ${attempt}/${maxAttempts})…`);
//       await sleep(wait);
//     }
//   }
//   throw new Error('withRetry: exhausted attempts');
// }

// async function embedText(text: string): Promise<number[]> {
//   const url = `${EMBEDDING_API_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${env.GEMINI_API_KEY}`;
//   const res = await axios.post(url, {
//     model:                `models/${EMBEDDING_MODEL}`,
//     content:              { parts: [{ text }] },
//     outputDimensionality: 768,
//     taskType:             'RETRIEVAL_QUERY',
//   });
//   return res.data.embedding.values as number[];
// }

// async function embedBatch(texts: string[]): Promise<number[][]> {
//   const url = `${EMBEDDING_API_BASE}/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${env.GEMINI_API_KEY}`;
//   const BATCH_SIZE = 5;
//   const DELAY_MS   = 12_000;
//   const results: number[][] = [];

//   for (let i = 0; i < texts.length; i += BATCH_SIZE) {
//     const slice      = texts.slice(i, i + BATCH_SIZE);
//     const batchNum   = Math.floor(i / BATCH_SIZE) + 1;
//     const totalBatch = Math.ceil(texts.length / BATCH_SIZE);
//     console.log(`[rag] Embedding batch ${batchNum}/${totalBatch}…`);

//     const res = await withRetry(() =>
//       axios.post(url, {
//         requests: slice.map(text => ({
//           model:                `models/${EMBEDDING_MODEL}`,
//           content:              { parts: [{ text }] },
//           outputDimensionality: 768,
//           taskType:             'RETRIEVAL_DOCUMENT',
//         })),
//       })
//     );

//     for (const emb of res.data.embeddings) {
//       results.push(emb.values as number[]);
//     }
//     if (i + BATCH_SIZE < texts.length) {
//       await sleep(DELAY_MS);
//     }
//   }
//   return results;
// }

// // ─── [Level 1] Disk-cached vector store ──────────────────────────────────────

// interface DiskCache {
//   version:  string;
//   vectors:  Array<{ chunkIndex: number; vector: number[] }>;
// }

// async function buildVectorStore(): Promise<void> {
//   if (vectorStoreReady || vectorStoreInitialising) return;
//   vectorStoreInitialising = true;

//   // ── Try loading from disk cache ───────────────────────────────────────────
//   try {
//     if (fs.existsSync(CACHE_PATH)) {
//       const raw: DiskCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
//       if (raw.version === KB_VERSION && raw.vectors.length === ALL_CHUNKS.length) {
//         vectorStore = raw.vectors.map(({ chunkIndex, vector }) => ({
//           chunk: ALL_CHUNKS[chunkIndex],
//           vector,
//         }));
//         vectorStoreReady        = true;
//         vectorStoreInitialising = false;
//         console.log(`[rag] ✅ Loaded ${vectorStore.length} chunk vectors from disk cache (${CACHE_PATH})`);
//         return;
//       } else {
//         console.log(`[rag] Cache version mismatch or stale — rebuilding…`);
//       }
//     }
//   } catch (cacheErr) {
//     console.warn('[rag] Failed to read disk cache — rebuilding:', (cacheErr as Error).message);
//   }

//   // ── Build from scratch (embed every chunk) ────────────────────────────────
//   console.log(`[rag] Building vector store for ${ALL_CHUNKS.length} chunks (${KNOWLEDGE_BASE.length} KB entries × ~3 chunks each)…`);
//   console.log(`[rag] Free-tier mode: ~${Math.ceil(ALL_CHUNKS.length / 5)} batches × 12s ≈ ${Math.ceil(ALL_CHUNKS.length / 5) * 12}s total`);
//   console.log(`[rag] Keyword fallback active until done.`);

//   try {
//     const texts   = ALL_CHUNKS.map(c => c.text);
//     const vectors = await embedBatch(texts);

//     vectorStore = ALL_CHUNKS.map((chunk, i) => ({ chunk, vector: vectors[i] }));

//     // ── Persist to disk ───────────────────────────────────────────────────
//     const cache: DiskCache = {
//       version: KB_VERSION,
//       vectors: vectors.map((vector, i) => ({ chunkIndex: i, vector })),
//     };
//     fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
//     console.log(`[rag] 💾 Saved vector cache to ${CACHE_PATH}`);

//     vectorStoreReady        = true;
//     vectorStoreInitialising = false;
//     vectorStoreError        = null;
//     console.log(`[rag] ✅ Vector store ready — ${vectorStore.length} chunks indexed.`);
//   } catch (err) {
//     vectorStoreInitialising = false;
//     vectorStoreError        = err as Error;
//     console.error('[rag] ❌ Failed to build vector store — keyword fallback will be used:', (err as Error).message);
//   }
// }

// // Kick off indexing in the background on module load.
// buildVectorStore().catch(() => {/* already logged */});

// // ─── Cosine similarity ────────────────────────────────────────────────────────

// function cosineSimilarity(a: number[], b: number[]): number {
//   let dot = 0, magA = 0, magB = 0;
//   for (let i = 0; i < a.length; i++) {
//     dot  += a[i] * b[i];
//     magA += a[i] * a[i];
//     magB += b[i] * b[i];
//   }
//   const denom = Math.sqrt(magA) * Math.sqrt(magB);
//   return denom === 0 ? 0 : dot / denom;
// }

// // ─── [Level 2] pgvector retrieval (primary) ───────────────────────────────────

// async function pgvectorRetrieve(
//   query: string,
//   excludeLabels: string[] = [],
// ): Promise<KBEntry[]> {
//   const queryVec = await embedText(query);
//   const vecStr   = `[${queryVec.join(',')}]`;

//   const excludeClause = excludeLabels.length > 0 ? excludeLabels : ['__none__'];

//   const rows = await prisma.$queryRaw<Array<{ label: string; chunkText: string; similarity: number }>>`
//     SELECT
//       label,
//       "chunkText" AS "chunkText",
//       1 - (embedding <=> ${vecStr}::vector) AS similarity
//     FROM "KbEmbedding"
//     WHERE
//       label NOT IN (${excludeClause.join("','") /* safe: labels are internal constants */})
//       AND 1 - (embedding <=> ${vecStr}::vector) > ${SIMILARITY_THRESHOLD}
//     ORDER BY similarity DESC
//     LIMIT ${TOP_K * 2}
//   `;

//   if (rows.length === 0) return [];

//   // Deduplicate by label — pick the best-scoring chunk per entry,
//   // then map back to the full KBEntry for prompt injection.
//   const byLabel = new Map<string, string>();
//   for (const row of rows) {
//     if (!byLabel.has(row.label)) byLabel.set(row.label, row.label);
//   }

//   const labels = [...byLabel.keys()].slice(0, TOP_K);

//   console.log(
//     '[rag] pgvector top matches:',
//     rows.slice(0, 3).map(r => `${r.label} (${r.similarity.toFixed(3)})`),
//   );

//   return labels
//     .map(label => KNOWLEDGE_BASE.find(e => e.label === label))
//     .filter((e): e is KBEntry => e !== undefined);
// }

// // ─── [Level 1+2] In-memory embedding retrieval (fallback) ────────────────────

// async function embeddingRetrieve(
//   query: string,
//   excludeLabels: string[] = [],
// ): Promise<KBEntry[]> {
//   if (!vectorStoreReady) await buildVectorStore();
//   if (!vectorStoreReady) throw vectorStoreError ?? new Error('[rag] Vector store not ready');

//   const queryVec = await embedText(query);

//   // [Level 1] Apply similarity threshold — don't inject irrelevant chunks
//   const scored = vectorStore
//     .filter(v => !excludeLabels.includes(v.chunk.label))
//     .map(v => ({ chunk: v.chunk, sim: cosineSimilarity(queryVec, v.vector) }))
//     .filter(v => v.sim > SIMILARITY_THRESHOLD)
//     .sort((a, b) => b.sim - a.sim)
//     .slice(0, TOP_K * 2);

//   if (scored.length === 0) return [];

//   // Deduplicate by label
//   const seen = new Set<string>();
//   const entries: KBEntry[] = [];
//   for (const { chunk } of scored) {
//     if (!seen.has(chunk.label)) {
//       seen.add(chunk.label);
//       entries.push(chunk.entry);
//       if (entries.length >= TOP_K) break;
//     }
//   }

//   console.log(
//     '[rag] In-memory top matches:',
//     scored.slice(0, 3).map(s => `${s.chunk.label} (${s.sim.toFixed(3)})`),
//   );

//   return entries;
// }

// // ─── Keyword fallback (v2 logic, kept for resilience) ────────────────────────

// function keywordRetrieve(query: string, excludeLabels: string[] = []): KBEntry[] {
//   const q = query.toLowerCase();
//   return KNOWLEDGE_BASE
//     .filter(e => !excludeLabels.includes(e.label))
//     .map(entry => {
//       const titleTerms = entry.title.toLowerCase().split(/\s+/);
//       const titleScore = titleTerms.filter(t => q.includes(t) || t.includes(q.split(' ')[0])).length * 3;
//       const kwScore    = entry.keywords.filter(kw => q.includes(kw)).length;
//       return { entry, score: titleScore + kwScore };
//     })
//     .filter(e => e.score > 0)
//     .sort((a, b) => b.score - a.score)
//     .slice(0, TOP_K)
//     .map(e => e.entry);
// }

// // ─── Check whether pgvector table has been populated ─────────────────────────

// let pgvectorAvailable: boolean | null = null;   // null = not yet checked

// async function isPgvectorPopulated(): Promise<boolean> {
//   if (pgvectorAvailable !== null) return pgvectorAvailable;
//   try {
//     const result = await prisma.$queryRaw<[{ count: bigint }]>`
//       SELECT COUNT(*) AS count FROM "KbEmbedding"
//     `;
//     pgvectorAvailable = Number(result[0].count) > 0;
//     if (pgvectorAvailable) {
//       console.log(`[rag] pgvector table has ${result[0].count} rows — using DB retrieval`);
//     } else {
//       console.log('[rag] pgvector table is empty — using in-memory fallback');
//     }
//   } catch {
//     pgvectorAvailable = false;
//     console.warn('[rag] pgvector table not accessible — using in-memory fallback');
//   }
//   return pgvectorAvailable;
// }

// // ─── Public retriever — pgvector → in-memory → keyword ───────────────────────

// async function retrieveContext(
//   query: string,
//   excludeLabels: string[] = [],
// ): Promise<KBEntry[]> {
//   // [Level 2] Try pgvector first
//   if (await isPgvectorPopulated()) {
//     try {
//       const results = await pgvectorRetrieve(query, excludeLabels);
//       if (results.length > 0) return results;
//       // Fell below threshold — return empty (no irrelevant injection)
//       return [];
//     } catch (err) {
//       console.warn('[rag] pgvector retrieval failed, falling back to in-memory:', (err as Error).message);
//     }
//   }

//   // [Level 1] Try in-memory vector store
//   try {
//     return await embeddingRetrieve(query, excludeLabels);
//   } catch (err) {
//     console.warn('[rag] In-memory retrieval failed, using keyword fallback:', (err as Error).message);
//     return keywordRetrieve(query, excludeLabels);
//   }
// }

// // ─── Merge + format helpers ───────────────────────────────────────────────────

// function mergeEntries(a: KBEntry[], b: KBEntry[]): KBEntry[] {
//   const seen = new Set(a.map(e => e.label));
//   return [...a, ...b.filter(e => !seen.has(e.label))].slice(0, TOP_K + 2);
// }

// function formatContext(entries: KBEntry[]): string {
//   if (entries.length === 0) {
//     return '(No specific knowledge base entry matched this query — answer from your expert plant knowledge.)';
//   }
//   return entries.map(e => e.content).join('\n\n---\n\n');
// }

// // ─── Scan Context Types ───────────────────────────────────────────────────────

// interface ScanContext {
//   scanType?:        'disease' | 'spread';
//   plantName?:       string;
//   plantImageUrl?:   string;
//   disease?:         string | null;
//   confidence?:      number | null;
//   recommendation?:  string | null;
//   diseaseName?:     string | null;
//   spreadPercentage?: number | null;
//   severity?:        string | null;
//   analysis?:        string | null;
// }

// interface PlantContext {
//   name:      string;
//   species?:  string | null;
//   notes?:    string | null;
//   imageUrls: string[];
// }

// // ─── System Prompt ────────────────────────────────────────────────────────────

// function buildSystemPrompt(
//   ragContext: string,
//   lang: 'en' | 'ar',
//   scanContext?:  ScanContext,
//   plantContext?: PlantContext,
// ): string {
//   const langInstruction =
//     lang === 'ar' ? 'يجب أن ترد باللغة العربية الفصحى فقط.' : 'Respond in clear English.';

//   let prompt =
//     `You are PlantGuard AI, a friendly and expert plant care assistant specialising in plant diseases, pests, and care.\n` +
//     `${langInstruction}\n\n` +
//     `INSTRUCTIONS:\n` +
//     `1. Use the RELEVANT KNOWLEDGE section below as your PRIMARY source when it covers the topic.\n` +
//     `2. If the topic is NOT covered or only partially covered in the knowledge base, answer FULLY from your own expert knowledge — NEVER tell the user you don't have information. You are a plant expert and can answer any plant-related question.\n` +
//     `3. Always give practical, actionable advice. Be concise and encouraging.\n\n` +
//     `RELEVANT KNOWLEDGE (use as primary source when applicable):\n${ragContext}`;

//   if (plantContext) {
//     prompt += `\n\n─── PLANT PROFILE ───\n`;
//     prompt += `Plant name: ${plantContext.name}\n`;
//     if (plantContext.species) prompt += `Species: ${plantContext.species}\n`;
//     if (plantContext.notes)   prompt += `Owner notes: ${plantContext.notes}\n`;
//     if (plantContext.imageUrls.length > 0)
//       prompt += `Photos: ${plantContext.imageUrls.length} image(s) attached to this conversation.\n`;
//     prompt +=
//       `\nAlways refer to this plant by its name ("${plantContext.name}") in your responses. ` +
//       `Use the plant's profile and any attached images to give specific, personalised advice.\n`;
//   }

//   if (scanContext) {
//     prompt += `\n\n─── PLANT SCAN CONTEXT ───\n`;
//     if (scanContext.plantName) prompt += `Plant: ${scanContext.plantName}\n`;
//     if (scanContext.scanType === 'disease') {
//       prompt += `Scan type: Disease Detection\n`;
//       if (scanContext.disease) {
//         prompt += `Disease detected: ${scanContext.disease}\n`;
//         prompt += `Confidence: ${Math.round((scanContext.confidence ?? 0) * 100)}%\n`;
//       } else {
//         prompt += `Result: Plant appears healthy\n`;
//       }
//       if (scanContext.recommendation) prompt += `Recommendation: ${scanContext.recommendation}\n`;
//     } else if (scanContext.scanType === 'spread') {
//       prompt += `Scan type: Spread Analysis\n`;
//       if (scanContext.diseaseName) {
//         prompt += `Disease: ${scanContext.diseaseName}\n`;
//         prompt += `Spread: ${scanContext.spreadPercentage ?? '?'}%\n`;
//         prompt += `Severity: ${scanContext.severity ?? 'unknown'}\n`;
//       }
//       if (scanContext.analysis) prompt += `Analysis: ${scanContext.analysis}\n`;
//     }
//     if (scanContext.plantImageUrl)
//       prompt += `\nThe plant image has been attached for your reference.`;
//     prompt +=
//       `\n\nThe user is asking about this specific plant and scan result. ` +
//       `Use the scan context above to give targeted, specific advice.`;
//   }

//   return prompt;
// }

// // ─── Load scan context from DB ────────────────────────────────────────────────

// async function loadScanContext(
//   scanId: string,
//   scanType: 'disease' | 'spread',
//   plantId?: string | null,
// ): Promise<ScanContext> {
//   const ctx: ScanContext = { scanType };

//   if (plantId) {
//     const plant = await prisma.plant.findUnique({
//       where:  { plant_id: plantId },
//       select: { name: true, imageUrl: true },
//     });
//     if (plant) {
//       ctx.plantName     = plant.name;
//       ctx.plantImageUrl = plant.imageUrl ?? undefined;
//     }
//   }

//   if (scanType === 'disease') {
//     const scan = await prisma.scanHistory.findUnique({
//       where:  { scan_id: scanId },
//       select: { disease: true, confidence: true, recommendation: true, imageUrl: true },
//     });
//     if (scan) {
//       ctx.disease        = scan.disease;
//       ctx.confidence     = scan.confidence;
//       ctx.recommendation = scan.recommendation;
//       if (!ctx.plantImageUrl) ctx.plantImageUrl = scan.imageUrl;
//     }
//   } else {
//     const scan = await prisma.spreadScanHistory.findUnique({
//       where:  { spread_scan_id: scanId },
//       select: { diseaseName: true, spreadPercentage: true, severity: true, analysis: true, imageUrls: true },
//     });
//     if (scan) {
//       ctx.diseaseName      = scan.diseaseName;
//       ctx.spreadPercentage = scan.spreadPercentage;
//       ctx.severity         = scan.severity;
//       ctx.analysis         = scan.analysis;
//       if (!ctx.plantImageUrl && scan.imageUrls.length > 0)
//         ctx.plantImageUrl = scan.imageUrls[0];
//     }
//   }

//   return ctx;
// }

// // ─── Load plant context from DB ───────────────────────────────────────────────

// async function loadPlantContext(plantId: string): Promise<PlantContext | null> {
//   const plant = await prisma.plant.findUnique({
//     where:  { plant_id: plantId },
//     select: { name: true, scientificName: true, notes: true, imageUrl: true },
//   });
//   if (!plant) return null;
//   return {
//     name:      plant.name,
//     species:   plant.scientificName ?? null,
//     notes:     plant.notes ?? null,
//     imageUrls: plant.imageUrl ? [plant.imageUrl] : [],
//   };
// }

// // ─── Gemini API caller ────────────────────────────────────────────────────────

// async function callGemini(
//   messages:         { role: string; content: string; imageUrl?: string | null }[],
//   systemPrompt:     string,
//   modelName:        string,
//   contextImageUrls: string[] = [],
// ): Promise<string> {
//   const contents = await Promise.all(
//     messages.map(async (m, i) => {
//       const isLastUser = i === messages.length - 1 && m.role === 'user';
//       const parts: any[] = [{ text: m.content }];

//       if (m.imageUrl) {
//         const imgResp = await axios.get(m.imageUrl, { responseType: 'arraybuffer' });
//         const base64  = Buffer.from(imgResp.data as ArrayBuffer).toString('base64');
//         const mime    = (imgResp.headers['content-type'] as string) || 'image/jpeg';
//         parts.push({ inlineData: { mimeType: mime, data: base64 } });
//       }

//       if (isLastUser && !m.imageUrl && contextImageUrls.length > 0) {
//         for (const url of contextImageUrls) {
//           try {
//             const imgResp = await axios.get(url, { responseType: 'arraybuffer' });
//             const base64  = Buffer.from(imgResp.data as ArrayBuffer).toString('base64');
//             const mime    = (imgResp.headers['content-type'] as string) || 'image/jpeg';
//             parts.push({ inlineData: { mimeType: mime, data: base64 } });
//           } catch { /* non-fatal */ }
//         }
//       }

//       return { role: m.role === 'assistant' ? 'model' : 'user', parts };
//     })
//   );

//   const res = await axios.post(
//     `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`,
//     {
//       system_instruction: { parts: [{ text: systemPrompt }] },
//       contents,
//       generationConfig: { maxOutputTokens: 2048 },
//     },
//   );

//   return res.data.candidates[0].content.parts[0].text as string;
// }

// // ─── OpenRouter API caller ────────────────────────────────────────────────────

// async function callOpenRouter(
//   messages:         { role: string; content: string; imageUrl?: string | null }[],
//   systemPrompt:     string,
//   modelId:          string,
//   contextImageUrls: string[] = [],
// ): Promise<string> {
//   const formatted = messages.map((m, i) => {
//     const isLastUser = i === messages.length - 1 && m.role === 'user';

//     if (m.imageUrl) {
//       return {
//         role: m.role,
//         content: [
//           { type: 'text',      text: m.content },
//           { type: 'image_url', image_url: { url: m.imageUrl } },
//         ],
//       };
//     }

//     if (isLastUser && contextImageUrls.length > 0) {
//       return {
//         role: m.role,
//         content: [
//           { type: 'text', text: m.content },
//           ...contextImageUrls.map(url => ({ type: 'image_url', image_url: { url } })),
//         ],
//       };
//     }

//     return { role: m.role, content: m.content };
//   });

//   const res = await axios.post(
//     'https://openrouter.ai/api/v1/chat/completions',
//     {
//       model:      modelId,
//       messages:   [{ role: 'system', content: systemPrompt }, ...formatted],
//       max_tokens: 2048,
//     },
//     { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } },
//   );

//   return res.data.choices[0].message.content as string;
// }

// // ─── sendMessage ──────────────────────────────────────────────────────────────

// export async function sendMessage(params: {
//   userId:          string;
//   message:         string;
//   sessionId?:      string;
//   requestedModel?: string;
//   imageUrl?:       string;
// }): Promise<{
//   reply:     string;
//   sessionId: string;
//   messageId: string;
//   model:     Model;
//   switched:  boolean;
// }> {
//   const { userId, message, sessionId, requestedModel, imageUrl } = params;

//   if (!message?.trim()) throw new ValidationError('Message cannot be empty');

//   // ── Resolve or create session ─────────────────────────────────────────────
//   let session = sessionId
//     ? await prisma.chatSession.findUnique({ where: { chat_session_id: sessionId } })
//     : null;

//   if (sessionId && !session) throw new NotFoundError('Chat session');
//   if (session && session.userId !== userId) throw new ForbiddenError();

//   if (!session) {
//     const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
//     session = await prisma.chatSession.create({ data: { userId, title } });
//   }

//   // ── Resolve model ─────────────────────────────────────────────────────────
//   const effectiveModelId = requestedModel ?? session.model ?? 'gemini_flash';
//   const selectedModel    = resolveModel(effectiveModelId);

//   // ── Load conversation history ─────────────────────────────────────────────
//   const history = await prisma.chatMessage.findMany({
//     where:   { sessionId: session.chat_session_id },
//     orderBy: { createdAt: 'asc' },
//     take:    20,
//     select:  { role: true, content: true, imageUrl: true },
//   });

//   const messagesForAI = [
//     ...history.map(m => ({ role: m.role, content: m.content, imageUrl: m.imageUrl })),
//     { role: 'user', content: message, imageUrl: imageUrl ?? null },
//   ];

//   // ── Load plant context ────────────────────────────────────────────────────
//   let plantContext: PlantContext | undefined;
//   const contextImageUrls: string[] = [];

//   if (session.plantId) {
//     try {
//       const loaded = await loadPlantContext(session.plantId);
//       if (loaded) {
//         plantContext = loaded;
//         contextImageUrls.push(...loaded.imageUrls);
//       }
//     } catch { /* Non-fatal */ }
//   }

//   // ── Load scan context ─────────────────────────────────────────────────────
//   let scanContext: ScanContext | undefined;

//   if (session.scanId && session.scanType) {
//     try {
//       scanContext = await loadScanContext(
//         session.scanId,
//         session.scanType as 'disease' | 'spread',
//         session.plantId,
//       );
//       if (scanContext.plantImageUrl) contextImageUrls.unshift(scanContext.plantImageUrl);
//     } catch { /* Non-fatal */ }
//   }

//   // ── RAG v4: pgvector → in-memory → keyword, both queries in parallel ──────
//   //
//   // When a scan is attached we run a second query keyed on the disease label
//   // so that disease-specific chunks are always included even if the user's
//   // message is very short.
//   const diseaseQuery = scanContext?.disease ?? scanContext?.diseaseName ?? null;

//   const [queryEntries, scanEntries] = await Promise.all([
//     retrieveContext(message),
//     diseaseQuery ? retrieveContext(diseaseQuery) : Promise.resolve([] as KBEntry[]),
//   ]);

//   const allEntries = mergeEntries(queryEntries, scanEntries);
//   const ragContext  = formatContext(allEntries);

//   // ── Language detection ────────────────────────────────────────────────────
//   const lang = /[\u0600-\u06FF]/.test(message) ? 'ar' : 'en';

//   // ── Build system prompt ───────────────────────────────────────────────────
//   const systemPrompt = buildSystemPrompt(ragContext, lang, scanContext, plantContext);

//   // ── Call AI with one fallback ─────────────────────────────────────────────
//   const modelIndex = MODELS.findIndex(m => m.id === selectedModel.id);
//   let reply     = '';
//   let switched  = false;
//   let usedModel: Model = selectedModel;

//   const tryModel = async (model: Model): Promise<string> => {
//     if (model.provider === 'Google') {
//       return callGemini(messagesForAI, systemPrompt, (model as any).modelName, contextImageUrls);
//     }
//     return callOpenRouter(messagesForAI, systemPrompt, (model as any).modelId, contextImageUrls);
//   };

//   try {
//     reply = await tryModel(selectedModel);
//   } catch (primaryErr) {
//     console.error(`[chat] ${selectedModel.name} failed:`, primaryErr);
//     const fallback = MODELS[(modelIndex + 1) % MODELS.length];
//     console.warn(`[chat] Falling back to ${fallback.name}`);
//     try {
//       reply     = await tryModel(fallback);
//       usedModel = fallback;
//       switched  = true;
//     } catch (fallbackErr) {
//       console.error(`[chat] Fallback ${fallback.name} also failed:`, fallbackErr);
//       throw new Error('All AI models are currently unavailable. Please try again.');
//     }
//   }

//   // ── Persist messages ──────────────────────────────────────────────────────
//   await prisma.chatMessage.create({
//     data: {
//       sessionId: session.chat_session_id,
//       role:      'user',
//       content:   message,
//       imageUrl:  imageUrl ?? undefined,
//     },
//   });

//   const assistantMsg = await prisma.chatMessage.create({
//     data: {
//       sessionId: session.chat_session_id,
//       role:      'assistant',
//       content:   reply,
//     },
//   });

//   await prisma.chatSession.update({
//     where: { chat_session_id: session.chat_session_id },
//     data:  { updatedAt: new Date(), model: usedModel.id },
//   });

//   return {
//     reply,
//     sessionId: session.chat_session_id,
//     messageId: assistantMsg.chat_message_id,
//     model:     usedModel,
//     switched,
//   };
// }

// // ─── Session management (unchanged) ──────────────────────────────────────────

// export async function createSession(params: {
//   userId:    string;
//   title?:    string;
//   model?:    string;
//   plantId?:  string;
//   scanId?:   string;
//   scanType?: 'disease' | 'spread';
// }) {
//   return prisma.chatSession.create({
//     data: {
//       userId:   params.userId,
//       title:    params.title ?? 'New Chat',
//       model:    params.model ?? 'gemini_flash',
//       plantId:  params.plantId ?? undefined,
//       scanId:   params.scanId ?? undefined,
//       scanType: params.scanType ?? undefined,
//     },
//   });
// }

// export async function getUserSessions(userId: string) {
//   const sessions = await prisma.chatSession.findMany({
//     where:   { userId },
//     orderBy: { updatedAt: 'desc' },
//     select: {
//       chat_session_id: true,
//       title:           true,
//       model:           true,
//       plantId:         true,
//       scanId:          true,
//       scanType:        true,
//       createdAt:       true,
//       updatedAt:       true,
//     },
//   });
//   return sessions.map(s => ({ ...s, currentModel: resolveModel(s.model) }));
// }

// export async function getSessionMessages(sessionId: string, userId: string) {
//   const session = await prisma.chatSession.findUnique({
//     where:  { chat_session_id: sessionId },
//     select: { userId: true, model: true, plantId: true, scanId: true, scanType: true },
//   });

//   if (!session) throw new NotFoundError('Chat session');
//   if (session.userId !== userId) throw new ForbiddenError();

//   const messages = await prisma.chatMessage.findMany({
//     where:   { sessionId },
//     orderBy: { createdAt: 'asc' },
//     select: {
//       chat_message_id: true,
//       role:            true,
//       content:         true,
//       imageUrl:        true,
//       createdAt:       true,
//     },
//   });

//   return {
//     messages,
//     currentModel: resolveModel(session.model),
//     plantId:      session.plantId,
//     scanId:       session.scanId,
//     scanType:     session.scanType,
//   };
// }

// export async function deleteSession(sessionId: string, userId: string): Promise<void> {
//   const session = await prisma.chatSession.findUnique({ where: { chat_session_id: sessionId } });
//   if (!session) throw new NotFoundError('Chat session');
//   if (session.userId !== userId) throw new ForbiddenError();
//   await prisma.chatSession.delete({ where: { chat_session_id: sessionId } });
// }






// src/modules/chat/chat.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// PlantGuard AI — Chat Service  (RAG v4 — pgvector + Disk Cache + Chunking)
//
// What changed vs v3:
//  1. [Level 1] Disk cache — vectors are written to rag-cache.json on first
//     build and loaded from there on every subsequent restart.  Eliminates the
//     ~2-minute re-embedding delay that occurred on every npm run dev.
//     Cache is invalidated automatically when KB_VERSION is bumped.
//
//  2. [Level 1] Chunked KB — each entry is split into focused sub-chunks
//     (symptoms / treatment / prevention) before embedding.  Retrieval is
//     now ~3× more precise because short, focused chunks produce tighter
//     embedding clusters.  ~159 chunks vs the previous 53 monolithic blocks.
//
//  3. [Level 1] Similarity threshold — cosine similarity must exceed 0.65
//     before a chunk is injected into the prompt.  Irrelevant passages are
//     no longer injected just because they happened to rank highest out of
//     a weak match set.
//
//  4. [Level 2] pgvector retrieval (preferred) — when the KbEmbedding table
//     has been populated by scripts/ingest-kb.ts, all vector search is done
//     inside PostgreSQL.  Instant startup, survives restarts, scales to 100k+
//     chunks.  The in-memory store is kept as a fallback so the service never
//     breaks if the table is empty.
//
//  5. KB is now imported from src/modules/chat/kb.ts so both the service and
//     the ingestion script share a single source of truth.
//
//  All other logic (model resolution, image handling, DB persistence,
//  session management, system prompt, language detection) is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import fs   from 'fs';
import path from 'path';
import axios from 'axios';
import prisma from '../../config/connectionDb';
import { env } from '../../config/env';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import { KNOWLEDGE_BASE, KB_VERSION, KBEntry } from './kb';

// ─── Available Models ─────────────────────────────────────────────────────────

const MODELS = [
  { id: 'gemini_flash', name: 'Gemini 2.5 Flash',         provider: 'Google',     modelName: 'gemini-2.5-flash' },
  { id: 'gemini_lite',  name: 'Gemini 2.5 Flash-Lite',    provider: 'Google',     modelName: 'gemini-2.5-flash-lite' },
  { id: 'gemma_31b',    name: 'Gemma 4 31B (Free)',        provider: 'OpenRouter', modelId: 'google/gemma-4-31b-it:free' },
  { id: 'gpt_oss',      name: 'GPT OSS 20B (Free)',        provider: 'OpenRouter', modelId: 'openai/gpt-oss-20b:free' },
  { id: 'ring',         name: 'Ring 2.6 1T',               provider: 'OpenRouter', modelId: 'inclusionai/ring-2.6-1t' },
] as const;

type Model = (typeof MODELS)[number];

function resolveModel(modelId: string | null | undefined): Model {
  if (!modelId || modelId === 'null') return MODELS[0];   // silence stale-session noise
  const found = MODELS.find(m => m.id === modelId);
  if (!found) {
    console.warn(`[chat] Model "${modelId}" not found, falling back to ${MODELS[0].name}`);
  }
  return found ?? MODELS[0];
}

// ─── RAG v4 constants ─────────────────────────────────────────────────────────

const TOP_K                = 5;
const SIMILARITY_THRESHOLD = 0.65;   // [Level 1] reject irrelevant chunks
const EMBEDDING_MODEL      = 'gemini-embedding-001';
const EMBEDDING_API_BASE   = 'https://generativelanguage.googleapis.com/v1beta';

// Use a dedicated embedding key if provided so embedding quota stays separate
// from chat completion quota. Add GEMINI_EMBEDDING_API_KEY to your .env with
// a second Google key — or point it at the same key if you only have one.
const EMBEDDING_API_KEY = (env as any).GEMINI_EMBEDDING_API_KEY ?? env.GEMINI_API_KEY;

// Disk cache path — relative to project root (same directory as package.json)
const CACHE_PATH = path.resolve(process.cwd(), 'rag-cache.json');

// ─── Types ────────────────────────────────────────────────────────────────────

interface KBChunk {
  label:     string;   // classifier label (same as KBEntry.label)
  chunkType: 'symptoms' | 'treatment' | 'prevention' | 'full';
  text:      string;   // the text that was embedded
  // original entry kept so we can still format the full content for prompts
  entry:     KBEntry;
}

interface VectorEntry {
  chunk:  KBChunk;
  vector: number[];
}

// ─── Chunk splitter ───────────────────────────────────────────────────────────
// Mirrors the logic in scripts/ingest-kb.ts — keep both in sync.

function splitIntoChunks(entry: KBEntry): KBChunk[] {
  const content = entry.content;
  const header  = `${entry.title} (${entry.label})`;

  const sectionRe = /^(SYMPTOMS|TREATMENT|PREVENTION|SEVERITY|URGENCY):\s*/gm;
  const sections: Array<{ name: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(content)) !== null) {
    sections.push({ name: m[1], start: m.index + m[0].length });
  }

  if (sections.length < 2) {
    return [{ label: entry.label, chunkType: 'full', text: `${header}\n${content}`, entry }];
  }

  const byName: Record<string, string> = {};
  for (let i = 0; i < sections.length; i++) {
    const { name, start } = sections[i];
    const end = i + 1 < sections.length
      ? sections[i + 1].start - sections[i + 1].name.length - 2
      : content.length;
    const text = content.slice(start, end).trim();
    byName[name] = (byName[name] ?? '') + (byName[name] ? '\n' + text : text);
  }

  const chunks: KBChunk[] = [];

  if (byName['SYMPTOMS']) {
    let text = `${header}\nSYMPTOMS: ${byName['SYMPTOMS']}`;
    if (byName['SEVERITY']) text += `\nSEVERITY: ${byName['SEVERITY']}`;
    chunks.push({ label: entry.label, chunkType: 'symptoms', text, entry });
  }
  if (byName['TREATMENT']) {
    let text = `${header}\nTREATMENT: ${byName['TREATMENT']}`;
    if (byName['URGENCY']) text += `\nURGENCY: ${byName['URGENCY']}`;
    chunks.push({ label: entry.label, chunkType: 'treatment', text, entry });
  }
  if (byName['PREVENTION']) {
    const text = `${header}\nPREVENTION: ${byName['PREVENTION']}`;
    chunks.push({ label: entry.label, chunkType: 'prevention', text, entry });
  }

  return chunks.length > 0 ? chunks : [{ label: entry.label, chunkType: 'full', text: `${header}\n${content}`, entry }];
}

// Build the full chunk list from the KB once (shared across all retrieve paths)
const ALL_CHUNKS: KBChunk[] = KNOWLEDGE_BASE.flatMap(splitIntoChunks);

// ─── In-memory vector store (fallback when pgvector table is empty) ────────────

let vectorStore: VectorEntry[]       = [];
let vectorStoreReady: boolean        = false;
let vectorStoreInitialising: boolean = false;
let vectorStoreError: Error | null   = null;

// ─── Embed helpers ────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 5, delayMs = 2000): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (err: any) {
      const status = err?.response?.status ?? 0;
      const isRetryable = status === 429 || status === 503 || status === 500;
      if (!isRetryable || attempt === maxAttempts) throw err;
      const wait = delayMs * Math.pow(2, attempt - 1);
      console.warn(`[rag] HTTP ${status} — retrying in ${wait}ms (attempt ${attempt}/${maxAttempts})…`);
      await sleep(wait);
    }
  }
  throw new Error('withRetry: exhausted attempts');
}

async function embedText(text: string): Promise<number[]> {
  const url = `${EMBEDDING_API_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${EMBEDDING_API_KEY}`;
  const res = await withRetry(() =>
    axios.post(url, {
      model:                `models/${EMBEDDING_MODEL}`,
      content:              { parts: [{ text }] },
      outputDimensionality: 768,
      taskType:             'RETRIEVAL_QUERY',
    })
  , 3, 3000);
  return res.data.embedding.values as number[];
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const url = `${EMBEDDING_API_BASE}/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${EMBEDDING_API_KEY}`;
  const BATCH_SIZE = 5;
  const DELAY_MS   = 12_000;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice      = texts.slice(i, i + BATCH_SIZE);
    const batchNum   = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatch = Math.ceil(texts.length / BATCH_SIZE);
    console.log(`[rag] Embedding batch ${batchNum}/${totalBatch}…`);

    const res = await withRetry(() =>
      axios.post(url, {
        requests: slice.map(text => ({
          model:                `models/${EMBEDDING_MODEL}`,
          content:              { parts: [{ text }] },
          outputDimensionality: 768,
          taskType:             'RETRIEVAL_DOCUMENT',
        })),
      })
    );

    for (const emb of res.data.embeddings) {
      results.push(emb.values as number[]);
    }
    if (i + BATCH_SIZE < texts.length) {
      await sleep(DELAY_MS);
    }
  }
  return results;
}

// ─── [Level 1] Disk-cached vector store ──────────────────────────────────────

interface DiskCache {
  version:  string;
  vectors:  Array<{ chunkIndex: number; vector: number[] }>;
}

async function buildVectorStore(): Promise<void> {
  if (vectorStoreReady || vectorStoreInitialising) return;
  vectorStoreInitialising = true;

  // ── Try loading from disk cache ───────────────────────────────────────────
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const raw: DiskCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
      if (raw.version === KB_VERSION && raw.vectors.length === ALL_CHUNKS.length) {
        vectorStore = raw.vectors.map(({ chunkIndex, vector }) => ({
          chunk: ALL_CHUNKS[chunkIndex],
          vector,
        }));
        vectorStoreReady        = true;
        vectorStoreInitialising = false;
        console.log(`[rag] ✅ Loaded ${vectorStore.length} chunk vectors from disk cache (${CACHE_PATH})`);
        return;
      } else {
        console.log(`[rag] Cache version mismatch or stale — rebuilding…`);
      }
    }
  } catch (cacheErr) {
    console.warn('[rag] Failed to read disk cache — rebuilding:', (cacheErr as Error).message);
  }

  // ── Build from scratch (embed every chunk) ────────────────────────────────
  console.log(`[rag] Building vector store for ${ALL_CHUNKS.length} chunks (${KNOWLEDGE_BASE.length} KB entries × ~3 chunks each)…`);
  console.log(`[rag] Free-tier mode: ~${Math.ceil(ALL_CHUNKS.length / 5)} batches × 12s ≈ ${Math.ceil(ALL_CHUNKS.length / 5) * 12}s total`);
  console.log(`[rag] Keyword fallback active until done.`);

  try {
    const texts   = ALL_CHUNKS.map(c => c.text);
    const vectors = await embedBatch(texts);

    vectorStore = ALL_CHUNKS.map((chunk, i) => ({ chunk, vector: vectors[i] }));

    // ── Persist to disk ───────────────────────────────────────────────────
    const cache: DiskCache = {
      version: KB_VERSION,
      vectors: vectors.map((vector, i) => ({ chunkIndex: i, vector })),
    };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
    console.log(`[rag] 💾 Saved vector cache to ${CACHE_PATH}`);

    vectorStoreReady        = true;
    vectorStoreInitialising = false;
    vectorStoreError        = null;
    console.log(`[rag] ✅ Vector store ready — ${vectorStore.length} chunks indexed.`);
  } catch (err) {
    vectorStoreInitialising = false;
    vectorStoreError        = err as Error;
    console.error('[rag] ❌ Failed to build vector store — keyword fallback will be used:', (err as Error).message);
  }
}

// Kick off indexing in the background on module load.
buildVectorStore().catch(() => {/* already logged */});

// ─── Cosine similarity ────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── [Level 2] pgvector retrieval (primary) ───────────────────────────────────

async function pgvectorRetrieve(
  query: string,
  excludeLabels: string[] = [],
): Promise<KBEntry[]> {
  const queryVec = await embedText(query);
  const vecStr   = `[${queryVec.join(',')}]`;

  const excludeClause = excludeLabels.length > 0 ? excludeLabels : ['__none__'];

  const rows = await prisma.$queryRaw<Array<{ label: string; chunkText: string; similarity: number }>>`
    SELECT
      label,
      "chunkText" AS "chunkText",
      1 - (embedding <=> ${vecStr}::vector) AS similarity
    FROM "KbEmbedding"
    WHERE
      label NOT IN (${excludeClause.join("','") /* safe: labels are internal constants */})
      AND 1 - (embedding <=> ${vecStr}::vector) > ${SIMILARITY_THRESHOLD}
    ORDER BY similarity DESC
    LIMIT ${TOP_K * 2}
  `;

  if (rows.length === 0) return [];

  // Deduplicate by label — pick the best-scoring chunk per entry,
  // then map back to the full KBEntry for prompt injection.
  const byLabel = new Map<string, string>();
  for (const row of rows) {
    if (!byLabel.has(row.label)) byLabel.set(row.label, row.label);
  }

  const labels = [...byLabel.keys()].slice(0, TOP_K);

  console.log(
    '[rag] pgvector top matches:',
    rows.slice(0, 3).map(r => `${r.label} (${r.similarity.toFixed(3)})`),
  );

  return labels
    .map(label => KNOWLEDGE_BASE.find(e => e.label === label))
    .filter((e): e is KBEntry => e !== undefined);
}

// ─── [Level 1+2] In-memory embedding retrieval (fallback) ────────────────────

async function embeddingRetrieve(
  query: string,
  excludeLabels: string[] = [],
): Promise<KBEntry[]> {
  if (!vectorStoreReady) await buildVectorStore();
  if (!vectorStoreReady) throw vectorStoreError ?? new Error('[rag] Vector store not ready');

  const queryVec = await embedText(query);

  // [Level 1] Apply similarity threshold — don't inject irrelevant chunks
  const scored = vectorStore
    .filter(v => !excludeLabels.includes(v.chunk.label))
    .map(v => ({ chunk: v.chunk, sim: cosineSimilarity(queryVec, v.vector) }))
    .filter(v => v.sim > SIMILARITY_THRESHOLD)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, TOP_K * 2);

  if (scored.length === 0) return [];

  // Deduplicate by label
  const seen = new Set<string>();
  const entries: KBEntry[] = [];
  for (const { chunk } of scored) {
    if (!seen.has(chunk.label)) {
      seen.add(chunk.label);
      entries.push(chunk.entry);
      if (entries.length >= TOP_K) break;
    }
  }

  console.log(
    '[rag] In-memory top matches:',
    scored.slice(0, 3).map(s => `${s.chunk.label} (${s.sim.toFixed(3)})`),
  );

  return entries;
}

// ─── Keyword fallback (v2 logic, kept for resilience) ────────────────────────

function keywordRetrieve(query: string, excludeLabels: string[] = []): KBEntry[] {
  const q = query.toLowerCase();
  return KNOWLEDGE_BASE
    .filter(e => !excludeLabels.includes(e.label))
    .map(entry => {
      const titleTerms = entry.title.toLowerCase().split(/\s+/);
      const titleScore = titleTerms.filter(t => q.includes(t) || t.includes(q.split(' ')[0])).length * 3;
      const kwScore    = entry.keywords.filter(kw => q.includes(kw)).length;
      return { entry, score: titleScore + kwScore };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)
    .map(e => e.entry);
}

// ─── Check whether pgvector table has been populated ─────────────────────────

let pgvectorAvailable: boolean | null = null;   // null = not yet checked

async function isPgvectorPopulated(): Promise<boolean> {
  if (pgvectorAvailable !== null) return pgvectorAvailable;
  try {
    const result = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count FROM "KbEmbedding"
    `;
    pgvectorAvailable = Number(result[0].count) > 0;
    if (pgvectorAvailable) {
      console.log(`[rag] pgvector table has ${result[0].count} rows — using DB retrieval`);
    } else {
      console.log('[rag] pgvector table is empty — using in-memory fallback');
    }
  } catch {
    pgvectorAvailable = false;
    console.warn('[rag] pgvector table not accessible — using in-memory fallback');
  }
  return pgvectorAvailable;
}

// ─── Public retriever — pgvector → in-memory → keyword ───────────────────────

async function retrieveContext(
  query: string,
  excludeLabels: string[] = [],
): Promise<KBEntry[]> {
  // [Level 2] Try pgvector first
  if (await isPgvectorPopulated()) {
    try {
      const results = await pgvectorRetrieve(query, excludeLabels);
      if (results.length > 0) return results;
      // Fell below threshold — return empty (no irrelevant injection)
      return [];
    } catch (err) {
      console.warn('[rag] pgvector retrieval failed, falling back to in-memory:', (err as Error).message);
    }
  }

  // [Level 1] Try in-memory vector store
  try {
    return await embeddingRetrieve(query, excludeLabels);
  } catch (err) {
    console.warn('[rag] In-memory retrieval failed, using keyword fallback:', (err as Error).message);
    return keywordRetrieve(query, excludeLabels);
  }
}

// ─── Merge + format helpers ───────────────────────────────────────────────────

function mergeEntries(a: KBEntry[], b: KBEntry[]): KBEntry[] {
  const seen = new Set(a.map(e => e.label));
  return [...a, ...b.filter(e => !seen.has(e.label))].slice(0, TOP_K + 2);
}

function formatContext(entries: KBEntry[]): string {
  if (entries.length === 0) {
    return '(No specific knowledge base entry matched this query — answer from your expert plant knowledge.)';
  }
  return entries.map(e => e.content).join('\n\n---\n\n');
}

// ─── Scan Context Types ───────────────────────────────────────────────────────

interface ScanContext {
  scanType?:        'disease' | 'spread';
  plantName?:       string;
  plantImageUrl?:   string;
  disease?:         string | null;
  confidence?:      number | null;
  recommendation?:  string | null;
  diseaseName?:     string | null;
  spreadPercentage?: number | null;
  severity?:        string | null;
  analysis?:        string | null;
}

interface PlantContext {
  name:      string;
  species?:  string | null;
  notes?:    string | null;
  imageUrls: string[];
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  ragContext: string,
  lang: 'en' | 'ar',
  scanContext?:  ScanContext,
  plantContext?: PlantContext,
): string {
  const langInstruction =
    lang === 'ar' ? 'يجب أن ترد باللغة العربية الفصحى فقط.' : 'Respond in clear English.';

  let prompt =
    `You are PlantGuard AI, a friendly and expert plant care assistant specialising in plant diseases, pests, and care.\n` +
    `${langInstruction}\n\n` +
    `INSTRUCTIONS:\n` +
    `1. Use the RELEVANT KNOWLEDGE section below as your PRIMARY source when it covers the topic.\n` +
    `2. If the topic is NOT covered or only partially covered in the knowledge base, answer FULLY from your own expert knowledge — NEVER tell the user you don't have information. You are a plant expert and can answer any plant-related question.\n` +
    `3. Always give practical, actionable advice. Be concise and encouraging.\n\n` +
    `RELEVANT KNOWLEDGE (use as primary source when applicable):\n${ragContext}`;

  if (plantContext) {
    prompt += `\n\n─── PLANT PROFILE ───\n`;
    prompt += `Plant name: ${plantContext.name}\n`;
    if (plantContext.species) prompt += `Species: ${plantContext.species}\n`;
    if (plantContext.notes)   prompt += `Owner notes: ${plantContext.notes}\n`;
    if (plantContext.imageUrls.length > 0)
      prompt += `Photos: ${plantContext.imageUrls.length} image(s) attached to this conversation.\n`;
    prompt +=
      `\nAlways refer to this plant by its name ("${plantContext.name}") in your responses. ` +
      `Use the plant's profile and any attached images to give specific, personalised advice.\n`;
  }

  if (scanContext) {
    prompt += `\n\n─── PLANT SCAN CONTEXT ───\n`;
    if (scanContext.plantName) prompt += `Plant: ${scanContext.plantName}\n`;
    if (scanContext.scanType === 'disease') {
      prompt += `Scan type: Disease Detection\n`;
      if (scanContext.disease) {
        prompt += `Disease detected: ${scanContext.disease}\n`;
        prompt += `Confidence: ${Math.round((scanContext.confidence ?? 0) * 100)}%\n`;
      } else {
        prompt += `Result: Plant appears healthy\n`;
      }
      if (scanContext.recommendation) prompt += `Recommendation: ${scanContext.recommendation}\n`;
    } else if (scanContext.scanType === 'spread') {
      prompt += `Scan type: Spread Analysis\n`;
      if (scanContext.diseaseName) {
        prompt += `Disease: ${scanContext.diseaseName}\n`;
        prompt += `Spread: ${scanContext.spreadPercentage ?? '?'}%\n`;
        prompt += `Severity: ${scanContext.severity ?? 'unknown'}\n`;
      }
      if (scanContext.analysis) prompt += `Analysis: ${scanContext.analysis}\n`;
    }
    if (scanContext.plantImageUrl)
      prompt += `\nThe plant image has been attached for your reference.`;
    prompt +=
      `\n\nThe user is asking about this specific plant and scan result. ` +
      `Use the scan context above to give targeted, specific advice.`;
  }

  return prompt;
}

// ─── Load scan context from DB ────────────────────────────────────────────────

async function loadScanContext(
  scanId: string,
  scanType: 'disease' | 'spread',
  plantId?: string | null,
): Promise<ScanContext> {
  const ctx: ScanContext = { scanType };

  if (plantId) {
    const plant = await prisma.plant.findUnique({
      where:  { plant_id: plantId },
      select: { name: true, imageUrl: true },
    });
    if (plant) {
      ctx.plantName     = plant.name;
      ctx.plantImageUrl = plant.imageUrl ?? undefined;
    }
  }

  if (scanType === 'disease') {
    const scan = await prisma.scanHistory.findUnique({
      where:  { scan_id: scanId },
      select: { disease: true, confidence: true, recommendation: true, imageUrl: true },
    });
    if (scan) {
      ctx.disease        = scan.disease;
      ctx.confidence     = scan.confidence;
      ctx.recommendation = scan.recommendation;
      if (!ctx.plantImageUrl) ctx.plantImageUrl = scan.imageUrl;
    }
  } else {
    const scan = await prisma.spreadScanHistory.findUnique({
      where:  { spread_scan_id: scanId },
      select: { diseaseName: true, spreadPercentage: true, severity: true, analysis: true, imageUrls: true },
    });
    if (scan) {
      ctx.diseaseName      = scan.diseaseName;
      ctx.spreadPercentage = scan.spreadPercentage;
      ctx.severity         = scan.severity;
      ctx.analysis         = scan.analysis;
      if (!ctx.plantImageUrl && scan.imageUrls.length > 0)
        ctx.plantImageUrl = scan.imageUrls[0];
    }
  }

  return ctx;
}

// ─── Load plant context from DB ───────────────────────────────────────────────

async function loadPlantContext(plantId: string): Promise<PlantContext | null> {
  const plant = await prisma.plant.findUnique({
    where:  { plant_id: plantId },
    select: { name: true, scientificName: true, notes: true, imageUrl: true },
  });
  if (!plant) return null;
  return {
    name:      plant.name,
    species:   plant.scientificName ?? null,
    notes:     plant.notes ?? null,
    imageUrls: plant.imageUrl ? [plant.imageUrl] : [],
  };
}

// ─── Gemini API caller ────────────────────────────────────────────────────────

async function callGemini(
  messages:         { role: string; content: string; imageUrl?: string | null }[],
  systemPrompt:     string,
  modelName:        string,
  contextImageUrls: string[] = [],
): Promise<string> {
  const contents = await Promise.all(
    messages.map(async (m, i) => {
      const isLastUser = i === messages.length - 1 && m.role === 'user';
      const parts: any[] = [{ text: m.content }];

      if (m.imageUrl) {
        const imgResp = await axios.get(m.imageUrl, { responseType: 'arraybuffer' });
        const base64  = Buffer.from(imgResp.data as ArrayBuffer).toString('base64');
        const mime    = (imgResp.headers['content-type'] as string) || 'image/jpeg';
        parts.push({ inlineData: { mimeType: mime, data: base64 } });
      }

      if (isLastUser && !m.imageUrl && contextImageUrls.length > 0) {
        for (const url of contextImageUrls) {
          try {
            const imgResp = await axios.get(url, { responseType: 'arraybuffer' });
            const base64  = Buffer.from(imgResp.data as ArrayBuffer).toString('base64');
            const mime    = (imgResp.headers['content-type'] as string) || 'image/jpeg';
            parts.push({ inlineData: { mimeType: mime, data: base64 } });
          } catch { /* non-fatal */ }
        }
      }

      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    })
  );

  const res = await withRetry(() =>
    axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 2048 },
      },
    )
  , 3, 3000);

  return res.data.candidates[0].content.parts[0].text as string;
}

// ─── OpenRouter API caller ────────────────────────────────────────────────────

async function callOpenRouter(
  messages:         { role: string; content: string; imageUrl?: string | null }[],
  systemPrompt:     string,
  modelId:          string,
  contextImageUrls: string[] = [],
): Promise<string> {
  const formatted = messages.map((m, i) => {
    const isLastUser = i === messages.length - 1 && m.role === 'user';

    if (m.imageUrl) {
      return {
        role: m.role,
        content: [
          { type: 'text',      text: m.content },
          { type: 'image_url', image_url: { url: m.imageUrl } },
        ],
      };
    }

    if (isLastUser && contextImageUrls.length > 0) {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content },
          ...contextImageUrls.map(url => ({ type: 'image_url', image_url: { url } })),
        ],
      };
    }

    return { role: m.role, content: m.content };
  });

  const res = await withRetry(() =>
    axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model:      modelId,
        messages:   [{ role: 'system', content: systemPrompt }, ...formatted],
        max_tokens: 2048,
      },
      { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } },
    )
  , 3, 2000);

  return res.data.choices[0].message.content as string;
}

// ─── sendMessage ──────────────────────────────────────────────────────────────

export async function sendMessage(params: {
  userId:          string;
  message:         string;
  sessionId?:      string;
  requestedModel?: string;
  imageUrl?:       string;
}): Promise<{
  reply:     string;
  sessionId: string;
  messageId: string;
  model:     Model;
  switched:  boolean;
}> {
  const { userId, message, sessionId, requestedModel, imageUrl } = params;

  if (!message?.trim()) throw new ValidationError('Message cannot be empty');

  // ── Resolve or create session ─────────────────────────────────────────────
  let session = sessionId
    ? await prisma.chatSession.findUnique({ where: { chat_session_id: sessionId } })
    : null;

  if (sessionId && !session) throw new NotFoundError('Chat session');
  if (session && session.userId !== userId) throw new ForbiddenError();

  if (!session) {
    const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
    session = await prisma.chatSession.create({ data: { userId, title } });
  }

  // ── Resolve model ─────────────────────────────────────────────────────────
  const effectiveModelId = requestedModel ?? session.model ?? 'gemini_flash';
  const selectedModel    = resolveModel(effectiveModelId);

  // ── Load conversation history ─────────────────────────────────────────────
  const history = await prisma.chatMessage.findMany({
    where:   { sessionId: session.chat_session_id },
    orderBy: { createdAt: 'asc' },
    take:    20,
    select:  { role: true, content: true, imageUrl: true },
  });

  const messagesForAI = [
    ...history.map(m => ({ role: m.role, content: m.content, imageUrl: m.imageUrl })),
    { role: 'user', content: message, imageUrl: imageUrl ?? null },
  ];

  // ── Load plant context ────────────────────────────────────────────────────
  let plantContext: PlantContext | undefined;
  const contextImageUrls: string[] = [];

  if (session.plantId) {
    try {
      const loaded = await loadPlantContext(session.plantId);
      if (loaded) {
        plantContext = loaded;
        contextImageUrls.push(...loaded.imageUrls);
      }
    } catch { /* Non-fatal */ }
  }

  // ── Load scan context ─────────────────────────────────────────────────────
  let scanContext: ScanContext | undefined;

  if (session.scanId && session.scanType) {
    try {
      scanContext = await loadScanContext(
        session.scanId,
        session.scanType as 'disease' | 'spread',
        session.plantId,
      );
      if (scanContext.plantImageUrl) contextImageUrls.unshift(scanContext.plantImageUrl);
    } catch { /* Non-fatal */ }
  }

  // ── RAG v4: pgvector → in-memory → keyword, both queries in parallel ──────
  //
  // When a scan is attached we run a second query keyed on the disease label
  // so that disease-specific chunks are always included even if the user's
  // message is very short.
  const diseaseQuery = scanContext?.disease ?? scanContext?.diseaseName ?? null;

  const [queryEntries, scanEntries] = await Promise.all([
    retrieveContext(message),
    diseaseQuery ? retrieveContext(diseaseQuery) : Promise.resolve([] as KBEntry[]),
  ]);

  const allEntries = mergeEntries(queryEntries, scanEntries);
  const ragContext  = formatContext(allEntries);

  // ── Language detection ────────────────────────────────────────────────────
  const lang = /[\u0600-\u06FF]/.test(message) ? 'ar' : 'en';

  // ── Build system prompt ───────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(ragContext, lang, scanContext, plantContext);

  // ── Call AI — try every model in order until one succeeds ────────────────
  const modelIndex = MODELS.findIndex(m => m.id === selectedModel.id);
  // Build priority list: selected model first, then the rest in array order
  const tryOrder = [
    MODELS[modelIndex],
    ...MODELS.filter((_, i) => i !== modelIndex),
  ];

  let reply     = '';
  let switched  = false;
  let usedModel: Model = selectedModel;

  const tryModel = async (model: Model): Promise<string> => {
    if (model.provider === 'Google') {
      return callGemini(messagesForAI, systemPrompt, (model as any).modelName, contextImageUrls);
    }
    return callOpenRouter(messagesForAI, systemPrompt, (model as any).modelId, contextImageUrls);
  };

  let lastErr: unknown;
  for (const model of tryOrder) {
    try {
      reply     = await tryModel(model);
      usedModel = model;
      switched  = model.id !== selectedModel.id;
      if (switched) console.warn(`[chat] Switched to ${model.name}`);
      break;
    } catch (err) {
      lastErr = err;
      const status = (err as any)?.response?.status ?? (err as any)?.status ?? 0;
      console.warn(`[chat] ${model.name} failed (HTTP ${status || 'unknown'}) — trying next model…`);
    }
  }

  if (!reply) {
    console.error('[chat] All models exhausted. Last error:', lastErr);
    throw new Error('All AI models are currently unavailable. Please try again in a few minutes.');
  }

  // ── Persist messages ──────────────────────────────────────────────────────
  await prisma.chatMessage.create({
    data: {
      sessionId: session.chat_session_id,
      role:      'user',
      content:   message,
      imageUrl:  imageUrl ?? undefined,
    },
  });

  const assistantMsg = await prisma.chatMessage.create({
    data: {
      sessionId: session.chat_session_id,
      role:      'assistant',
      content:   reply,
    },
  });

  await prisma.chatSession.update({
    where: { chat_session_id: session.chat_session_id },
    data:  { updatedAt: new Date(), model: usedModel.id },
  });

  return {
    reply,
    sessionId: session.chat_session_id,
    messageId: assistantMsg.chat_message_id,
    model:     usedModel,
    switched,
  };
}

// ─── Session management (unchanged) ──────────────────────────────────────────

export async function createSession(params: {
  userId:    string;
  title?:    string;
  model?:    string;
  plantId?:  string;
  scanId?:   string;
  scanType?: 'disease' | 'spread';
}) {
  return prisma.chatSession.create({
    data: {
      userId:   params.userId,
      title:    params.title ?? 'New Chat',
      model:    params.model ?? 'gemini_flash',
      plantId:  params.plantId ?? undefined,
      scanId:   params.scanId ?? undefined,
      scanType: params.scanType ?? undefined,
    },
  });
}

export async function getUserSessions(userId: string) {
  const sessions = await prisma.chatSession.findMany({
    where:   { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      chat_session_id: true,
      title:           true,
      model:           true,
      plantId:         true,
      scanId:          true,
      scanType:        true,
      createdAt:       true,
      updatedAt:       true,
    },
  });
  return sessions.map(s => ({ ...s, currentModel: resolveModel(s.model) }));
}

export async function getSessionMessages(sessionId: string, userId: string) {
  const session = await prisma.chatSession.findUnique({
    where:  { chat_session_id: sessionId },
    select: { userId: true, model: true, plantId: true, scanId: true, scanType: true },
  });

  if (!session) throw new NotFoundError('Chat session');
  if (session.userId !== userId) throw new ForbiddenError();

  const messages = await prisma.chatMessage.findMany({
    where:   { sessionId },
    orderBy: { createdAt: 'asc' },
    select: {
      chat_message_id: true,
      role:            true,
      content:         true,
      imageUrl:        true,
      createdAt:       true,
    },
  });

  return {
    messages,
    currentModel: resolveModel(session.model),
    plantId:      session.plantId,
    scanId:       session.scanId,
    scanType:     session.scanType,
  };
}

export async function deleteSession(sessionId: string, userId: string): Promise<void> {
  const session = await prisma.chatSession.findUnique({ where: { chat_session_id: sessionId } });
  if (!session) throw new NotFoundError('Chat session');
  if (session.userId !== userId) throw new ForbiddenError();
  await prisma.chatSession.delete({ where: { chat_session_id: sessionId } });
}