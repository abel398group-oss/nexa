-- Add monitor_override flag to tenant_notification_configs.
-- Allows a platform admin to unlock the Monitor Proativo feature
-- for a specific tenant regardless of their plan.
ALTER TABLE "tenant_notification_configs"
  ADD COLUMN IF NOT EXISTS "monitor_override" BOOLEAN NOT NULL DEFAULT false;
