-- prisma/migrations/add_pgvector/migration.sql
-- Run this BEFORE applying the Prisma schema that adds KbEmbedding.
--
-- Step 1 — enable the pgvector extension (requires superuser or pg_extension privilege)
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2 — create the kb_embeddings table with a proper vector column
--   Prisma manages the rest of the columns via its own migration;
--   we only need to add the embedding column here because Prisma cannot
--   model the `vector` type natively.
CREATE TABLE IF NOT EXISTS "KbEmbedding" (
  "id"        SERIAL PRIMARY KEY,
  "label"     TEXT          NOT NULL,
  "chunkType" TEXT          NOT NULL,
  "chunkText" TEXT          NOT NULL,
  "embedding" vector(768)   NOT NULL,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Step 3 — IVFFlat index for fast approximate cosine search
--   lists = 20 is appropriate for up to ~200 rows (53 KB entries × 3 chunks ≈ 159 rows).
--   Increase lists as the KB grows (rule of thumb: sqrt(n_rows)).
CREATE INDEX IF NOT EXISTS kb_embeddings_embedding_idx
  ON "KbEmbedding"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 20);

-- Step 4 — index on label for metadata-filtered queries
CREATE INDEX IF NOT EXISTS kb_embeddings_label_idx
  ON "KbEmbedding" ("label");
