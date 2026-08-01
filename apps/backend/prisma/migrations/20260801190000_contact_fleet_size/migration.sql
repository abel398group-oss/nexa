-- Contact.fleetSize — frota informada pelo próprio lead na conversa (2026-08-01).
-- ADITIVA e nullable: contatos existentes continuam válidos com NULL.
-- IF NOT EXISTS torna a migration idempotente (ver docs/infra/prisma-migrations.md).
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "fleet_size" INTEGER;
