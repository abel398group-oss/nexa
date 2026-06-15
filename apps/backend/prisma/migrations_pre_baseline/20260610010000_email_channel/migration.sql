-- ADR 021 — Canal de e-mail: configuração + tokens de opt-out
-- Migration: 20260610010000_email_channel

-- Configuração do canal de e-mail por tenant
CREATE TABLE IF NOT EXISTS "email_channels" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"   TEXT NOT NULL,
  "provider"    TEXT NOT NULL DEFAULT 'mailgun',
  "inbox_email" TEXT NOT NULL,
  "from_email"  TEXT NOT NULL,
  "domain"      TEXT,
  "is_active"   BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_channels_tenant_id_key"
  ON "email_channels"("tenant_id");

-- Tokens de opt-out para descadastro em 2 passos (TTL 30 dias, uso único)
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

CREATE UNIQUE INDEX IF NOT EXISTS "email_optout_tokens_token_key"
  ON "email_optout_tokens"("token");

CREATE INDEX IF NOT EXISTS "email_optout_tokens_tenant_id_idx"
  ON "email_optout_tokens"("tenant_id");
