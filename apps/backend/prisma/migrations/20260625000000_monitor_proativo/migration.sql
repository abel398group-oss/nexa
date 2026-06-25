-- Migration: Monitor Proativo (ADR 028)
-- Tabelas: tenant_notification_configs, alert_states, notification_logs
-- Aditiva: usa IF NOT EXISTS em todas as operações — seguro em qualquer estado do banco.

-- ===== TenantNotificationConfig =====
CREATE TABLE IF NOT EXISTS "tenant_notification_configs" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "tenant_id"        TEXT NOT NULL UNIQUE,
  "send_hour"        INTEGER NOT NULL DEFAULT 7,
  "send_weekends"    BOOLEAN NOT NULL DEFAULT false,
  "channel"          TEXT NOT NULL DEFAULT 'whatsapp',
  "fiscal_enabled"   BOOLEAN NOT NULL DEFAULT true,
  "logistic_enabled" BOOLEAN NOT NULL DEFAULT true,
  "frota_enabled"    BOOLEAN NOT NULL DEFAULT true,
  "finance_enabled"  BOOLEAN NOT NULL DEFAULT true,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ===== AlertState =====
CREATE TABLE IF NOT EXISTS "alert_states" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "tenant_id"     TEXT NOT NULL,
  "tms_event_id"  TEXT NOT NULL,
  "severity"      TEXT NOT NULL,
  "category"      TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT,
  "status"        TEXT NOT NULL DEFAULT 'open',
  "snoozed_until" TIMESTAMP(3),
  "notified_at"   TIMESTAMP(3),
  "notify_count"  INTEGER NOT NULL DEFAULT 0,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "alert_states_tenant_id_tms_event_id_key"
  ON "alert_states"("tenant_id", "tms_event_id");

CREATE INDEX IF NOT EXISTS "alert_states_tenant_id_status_idx"
  ON "alert_states"("tenant_id", "status");

-- ===== NotificationLog =====
CREATE TABLE IF NOT EXISTS "notification_logs" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "tenant_id"  TEXT NOT NULL,
  "channel"    TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "sent_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "success"    BOOLEAN NOT NULL,
  "error"      TEXT
);

CREATE INDEX IF NOT EXISTS "notification_logs_tenant_id_idx"
  ON "notification_logs"("tenant_id");
