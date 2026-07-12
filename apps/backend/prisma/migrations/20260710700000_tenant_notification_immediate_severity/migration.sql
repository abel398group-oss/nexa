-- Migration: add immediate_severity to tenant_notification_configs (G4)
-- Additive: existing rows get the default 'CRITICAL' (conservative — no behavior change until tenant opts in).

ALTER TABLE "tenant_notification_configs"
  ADD COLUMN IF NOT EXISTS "immediate_severity" TEXT NOT NULL DEFAULT 'CRITICAL';
