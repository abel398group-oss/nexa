-- Mercados (ADR 037) — vender para mais de um cliente no mesmo Nexa.
--
-- Tudo aditivo. `products` já é a tabela de mercados: `product_code` é a chave que
-- separa conhecimento, campanha e conector no sistema inteiro, e criar um `market_id`
-- paralelo daria duas chaves para o mesmo conceito. O que falta são os campos de
-- identidade e de liberação.
--
-- NÃO mexe em contatos: a base continua única por tenant. Com um único número de
-- WhatsApp o lead tem uma thread só, e dois cadastros para a mesma pessoa criariam
-- dois donos para uma conversa só. Ver ADR 037.

-- ── A cara do mercado no e-mail ─────────────────────────────────────────────
-- Nulo = usa a marca padrão (HiperTMS). Mercado de parceiro sem isto sairia com o
-- wordmark errado para o lead dele.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "display_name"  TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand_color"   TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand_tagline" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "signup_url"    TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sender_name"   TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "released_at"   TIMESTAMP(3);

-- O HiperTMS já está em produção vendendo: nasce liberado, com a data de agora.
-- Deixá-lo cair na trava de liberação pararia o disparo que funciona hoje.
UPDATE "products" SET "released_at" = now() WHERE "status" = 'active' AND "released_at" IS NULL;

-- ── Fato sem fonte ──────────────────────────────────────────────────────────
-- Default false: os 1.477 artigos existentes seguem valendo sem backfill. Só o que
-- for importado daqui pra frente pode nascer marcado.
ALTER TABLE "ai_knowledge_base" ADD COLUMN IF NOT EXISTS "requires_source" BOOLEAN NOT NULL DEFAULT false;

-- ── Playbook por mercado ────────────────────────────────────────────────────
-- NULL = playbook do tenant, que é exatamente a linha que já existe hoje. Ela
-- continua sendo o fallback de quem não tiver um específico.
ALTER TABLE "sales_playbook" ADD COLUMN IF NOT EXISTS "product_code" TEXT;

-- O unique era só (tenant_id): com ele, o segundo mercado não caberia na tabela.
-- Em Postgres, NULL não colide com NULL num unique composto — por isso a linha do
-- tenant (product_code NULL) convive com as dos mercados sem conflito.
ALTER TABLE "sales_playbook" DROP CONSTRAINT IF EXISTS "sales_playbook_tenant_id_key";
DROP INDEX IF EXISTS "sales_playbook_tenant_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "sales_playbook_tenant_id_product_code_key"
  ON "sales_playbook" ("tenant_id", "product_code");

-- ── Biblioteca de modelos de mensagem ───────────────────────────────────────
-- Antes não existia: cada campanha era texto digitado do zero e a única forma de
-- reaproveitar era clonar, o que encheu a base de "Cópia de Cópia de teste".
CREATE TABLE IF NOT EXISTS "message_templates" (
  "id"           TEXT NOT NULL,
  "tenant_id"    TEXT NOT NULL,
  "product_code" TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "channel"      TEXT NOT NULL,
  "subject"      TEXT,
  "body"         TEXT NOT NULL,
  "step"         INTEGER NOT NULL DEFAULT 1,
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- Consulta da tela de disparo: modelos ativos de UM mercado.
CREATE INDEX IF NOT EXISTS "message_templates_tenant_id_product_code_active_idx"
  ON "message_templates" ("tenant_id", "product_code", "active");
