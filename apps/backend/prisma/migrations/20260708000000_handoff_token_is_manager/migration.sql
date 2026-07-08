-- AddColumn: is_manager on handoff_tokens
-- Additive migration — default false, sem breaking change.
ALTER TABLE "handoff_tokens" ADD COLUMN "is_manager" BOOLEAN NOT NULL DEFAULT false;
