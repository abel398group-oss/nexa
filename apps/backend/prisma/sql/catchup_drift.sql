-- Catch-up idempotente do drift (migrations 2026-06-09/10 que faltam neste banco).
-- Tudo IF NOT EXISTS: seguro rodar mesmo onde parte ja foi aplicada. Nao apaga dados.

-- ===== ai_conversations: last_activity_at + campos do modulo de suporte =====
ALTER TABLE "ai_conversations"
  ADD COLUMN IF NOT EXISTS "last_activity_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolved_at"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "auto_close_at"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ticket_category"  TEXT,
  ADD COLUMN IF NOT EXISTS "ticket_priority"  TEXT,
  ADD COLUMN IF NOT EXISTS "root_cause"       TEXT;

UPDATE "ai_conversations" SET "last_activity_at" = "started_at" WHERE "last_activity_at" IS NULL;

CREATE INDEX IF NOT EXISTS "ai_conversations_last_activity_status_idx"
  ON "ai_conversations" ("status", "last_activity_at");

CREATE TABLE IF NOT EXISTS "conversation_stage_history" (
  "id"              TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "from_status"     TEXT,
  "to_status"       TEXT NOT NULL,
  "from_outcome"    TEXT,
  "to_outcome"      TEXT,
  "reason"          TEXT,
  "changed_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_stage_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_stage_history_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "conversation_stage_history_conversation_id_idx" ON "conversation_stage_history" ("conversation_id");
CREATE INDEX IF NOT EXISTS "conversation_stage_history_changed_at_idx" ON "conversation_stage_history" ("changed_at");

-- ===== contacts: name_source (+ indice unico, no-op se ja existe) =====
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "name_source" TEXT DEFAULT 'pushname';
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_tenant_id_email_key"
  ON "contacts"("tenant_id", "email") WHERE "email" IS NOT NULL;

-- ===== handoff_tokens =====
CREATE TABLE IF NOT EXISTS "handoff_tokens" (
  "id"          TEXT NOT NULL,
  "token"       TEXT NOT NULL,
  "tenant_id"   TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "page"        TEXT,
  "error_code"  TEXT,
  "used_at"     TIMESTAMP(3),
  "expires_at"  TIMESTAMP(3) NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "handoff_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "handoff_tokens_token_key" ON "handoff_tokens"("token");
CREATE INDEX IF NOT EXISTS "handoff_tokens_token_idx" ON "handoff_tokens"("token");
CREATE INDEX IF NOT EXISTS "handoff_tokens_tenant_id_idx" ON "handoff_tokens"("tenant_id");

-- ===== email_channels (SMTP/IMAP) + email_optout_tokens =====
CREATE TABLE IF NOT EXISTS "email_channels" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"    TEXT NOT NULL,
  "provider"     TEXT NOT NULL DEFAULT 'smtp',
  "from_email"   TEXT NOT NULL,
  "from_name"    TEXT NOT NULL DEFAULT 'Lia HiperTMS',
  "reply_to"     TEXT,
  "smtp_host"    TEXT NOT NULL DEFAULT 'mail.hipertms.com.br',
  "smtp_port"    INTEGER NOT NULL DEFAULT 465,
  "smtp_user"    TEXT NOT NULL,
  "smtp_pass"    TEXT NOT NULL,
  "smtp_secure"  BOOLEAN NOT NULL DEFAULT TRUE,
  "imap_host"    TEXT NOT NULL DEFAULT 'mail.hipertms.com.br',
  "imap_port"    INTEGER NOT NULL DEFAULT 993,
  "imap_user"    TEXT NOT NULL,
  "imap_pass"    TEXT NOT NULL,
  "imap_mailbox" TEXT NOT NULL DEFAULT 'INBOX',
  "is_active"    BOOLEAN NOT NULL DEFAULT TRUE,
  "last_poll_at" TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_channels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "email_channels_tenant_id_key" ON "email_channels"("tenant_id");

CREATE TABLE IF NOT EXISTS "email_optout_tokens" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "token"       TEXT NOT NULL,
  "tenant_id"   TEXT NOT NULL,
  "contact_id"  TEXT NOT NULL,
  "email"       TEXT NOT NULL,
  "used_at"     TIMESTAMP(3),
  "expires_at"  TIMESTAMP(3) NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_optout_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "email_optout_tokens_token_key" ON "email_optout_tokens"("token");
CREATE INDEX IF NOT EXISTS "email_optout_tokens_tenant_id_idx" ON "email_optout_tokens"("tenant_id");

-- ===== campaigns / campaign_targets: channel, subject, send_link_on_first, email =====
ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "channel"            TEXT NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS "subject"            TEXT,
  ADD COLUMN IF NOT EXISTS "send_link_on_first" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "campaign_targets" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "campaign_targets" ALTER COLUMN "phone" SET DEFAULT '';
