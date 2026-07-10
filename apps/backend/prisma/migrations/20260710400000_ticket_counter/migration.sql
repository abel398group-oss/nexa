-- C2: ticket_counters — atomic sequential ticket numbering per tenant
-- Replaces MAX+1 race condition with INSERT ... ON CONFLICT DO UPDATE RETURNING.
CREATE TABLE "ticket_counters" (
  "tenant_id"   TEXT        NOT NULL,
  "last_number" INTEGER     NOT NULL DEFAULT 0,
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ticket_counters_pkey" PRIMARY KEY ("tenant_id")
);

-- Backfill: seed each existing tenant's counter with the MAX ticket_number already in use.
-- Tenants with no tickets yet are not inserted (counter starts at 1 on first INSERT ... ON CONFLICT).
INSERT INTO "ticket_counters" ("tenant_id", "last_number", "updated_at")
SELECT "tenant_id", COALESCE(MAX("ticket_number"), 0), now()
FROM "ai_conversations"
WHERE "ticket_number" IS NOT NULL
GROUP BY "tenant_id"
ON CONFLICT ("tenant_id") DO UPDATE
  SET "last_number" = EXCLUDED."last_number";
