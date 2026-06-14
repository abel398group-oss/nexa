-- F6: funil de oportunidades. Idempotente. Nao apaga nada.
CREATE TABLE IF NOT EXISTS "opportunities" (
  "id"              TEXT NOT NULL,
  "tenant_id"       TEXT NOT NULL,
  "contact_id"      TEXT,
  "conversation_id" TEXT,
  "phone"           TEXT,
  "name"            TEXT,
  "company"         TEXT,
  "stage"           TEXT NOT NULL DEFAULT 'new',
  "interest_score"  INTEGER NOT NULL DEFAULT 0,
  "intent"          TEXT,
  "summary"         TEXT,
  "value"           DECIMAL(12,2),
  "assigned_to"     TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "opportunities_tenant_id_idx" ON "opportunities" ("tenant_id");
CREATE INDEX IF NOT EXISTS "opportunities_tenant_id_stage_idx" ON "opportunities" ("tenant_id", "stage");
CREATE INDEX IF NOT EXISTS "opportunities_tenant_id_conversation_id_idx" ON "opportunities" ("tenant_id", "conversation_id");

CREATE TABLE IF NOT EXISTS "opportunity_stage_history" (
  "id"             TEXT NOT NULL,
  "opportunity_id" TEXT NOT NULL,
  "from_stage"     TEXT,
  "to_stage"       TEXT NOT NULL,
  "reason"         TEXT,
  "changed_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "opportunity_stage_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "opportunity_stage_history_opportunity_id_fkey"
    FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "opportunity_stage_history_opportunity_id_idx" ON "opportunity_stage_history" ("opportunity_id");
