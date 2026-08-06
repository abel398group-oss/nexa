-- F9 (sync de ticket com o TMS, 2026-08-05): estado de entrega do resumo do
-- ticket pro HiperTMS. Ver docs/features/tms-native-support/especificacao-sync-ticket-tms.md
-- e o endpoint receptor implementado no repo do TMS.
--
-- Sem tabela de delivery separada de propósito: cada ticket tem UM destino (o
-- TMS), então o estado cabe direto na própria conversa — reaproveitar
-- webhook_deliveries exigiria uma WebhookSubscription "falsa" só pra satisfazer
-- a FK, misturando integração de tenant (webhooks configuráveis) com esta
-- (integração fixa Nexa↔TMS).
--
-- Aditivo: 4 colunas novas nullable/default. IF NOT EXISTS mantém re-executável.

ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "ticket_sync_status" TEXT;
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "ticket_sync_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "ticket_sync_next_retry_at" TIMESTAMP(3);
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "ticket_sync_error" TEXT;

-- Varredura do retry: pending + hora do próximo retry já passou.
CREATE INDEX IF NOT EXISTS "ai_conversations_ticket_sync_status_next_retry_idx"
  ON "ai_conversations" ("ticket_sync_status", "ticket_sync_next_retry_at");
