-- F8 (parceiros multi-produto, 2026-08-05): de qual produto a campanha fala.
--
-- O lead herda isto na conversa, e a busca de conhecimento passa a filtrar por
-- produto — sem isso, um lead vindo da campanha de pneus perguntava "quanto
-- custa?" e a Lia respondia sobre CT-e, porque a base era uma só.
--
-- NULL = campanha do produto principal (comportamento atual, nada muda para as
-- campanhas que já existem). Aditivo, coluna nova nullable.

ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "product_code" TEXT;

-- A busca de conhecimento filtra por (tenant, produto); o índice acompanha.
CREATE INDEX IF NOT EXISTS "ai_knowledge_base_tenant_id_product_code_idx"
  ON "ai_knowledge_base" ("tenant_id", "product_code");
