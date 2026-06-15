-- AddColumn: support module fields on ai_conversations (ADR 015)
ALTER TABLE "ai_conversations"
  ADD COLUMN IF NOT EXISTS "resolved_at"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "auto_close_at"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ticket_category"  TEXT,
  ADD COLUMN IF NOT EXISTS "ticket_priority"  TEXT,
  ADD COLUMN IF NOT EXISTS "root_cause"       TEXT;
