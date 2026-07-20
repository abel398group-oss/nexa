-- ADR 034 (2026-07-20): per-seller "out of office" toggle.
-- Additive only. true → handoff also notifies the seller on WhatsApp (with a
-- deep link into the inbox); false → portal bell only. Default true preserves
-- the pre-ADR behavior (every seller got the WhatsApp notification).
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "out_of_office" BOOLEAN NOT NULL DEFAULT true;
