-- Telemarketing modules 1-3 (docs/features/telemarketing/prd.md).
-- Additive only: two new tables, five nullable columns. Every existing row keeps
-- its current behaviour, so nothing needs a backfill.
--
-- Written with IF NOT EXISTS throughout: the production database is the one the
-- local .env points at, and a half-applied migration must be re-runnable.

-- ── LeadBatch — the list planning delivered ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "lead_batches" (
  "id"                  TEXT NOT NULL,
  "tenant_id"           TEXT NOT NULL,
  "product_code"        TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "source"              TEXT,
  "source_detail"       TEXT,
  "consent_basis"       TEXT,
  "uploaded_by_user_id" TEXT,
  "received_count"      INTEGER NOT NULL DEFAULT 0,
  "duplicate_count"     INTEGER NOT NULL DEFAULT 0,
  "invalid_count"       INTEGER NOT NULL DEFAULT 0,
  "valid_count"         INTEGER NOT NULL DEFAULT 0,
  "no_name_count"       INTEGER NOT NULL DEFAULT 0,
  "status"              TEXT NOT NULL DEFAULT 'draft',
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "lead_batches_tenant_id_idx"
  ON "lead_batches" ("tenant_id");
CREATE INDEX IF NOT EXISTS "lead_batches_tenant_id_product_code_idx"
  ON "lead_batches" ("tenant_id", "product_code");

-- ── SellerMarket — which mercados a seller may work ──────────────────────────
CREATE TABLE IF NOT EXISTS "seller_markets" (
  "id"           TEXT NOT NULL,
  "tenant_id"    TEXT NOT NULL,
  "seller_id"    TEXT NOT NULL,
  "product_code" TEXT NOT NULL,
  "role"         TEXT NOT NULL DEFAULT 'seller',
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_markets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "seller_markets_seller_id_product_code_key"
  ON "seller_markets" ("seller_id", "product_code");
CREATE INDEX IF NOT EXISTS "seller_markets_tenant_id_product_code_idx"
  ON "seller_markets" ("tenant_id", "product_code");

-- ── Nullable columns ────────────────────────────────────────────────────────
ALTER TABLE "contacts"      ADD COLUMN IF NOT EXISTS "batch_id"       TEXT;
ALTER TABLE "contacts"      ADD COLUMN IF NOT EXISTS "customer_since" TIMESTAMP(3);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "product_code"   TEXT;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "meeting_at"     TIMESTAMP(3);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "meeting_url"    TEXT;

-- Partial index: only leads that came from a batch are ever filtered by it, and
-- every pre-existing row is NULL.
CREATE INDEX IF NOT EXISTS "contacts_batch_id_idx"
  ON "contacts" ("batch_id") WHERE "batch_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "opportunities_tenant_id_product_code_idx"
  ON "opportunities" ("tenant_id", "product_code") WHERE "product_code" IS NOT NULL;

-- ── Foreign keys ────────────────────────────────────────────────────────────
-- SET NULL, not CASCADE: archiving a batch must never delete the contacts it
-- brought in. Losing the batch label costs a report; losing the leads costs the
-- operation.
DO $$ BEGIN
  ALTER TABLE "contacts"
    ADD CONSTRAINT "contacts_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "lead_batches" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "seller_markets"
    ADD CONSTRAINT "seller_markets_seller_id_fkey"
    FOREIGN KEY ("seller_id") REFERENCES "sellers" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
