-- ADR 021 — Campanha por e-mail: channel + subject + email em targets
-- Migration: 20260610030000_campaign_email_channel

ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "channel"  TEXT NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS "subject"  TEXT;

ALTER TABLE "campaign_targets"
  ADD COLUMN IF NOT EXISTS "email"   TEXT,
  ALTER COLUMN "phone" SET DEFAULT '';
