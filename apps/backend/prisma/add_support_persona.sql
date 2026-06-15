-- Config de Suporte: persona/tom da Lia de suporte (separado do de vendas).
-- Idempotente. Rodar com: npx prisma db execute --file prisma/add_support_persona.sql --schema prisma/schema.prisma
ALTER TABLE "sales_playbook"
  ADD COLUMN IF NOT EXISTS "support_persona" TEXT NOT NULL DEFAULT '';
