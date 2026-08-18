-- Material de campanha do mercado (ADR 037).
--
-- O plano de campanha existe em `marketing-social/` como arquivo `.md` e não existia
-- lugar nenhum dentro do Nexa para ele. Quem montava a campanha abria o arquivo fora do
-- sistema, copiava o texto e colava na tela de Mensagens — e o plano, que é a fonte,
-- ficava de fora. A Lia nunca via.
--
-- O conteúdo mora na própria linha, em `text`. São arquivos de 5 a 15 KB; guardá-los num
-- armazenamento de objeto custaria uma dependência nova para segurar o que cabe numa
-- coluna. PDF de portfólio NÃO entra aqui: é binário, e precisa de destino próprio.
--
-- Aditiva: cria uma tabela nova e dois índices. Nenhuma linha, coluna ou tabela
-- existente é tocada.

CREATE TABLE IF NOT EXISTS "market_assets" (
    "id"           TEXT NOT NULL,
    "tenant_id"    TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "content"      TEXT NOT NULL,
    "size_bytes"   INTEGER NOT NULL,
    -- Nasce em `pending` por padrão da COLUNA, e não só por padrão do código: material
    -- que entra já valendo é material que ninguém leu falando com o lead.
    "status"       TEXT NOT NULL DEFAULT 'pending',
    "approved_at"  TIMESTAMP(3),
    "approved_by"  TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_assets_pkey" PRIMARY KEY ("id")
);

-- Subir o mesmo arquivo de novo é correção, não cópia. Sem este único, o operador que
-- ajusta o plano e arrasta outra vez fica com duas versões do mesmo nome na lista e
-- nenhuma pista de qual a Lia está lendo.
CREATE UNIQUE INDEX IF NOT EXISTS "market_assets_tenant_product_name_key"
    ON "market_assets" ("tenant_id", "product_code", "name");

-- A consulta que a tela faz: material de um mercado, separado por aprovado e pendente.
CREATE INDEX IF NOT EXISTS "market_assets_tenant_product_status_idx"
    ON "market_assets" ("tenant_id", "product_code", "status");
