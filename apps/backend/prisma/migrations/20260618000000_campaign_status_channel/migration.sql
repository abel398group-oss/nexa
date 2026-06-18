-- Migration: canal Status WhatsApp (ADR-026)
-- Aditiva: campos novos com DEFAULT — nenhuma linha existente é afetada.

ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "type"             TEXT        NOT NULL DEFAULT 'message',
  ADD COLUMN IF NOT EXISTS "status_post_id"   TEXT,
  ADD COLUMN IF NOT EXISTS "status_posted_at" TIMESTAMPTZ;
