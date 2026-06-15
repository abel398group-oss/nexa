-- Busca semântica da KB (RAG, ADR 006 D3): extensão pgvector + coluna de embedding.
-- Dimensão 384 = modelo multilingual-e5-small (Xenova/transformers, local).
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "ai_knowledge_base" ADD COLUMN IF NOT EXISTS "embedding" vector(384);

-- Índice: dispensável enquanto a KB é pequena (scan sequencial é instantâneo).
-- Quando passar de ~1.000 artigos, criar um índice HNSW para acelerar:
--   CREATE INDEX ai_kb_embedding_hnsw ON "ai_knowledge_base"
--     USING hnsw ("embedding" vector_cosine_ops);
