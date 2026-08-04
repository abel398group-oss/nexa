-- ContactAbuseRecord — contador de tentativas de manipulação da Lia por telefone
-- ("3 strikes"). Aditivo: tabela nova, nenhuma coluna existente tocada.
CREATE TABLE IF NOT EXISTS "contact_abuse_records" (
  "id"             TEXT PRIMARY KEY,
  "tenant_id"      TEXT NOT NULL,
  "phone"          TEXT NOT NULL,
  "strike_count"   INTEGER NOT NULL DEFAULT 0,
  "last_violation" TEXT,
  "last_detail"    TEXT,
  "last_at"        TIMESTAMP(3),
  "banned_at"      TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "contact_abuse_records_tenant_id_phone_key"
  ON "contact_abuse_records" ("tenant_id", "phone");

CREATE INDEX IF NOT EXISTS "contact_abuse_records_tenant_id_banned_at_idx"
  ON "contact_abuse_records" ("tenant_id", "banned_at");
