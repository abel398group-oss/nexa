-- F12 (2026-08-06): atribuição de chamado de suporte a um analista humano +
-- nota interna. Ver docs/reviews/2026-08-06-auditoria-operacao-time-suporte.md.
--
-- Aditivo: 3 colunas novas (todas nullable ou com default) + 1 FK + 1 índice.
-- IF NOT EXISTS mantém re-executável.

ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "assigned_analyst_id" TEXT;
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "assigned_analyst_at" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_assigned_analyst_id_fkey"
    FOREIGN KEY ("assigned_analyst_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ai_conversations_assigned_analyst_id_idx" ON "ai_conversations" ("assigned_analyst_id");

-- Nota interna: NUNCA despachada ao cliente (WAHA/widget/portal). Default false
-- preserva todo o histórico de mensagens existente sem nenhuma reclassificação.
ALTER TABLE "ai_messages" ADD COLUMN IF NOT EXISTS "is_internal" BOOLEAN NOT NULL DEFAULT false;
