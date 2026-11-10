// scripts/ingest-kb.ts
// ─────────────────────────────────────────────────────────────────────────────
// One-time ingestion script — run once, then only when the KB changes.
//
// Usage:
//   npx ts-node scripts/ingest-kb.ts
//
// What it does:
//   1. Reads the entire KNOWLEDGE_BASE from chat.service (shared import).
//   2. Splits each entry into up to 3 focused chunks:
//        symptoms | treatment | prevention  (+ "full" fallback if parsing fails)
//   3. Embeds every chunk via gemini-embedding-001.
//   4. Upserts rows into the KbEmbedding table (clears old rows for that label
//      first, so re-running is idempotent).
//
// Prerequisites:
//   • pgvector extension installed and migration applied
//     (run prisma/migrations/add_pgvector/migration.sql first)
//   • DATABASE_URL and GEMINI_API_KEY set in .env
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import axios from 'axios';
import prisma from '../src/config/connectionDb';

// ── Re-export the KB from the service so we have a single source of truth ─────
// We import only the types + data we need; the rest of the service is not loaded.
import { KNOWLEDGE_BASE, KBEntry } from '../src/modules/chat/kb';

// ─── Config ───────────────────────────────────────────────────────────────────

const EMBEDDING_MODEL    = 'gemini-embedding-001';
const EMBEDDING_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const BATCH_SIZE         = 5;       // free-tier safe
const DELAY_MS           = 12_000;  // 12 s between batches → ~5 req/min
const SIMILARITY_VERSION = 'v1';    // bump to force full re-ingestion

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, attempts = 5, delayMs = 2000): Promise<T> {
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (err: any) {
      const status = err?.response?.status ?? 0;
      if ((status === 429 || status >= 500) && i < attempts) {
        const wait = delayMs * Math.pow(2, i - 1);
        console.warn(`  [retry] HTTP ${status} — waiting ${wait}ms…`);
        await sleep(wait);
      } else throw err;
    }
  }
  throw new Error('withRetry exhausted');
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const url = `${EMBEDDING_API_BASE}/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${process.env.GEMINI_API_KEY}`;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(texts.length / BATCH_SIZE);
    console.log(`  [embed] Batch ${batchNum}/${totalBatches} (${slice.length} texts)…`);

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
      console.log(`  [embed] Sleeping ${DELAY_MS / 1000}s (rate limit)…`);
      await sleep(DELAY_MS);
    }
  }

  return results;
}

// ─── Chunk splitter ───────────────────────────────────────────────────────────
//
// Each KB entry content follows a predictable format with section headers like:
//   SYMPTOMS: ...
//   TREATMENT: ...  (or TREATMENT:\n  •)
//   PREVENTION: ...
//   SEVERITY / URGENCY  (appended to the most relevant chunk)
//
// We extract these sections and emit individual chunks.  Entries that don't
// follow the format (e.g. healthy-plant entries) are kept as a single "full" chunk.

interface Chunk {
  chunkType: 'symptoms' | 'treatment' | 'prevention' | 'full';
  text:      string;
}

function splitIntoChunks(entry: KBEntry): Chunk[] {
  const content = entry.content;
  const header  = `${entry.title} (${entry.label})`;

  // Extract named sections using a regex that captures everything until the
  // next all-caps header or end of string.
  const sectionRe = /^(SYMPTOMS|TREATMENT|PREVENTION|SEVERITY|URGENCY):\s*/gm;
  const sections: Array<{ name: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(content)) !== null) {
    sections.push({ name: m[1], start: m.index + m[0].length });
  }

  if (sections.length < 2) {
    // Healthy entries or non-standard format — keep as one chunk
    return [{ chunkType: 'full', text: `${header}\n${content}` }];
  }

  // Collect text for each section name
  const byName: Record<string, string> = {};
  for (let i = 0; i < sections.length; i++) {
    const { name, start } = sections[i];
    const end = i + 1 < sections.length ? sections[i + 1].start - sections[i + 1].name.length - 2 : content.length;
    const text = content.slice(start, end).trim();
    byName[name] = (byName[name] ?? '') + (byName[name] ? '\n' + text : text);
  }

  const chunks: Chunk[] = [];

  // symptoms chunk — include SEVERITY for context
  if (byName['SYMPTOMS']) {
    let text = `${header}\nSYMPTOMS: ${byName['SYMPTOMS']}`;
    if (byName['SEVERITY']) text += `\nSEVERITY: ${byName['SEVERITY']}`;
    chunks.push({ chunkType: 'symptoms', text });
  }

  // treatment chunk — include URGENCY
  if (byName['TREATMENT']) {
    let text = `${header}\nTREATMENT: ${byName['TREATMENT']}`;
    if (byName['URGENCY']) text += `\nURGENCY: ${byName['URGENCY']}`;
    chunks.push({ chunkType: 'treatment', text });
  }

  // prevention chunk
  if (byName['PREVENTION']) {
    const text = `${header}\nPREVENTION: ${byName['PREVENTION']}`;
    chunks.push({ chunkType: 'prevention', text });
  }

  // If for some reason no named sections parsed, fall back to full
  return chunks.length > 0 ? chunks : [{ chunkType: 'full', text: `${header}\n${content}` }];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  PlantGuard — KB Ingestion Script                    ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`KB entries: ${KNOWLEDGE_BASE.length}`);

  // Build all chunks up front so we can batch-embed in one pass
  const allChunks: Array<{ entry: KBEntry; chunk: Chunk }> = [];
  for (const entry of KNOWLEDGE_BASE) {
    const chunks = splitIntoChunks(entry);
    for (const chunk of chunks) {
      allChunks.push({ entry, chunk });
    }
  }

  console.log(`Total chunks to embed: ${allChunks.length}`);

  // Embed all chunk texts
  console.log('\n── Embedding chunks ──────────────────────────────────────');
  const vectors = await embedBatch(allChunks.map(c => c.chunk.text));
  console.log(`✅ Embedded ${vectors.length} chunks`);

  // Upsert into database
  console.log('\n── Writing to database ───────────────────────────────────');

  // Delete all existing rows first (full re-ingest is idempotent and safe
  // because the ingestion script is the only writer).
  const deleted = await prisma.kbEmbedding.deleteMany({});
  console.log(`  Cleared ${deleted.count} existing rows`);

  // Insert in batches of 20 using raw SQL so we can pass the vector literal
  const INSERT_BATCH = 20;
  let inserted = 0;

  for (let i = 0; i < allChunks.length; i += INSERT_BATCH) {
    const slice = allChunks.slice(i, i + INSERT_BATCH);

    for (let j = 0; j < slice.length; j++) {
      const { entry, chunk } = slice[j];
      const vec = vectors[i + j];
      const vecStr = `[${vec.join(',')}]`;

      await prisma.$executeRaw`
        INSERT INTO "KbEmbedding" (label, "chunkType", "chunkText", embedding)
        VALUES (
          ${entry.label},
          ${chunk.chunkType},
          ${chunk.text},
          ${vecStr}::vector
        )
      `;
      inserted++;
    }

    process.stdout.write(`\r  Inserted ${inserted}/${allChunks.length}`);
  }

  console.log(`\n✅ Ingestion complete — ${inserted} rows written`);
  console.log(`\nVersion: ${SIMILARITY_VERSION}  — store this in KB_VERSION in chat.service.ts`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
