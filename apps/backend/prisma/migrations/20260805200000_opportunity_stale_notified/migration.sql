-- F7 (RevOps, 2026-08-05): carimbo do último aviso de "lead parado".
-- Sem ele o aviso diário repetiria o mesmo lead todo dia até alguém mexer,
-- e o vendedor aprenderia a ignorar o sino. Aditivo, coluna nova nullable.

ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "stale_notified_at" TIMESTAMP(3);

-- O job varre por estágio + data da última mexida; o índice existente
-- (tenant_id, stage) já cobre o recorte, este complementa a ordenação por
-- updated_at dentro do tenant.
CREATE INDEX IF NOT EXISTS "opportunities_tenant_id_updated_at_idx"
  ON "opportunities" ("tenant_id", "updated_at");
