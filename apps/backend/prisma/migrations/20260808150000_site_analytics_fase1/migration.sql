-- Analytics de audiência do site — FASE 1 (aditivo).
--
-- Duas tabelas novas, nenhuma alteração em tabela existente.
--
-- `websites`: mapeia a chave PÚBLICA usada pelo frontend do produto para o tenant
-- e o domínio autorizado. A chave identifica, não autentica.
--
-- `page_views`: um registro por visita de página pública. NÃO guarda IP cru nem
-- identificador persistente de navegador — só `visitor_hash`, que é
-- sha256(salt do dia + ip + user agent). O salt trocando diariamente é o que faz o
-- hash deixar de ser dado pessoal sob a LGPD e dispensa banner de consentimento.

CREATE TABLE IF NOT EXISTS "websites" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "key"        TEXT NOT NULL,
  "domain"     TEXT NOT NULL,
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "websites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "websites_key_key" ON "websites"("key");
CREATE INDEX IF NOT EXISTS "websites_tenant_id_idx" ON "websites"("tenant_id");

CREATE TABLE IF NOT EXISTS "page_views" (
  "id"              TEXT NOT NULL,
  "tenant_id"       TEXT NOT NULL,
  "website_key"     TEXT NOT NULL,
  "path"            TEXT NOT NULL,
  "query"           TEXT,
  "title"           TEXT,
  "referrer_domain" TEXT,
  "utm_source"      TEXT,
  "utm_medium"      TEXT,
  "utm_campaign"    TEXT,
  "utm_term"        TEXT,
  "utm_content"     TEXT,
  "click_id"        TEXT,
  "visitor_hash"    TEXT NOT NULL,
  "country"         TEXT,
  "region"          TEXT,
  "browser"         TEXT,
  "os"              TEXT,
  "device"          TEXT,
  "language"        TEXT,
  "screen"          TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

-- Série diária e recortes por período (a query mais quente do painel).
CREATE INDEX IF NOT EXISTS "page_views_tenant_id_created_at_idx" ON "page_views"("tenant_id", "created_at");
-- Contagem de visitante único por dia.
CREATE INDEX IF NOT EXISTS "page_views_tenant_id_visitor_hash_created_at_idx" ON "page_views"("tenant_id", "visitor_hash", "created_at");
-- Top origens e, na Fase 2, atribuição por campanha.
CREATE INDEX IF NOT EXISTS "page_views_tenant_id_utm_campaign_created_at_idx" ON "page_views"("tenant_id", "utm_campaign", "created_at");
-- Top páginas.
CREATE INDEX IF NOT EXISTS "page_views_tenant_id_path_created_at_idx" ON "page_views"("tenant_id", "path", "created_at");
