-- Portal S1: coluna external_id em ai_conversations + indices (nomes iguais aos do Prisma).
-- Idempotente. Nao apaga nada.
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "external_id" TEXT;

CREATE INDEX IF NOT EXISTS "ai_conversations_tenant_id_external_id_idx"
  ON "ai_conversations" ("tenant_id", "external_id");

CREATE INDEX IF NOT EXISTS "contacts_tenant_id_external_contact_id_idx"
  ON "contacts" ("tenant_id", "external_contact_id");
