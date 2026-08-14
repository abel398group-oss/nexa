-- Divisão de números (linha vendas): campanha e número-do-pool passam a saber
-- por qual linha rodam. Default 'principal' preserva o comportamento histórico
-- de todo registro existente — só campanha NOVA (criada depois deste deploy)
-- recebe 'vendas' explicitamente, na aplicação (ver SenderService.createCampaign).
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "linha" TEXT NOT NULL DEFAULT 'principal';
ALTER TABLE "sender_numbers" ADD COLUMN IF NOT EXISTS "linha" TEXT NOT NULL DEFAULT 'principal';

CREATE INDEX IF NOT EXISTS "sender_numbers_tenant_id_linha_idx" ON "sender_numbers"("tenant_id", "linha");
