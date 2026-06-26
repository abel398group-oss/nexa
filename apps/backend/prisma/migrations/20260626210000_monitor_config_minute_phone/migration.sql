-- Add send_minute and notification_phone to tenant_notification_configs
ALTER TABLE "tenant_notification_configs"
  ADD COLUMN IF NOT EXISTS "send_minute"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "notification_phone" TEXT;
