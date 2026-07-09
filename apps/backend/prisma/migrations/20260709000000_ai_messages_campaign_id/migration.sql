-- C3 (auditoria 2026-07-08): coluna dedicada + índice para campaignId em ai_messages.
-- Substitui o filtro `metadata->>'campaignId'` (usado no detalhe/conversão de campanha
-- e nas métricas), que não usava índice e fazia sequential scan na maior tabela do banco.
--
-- Passos: (1) adiciona a coluna, (2) faz backfill a partir do metadata já gravado nas
-- campanhas existentes, (3) cria o índice.
--
-- NOTA PARA O DEPLOY (Abel): em uma tabela ai_messages já MUITO grande em produção, o
-- CREATE INDEX abaixo pega um lock de escrita durante a criação. Se necessário, rode o
-- índice separadamente com CREATE INDEX CONCURRENTLY (fora de transação) antes de aplicar
-- esta migration, e remova a linha do índice daqui. No estado atual (pré-escala) o índice
-- normal é seguro.

-- 1. Nova coluna
ALTER TABLE "ai_messages" ADD COLUMN "campaign_id" TEXT;

-- 2. Backfill das campanhas já enviadas (metadata.campaignId)
UPDATE "ai_messages"
SET "campaign_id" = "metadata"->>'campaignId'
WHERE "metadata" ? 'campaignId';

-- 3. Índice para engajamento/conversão por campanha (sem full scan)
CREATE INDEX "ai_messages_campaign_id_idx" ON "ai_messages"("campaign_id");
