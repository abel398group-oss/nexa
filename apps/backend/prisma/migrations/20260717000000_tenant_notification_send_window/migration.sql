-- Migration: add send window fields to tenant_notification_configs (T9)
-- Additive: existing rows get the conservative defaults (06:00-20:00, hold outside window)
-- — no behavior change until a tenant explicitly reconfigures the window.

ALTER TABLE "tenant_notification_configs"
  ADD COLUMN IF NOT EXISTS "send_window_start" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS "send_window_end" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "critical_outside_window" TEXT NOT NULL DEFAULT 'hold';
