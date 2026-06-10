-- ADR 021 — Expande EmailChannel para suporte a SMTP/IMAP (Hostgator)
-- Migration: 20260610020000_email_channel_smtp

-- Recria a tabela com os campos SMTP/IMAP
-- (tabela foi criada na migration anterior sem dados, seguro recriar)
DROP TABLE IF EXISTS "email_channels";

CREATE TABLE "email_channels" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"    TEXT NOT NULL,
  "provider"     TEXT NOT NULL DEFAULT 'smtp',
  -- Remetente
  "from_email"   TEXT NOT NULL,
  "from_name"    TEXT NOT NULL DEFAULT 'Lia HiperTMS',
  "reply_to"     TEXT,
  -- SMTP
  "smtp_host"    TEXT NOT NULL DEFAULT 'mail.hipertms.com.br',
  "smtp_port"    INTEGER NOT NULL DEFAULT 465,
  "smtp_user"    TEXT NOT NULL,
  "smtp_pass"    TEXT NOT NULL,
  "smtp_secure"  BOOLEAN NOT NULL DEFAULT TRUE,
  -- IMAP
  "imap_host"    TEXT NOT NULL DEFAULT 'mail.hipertms.com.br',
  "imap_port"    INTEGER NOT NULL DEFAULT 993,
  "imap_user"    TEXT NOT NULL,
  "imap_pass"    TEXT NOT NULL,
  "imap_mailbox" TEXT NOT NULL DEFAULT 'INBOX',
  -- Controle
  "is_active"    BOOLEAN NOT NULL DEFAULT TRUE,
  "last_poll_at" TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_channels_tenant_id_key"
  ON "email_channels"("tenant_id");
