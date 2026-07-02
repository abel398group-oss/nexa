-- Add sector_config JSONB column to tenant_notification_configs
-- Stores per-sector alert configuration: phone number and send time per sector.
-- { fiscal: { phone, sendHour, sendMinute }, logistic: {...}, frota: {...}, finance: {...} }
ALTER TABLE "tenant_notification_configs" ADD COLUMN "sector_config" JSONB;
