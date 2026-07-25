-- F6+ seller-leads (2026-07-20): real seller ownership + pause/discard metadata.
-- Additive only; IF NOT EXISTS keeps it re-runnable (repo convention for prod DB).

ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "assigned_seller_id" TEXT;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "paused_until" TIMESTAMP(3);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "discard_reason" TEXT;

DO $$ BEGIN
  ALTER TABLE "opportunities"
    ADD CONSTRAINT "opportunities_assigned_seller_id_fkey"
    FOREIGN KEY ("assigned_seller_id") REFERENCES "sellers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "opportunities_tenant_id_assigned_seller_id_idx"
  ON "opportunities"("tenant_id", "assigned_seller_id");
