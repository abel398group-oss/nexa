-- ADR 035 (2026-07-20): per-conversation human takeover.
-- Additive only. When set, Lia stops auto-sending in this conversation and
-- keeps generating internal draft suggestions. Cleared on conversation close
-- or explicit "return to Lia".
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "human_takeover_at" TIMESTAMP(3);
