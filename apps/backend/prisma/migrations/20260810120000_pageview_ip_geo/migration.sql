-- Rastreio: passa a guardar IP e localização aproximada do visitante.
--
-- ATENÇÃO — isto muda a natureza do dado. Até aqui a tabela era ANÔNIMA de propósito:
-- o IP entrava só no hash diário (`visitor_hash`) e era descartado, o que mantinha o
-- rastreio fora do escopo de dado pessoal e dispensava banner de consentimento.
--
-- Com IP e país/região gravados, `page_views` passa a conter DADO PESSOAL sob a LGPD.
-- Obrigações que passam a existir e NÃO são resolvidas por esta migration:
--   • base legal declarada (legítimo interesse ou consentimento);
--   • política de privacidade dizendo que IP e localização são coletados;
--   • prazo de retenção definido e um expurgo que o cumpra;
--   • atender pedido de exclusão do titular.
--
-- Solicitado pelo Abel em 10/08/2026, depois de o custo jurídico ser apresentado.
-- Ver ADR do rastreio e pageview-sanitizer.ts.
ALTER TABLE "page_views" ADD COLUMN IF NOT EXISTS "ip" TEXT;

-- `country`/`region` já existiam desde a Fase 1, criadas e nunca preenchidas. Passam
-- a ser alimentadas quando o CDN informar a origem por header.

-- Índice para o expurgo por data (a retenção é o que torna o dado defensável) e para
-- a consulta "quem veio deste IP".
CREATE INDEX IF NOT EXISTS "page_views_tenant_id_ip_idx" ON "page_views" ("tenant_id", "ip");
