-- Add recipients JSON column to store a list of notification recipients
-- Each recipient: { label: string, contact: string, channel: 'whatsapp' | 'email' }
-- Defaults to empty array; legacy notificationPhone field preserved for backwards compat.
ALTER TABLE "tenant_notification_configs" ADD COLUMN "recipients" JSONB NOT NULL DEFAULT '[]'::jsonb;
