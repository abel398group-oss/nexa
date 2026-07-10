-- Migration: support_email_routes
-- Replaces single Tenant.support_email with a per-category routing table.
-- Additive: existing support_email rows are migrated to a default route (category IS NULL).

CREATE TABLE "support_email_routes" (
  "id"         TEXT        NOT NULL,
  "tenant_id"  TEXT        NOT NULL,
  "category"   TEXT,
  "email"      TEXT        NOT NULL,
  "label"      TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_email_routes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_email_routes_tenant_id_category_key"
  ON "support_email_routes"("tenant_id", "category");

CREATE INDEX "support_email_routes_tenant_id_idx"
  ON "support_email_routes"("tenant_id");

ALTER TABLE "support_email_routes"
  ADD CONSTRAINT "support_email_routes_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: migrate existing Tenant.support_email to default route (category IS NULL).
INSERT INTO "support_email_routes" ("id", "tenant_id", "category", "email", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  id,
  NULL,
  "support_email",
  now(),
  now()
FROM "tenants"
WHERE "support_email" IS NOT NULL AND "support_email" <> '';
