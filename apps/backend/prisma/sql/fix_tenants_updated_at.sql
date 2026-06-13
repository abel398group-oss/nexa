-- Prisma gerencia @updatedAt na aplicacao (coluna sem DEFAULT no banco).
-- Nosso add_tenants.sql tinha colocado um DEFAULT; remover para casar com o schema
-- e evitar o Prisma detectar "drift" nessa coluna no futuro.
ALTER TABLE "tenants" ALTER COLUMN "updated_at" DROP DEFAULT;
