-- Add enabled flag to tenant_notification_configs
-- Default FALSE: notifications are opt-in per tenant.
ALTER TABLE "tenant_notification_configs"
  ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT FALSE;
