-- Adiciona a coluna de arquivamento das campanhas (não-destrutivo).
-- Idempotente: pode rodar mais de uma vez sem erro.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

-- Índice para filtrar arquivadas/ativas rapidamente.
CREATE INDEX IF NOT EXISTS "campaigns_archived_at_idx" ON "campaigns" ("archived_at");
