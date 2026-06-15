-- Portal de suporte (ADR 027 / support-portal): vincula a conversa ao cliente do TMS
-- e adiciona o canal 'portal'. Migration aditiva e segura (coluna opcional + índice).
-- PG16: ADD VALUE pode rodar na transação pois o valor não é usado nesta migration.

-- AlterEnum: novo canal de origem
ALTER TYPE "SourceChannel" ADD VALUE IF NOT EXISTS 'portal';

-- AlterTable: id do cliente externo (TMS) na conversa — base do escopo do portal
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "external_id" TEXT;

-- CreateIndex: listagem dos chamados por cliente (tenant + externalId)
CREATE INDEX IF NOT EXISTS "ai_conversations_tenant_id_external_id_idx" ON "ai_conversations"("tenant_id", "external_id");
