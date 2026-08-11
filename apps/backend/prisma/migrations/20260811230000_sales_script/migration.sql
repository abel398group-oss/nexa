-- Roteiro do SDR por mercado (módulo 1, itens 3-6).
-- Aditiva: tabela nova, nada tocado no que existe.
--
-- Uma linha por versão. Salvar cria linha nova e desliga o `active` da anterior, em vez
-- de sobrescrever — a ligação registrada ontem precisa continuar apontando para o texto
-- que estava na tela ontem, senão o versionamento não mede nada.

CREATE TABLE IF NOT EXISTS "sales_scripts" (
  "id"                 TEXT NOT NULL,
  "tenant_id"          TEXT NOT NULL,
  "product_code"       TEXT NOT NULL,
  "version"            INTEGER NOT NULL DEFAULT 1,
  "active"             BOOLEAN NOT NULL DEFAULT true,
  "abertura_call"      TEXT,
  "abertura_whatsapp"  TEXT,
  "abertura_email"     TEXT,
  "assunto_email"      TEXT,
  "objecoes"           JSONB,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_user_id" TEXT,
  CONSTRAINT "sales_scripts_pkey" PRIMARY KEY ("id")
);

-- Uma versão N por mercado, sempre. Sem isso, dois salvamentos simultâneos gerariam
-- duas "versão 3" e o histórico ficaria ambíguo justamente onde ele precisa ser exato.
CREATE UNIQUE INDEX IF NOT EXISTS "sales_scripts_product_code_version_key"
  ON "sales_scripts" ("product_code", "version");

CREATE INDEX IF NOT EXISTS "sales_scripts_tenant_id_product_code_active_idx"
  ON "sales_scripts" ("tenant_id", "product_code", "active");
