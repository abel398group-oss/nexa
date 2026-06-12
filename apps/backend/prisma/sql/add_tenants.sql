-- Cria APENAS a tabela `tenants` (Platform Admin — Sprint A).
-- Cirúrgico de propósito: não toca em nenhuma outra tabela (evita o drift de
-- contacts que o `db push` tentou aplicar junto). Idempotente (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS "tenants" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "slug"       TEXT NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'active',
  "product_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_key" ON "tenants" ("slug");
