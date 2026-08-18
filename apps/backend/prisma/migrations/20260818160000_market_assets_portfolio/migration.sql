-- Portfólio no material do mercado (ADR 037).
--
-- A tabela nasceu hoje guardando só texto: o roteiro da campanha, em `.md`, no próprio
-- registro. Faltava a outra metade do que o vendedor usa — portfólio, folder, foto. É
-- binário, e binário não cabe numa coluna `text`.
--
-- Os bytes vão para `uploads/` no disco e a linha guarda só o CAMINHO RELATIVO, do mesmo
-- jeito que o anexo da campanha de WhatsApp já faz (sender.controller). Relativo de
-- propósito: a URL pública é remontada no envio com MEDIA_PUBLIC_BASE, e gravar o
-- domínio aqui congelaria no banco um endereço que muda com o ambiente.
--
-- Aditiva: três colunas novas, um índice novo, e `content` deixa de ser obrigatória.
-- Nenhuma linha é alterada — a tabela está vazia (criada hoje, ainda sem uso real).

-- `kind` com DEFAULT 'plan' para que qualquer linha existente continue significando o
-- que significava: roteiro de texto.
ALTER TABLE "market_assets" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'plan';
ALTER TABLE "market_assets" ADD COLUMN IF NOT EXISTS "file_url" TEXT;
ALTER TABLE "market_assets" ADD COLUMN IF NOT EXISTS "mime_type" TEXT;

-- Portfólio não tem texto nenhum. Sem isto, guardar um PDF exigiria gravar uma string
-- vazia em `content` — um valor que mente sobre o que existe.
ALTER TABLE "market_assets" ALTER COLUMN "content" DROP NOT NULL;

-- A tela pede as duas listas separadas (roteiro e portfólio), cada uma com o pendente
-- na frente. O índice antigo não distinguia o tipo.
CREATE INDEX IF NOT EXISTS "market_assets_tenant_product_kind_status_idx"
    ON "market_assets" ("tenant_id", "product_code", "kind", "status");
