-- Agendamento de campanha + configuração de janela de envio por tenant.
-- Idempotente: pode rodar mais de uma vez sem erro.

-- 1) Agendamento de início por campanha
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMP(3);

-- 2) Janela de envio por tenant (por canal)
CREATE TABLE IF NOT EXISTS "sender_settings" (
  "id"               TEXT NOT NULL,
  "tenant_id"        TEXT NOT NULL,
  "wa_start_hour"    INTEGER NOT NULL DEFAULT 7,
  "wa_end_hour"      INTEGER NOT NULL DEFAULT 19,
  "email_start_hour" INTEGER NOT NULL DEFAULT 8,
  "email_end_hour"   INTEGER NOT NULL DEFAULT 18,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sender_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sender_settings_tenant_id_key" ON "sender_settings" ("tenant_id");
