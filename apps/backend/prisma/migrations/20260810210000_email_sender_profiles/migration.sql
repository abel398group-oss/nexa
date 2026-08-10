-- Perfis de remetente: mais de uma caixa por tenant, uma delas envia.
--
-- Motivo: a prospecção passa a sair do endereço do vendedor, e não da Lia. Sem
-- isto a troca seria destrutiva — sobrescrever a única linha apagaria a caixa da
-- Lia, e a resposta a qualquer disparo antigo cairia numa caixa que ninguém mais
-- lê. Agora as duas ficam cadastradas: TODAS as ativas são lidas pelo poller, só
-- a marcada em `is_sender` envia.
--
-- A remoção da unicidade é permissiva (não apaga dado e não invalida linha
-- existente); o índice comum entra no lugar para as consultas por tenant.
ALTER TABLE "email_channels" DROP CONSTRAINT IF EXISTS "email_channels_tenant_id_key";
DROP INDEX IF EXISTS "email_channels_tenant_id_key";

ALTER TABLE "email_channels" ADD COLUMN IF NOT EXISTS "label" TEXT NOT NULL DEFAULT 'Principal';
ALTER TABLE "email_channels" ADD COLUMN IF NOT EXISTS "is_sender" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "email_channels_tenant_id_idx" ON "email_channels" ("tenant_id");

-- A caixa que já existia continua sendo a remetente e ganha o nome de quem ela é.
-- Sem isto o tenant ficaria com zero remetentes no primeiro boot e nenhum e-mail
-- sairia — o default da coluna cobre, mas ser explícito aqui evita depender dele.
UPDATE "email_channels" SET "is_sender" = true WHERE "is_sender" IS NOT TRUE;
UPDATE "email_channels" SET "label" = split_part("from_email", '@', 1)
 WHERE "label" = 'Principal' AND "from_email" LIKE '%@%';
