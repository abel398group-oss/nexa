-- Contact: nameSource field (ADR 020) + email unique index (ADR 021)

-- Campo de origem do nome: pushname | tms | manual
ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "name_source" TEXT DEFAULT 'pushname';

-- Índice único por (tenantId, email) — NULL é permitido pelo Postgres
-- Garante que email seja sempre NULL quando vazio (nunca string vazia)
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_tenant_id_email_key"
  ON "contacts"("tenant_id", "email")
  WHERE "email" IS NOT NULL;
