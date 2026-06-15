-- Migration: conversation_status_v2
-- Adiciona novos status ao enum ConversationStatus e campo last_activity_at.
-- Módulo comercial: OPEN → WAITING_CUSTOMER/WAITING_INTERNAL → CLOSED/OPT_OUT/WON/LOST
-- (suporte usará RESOLVED → CLOSED com janela de 48h — implementar no módulo de suporte)

-- 1. Novos valores do enum (ADD VALUE IF NOT EXISTS — idempotente)
ALTER TYPE "ConversationStatus" ADD VALUE IF NOT EXISTS 'waiting_customer';
ALTER TYPE "ConversationStatus" ADD VALUE IF NOT EXISTS 'waiting_internal';
ALTER TYPE "ConversationStatus" ADD VALUE IF NOT EXISTS 'opt_out';

-- 2. Campo last_activity_at — rastreia inatividade para auto-fechamento em 7 dias
ALTER TABLE "ai_conversations"
  ADD COLUMN IF NOT EXISTS "last_activity_at" TIMESTAMP(3);

-- 3. Backfill: usa started_at para conversas existentes
UPDATE "ai_conversations"
  SET "last_activity_at" = "started_at"
  WHERE "last_activity_at" IS NULL;

-- 4. Índice para o janitor query (busca conversas inativas por status + data)
CREATE INDEX IF NOT EXISTS "ai_conversations_last_activity_status_idx"
  ON "ai_conversations" ("status", "last_activity_at");

-- 5. Tabela de histórico de mudanças de status/outcome (Ajuste 4)
CREATE TABLE IF NOT EXISTS "conversation_stage_history" (
  "id"              TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "from_status"     TEXT,
  "to_status"       TEXT NOT NULL,
  "from_outcome"    TEXT,
  "to_outcome"      TEXT,
  "reason"          TEXT,
  "changed_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversation_stage_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_stage_history_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "conversation_stage_history_conversation_id_idx"
  ON "conversation_stage_history" ("conversation_id");

CREATE INDEX IF NOT EXISTS "conversation_stage_history_changed_at_idx"
  ON "conversation_stage_history" ("changed_at");
