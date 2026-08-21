-- Campanha que originou a oportunidade.
--
-- Fecha a corrente de atribuição: parceiro → mercado → campanha → SDR → closer →
-- venda. Sem esta coluna o funil andava inteiro e não sabia responder "de onde veio o
-- que fechou": ganho e perda não voltavam para informar campanha nenhuma, e decidir
-- qual lista comprar de novo era palpite.
--
-- Separada de `batch_id` porque as perguntas são diferentes: o lote diz de qual LISTA
-- a pessoa veio; a campanha diz qual DISPARO a fez responder. A mesma lista rende
-- várias campanhas, e só uma delas converteu.
--
-- Aditiva e anulável: oportunidade que não nasceu de disparo (indicação, lead que
-- chegou sozinho, criada à mão) fica com NULL, e todas as existentes também.
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "campaign_id" TEXT;

-- "O que esta campanha rendeu" é a consulta que a coluna existe para servir.
CREATE INDEX IF NOT EXISTS "opportunities_tenant_id_campaign_id_idx"
  ON "opportunities" ("tenant_id", "campaign_id");
