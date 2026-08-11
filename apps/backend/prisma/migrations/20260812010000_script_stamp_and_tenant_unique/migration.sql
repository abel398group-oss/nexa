-- Correções da auditoria de 11/08 (A1 e A2 do relatório).
--
-- A1: carimbo da versão do roteiro na atividade do SDR. Sem ele, o versionamento do
--     roteiro não mede nada — "o texto novo converteu melhor?" fica sem resposta, e o
--     dado das ligações feitas sem o carimbo não se reconstrói depois.
ALTER TABLE "seller_activities" ADD COLUMN IF NOT EXISTS "script_version" INTEGER;

-- A2: o unique do roteiro não tinha tenant. Dois tenants com o mesmo productCode
--     (ex.: 'hipertms') colidiriam ao salvar a mesma versão N.
DROP INDEX IF EXISTS "sales_scripts_product_code_version_key";
CREATE UNIQUE INDEX IF NOT EXISTS "sales_scripts_tenant_id_product_code_version_key"
  ON "sales_scripts" ("tenant_id", "product_code", "version");
