-- Partner (F7 — RevOps, 2026-08-05): empresa parceira EXTERNA (ex.: fornecedor
-- de pneus) que recebe lead qualificado por indicação/cross-sell. NÃO é um
-- Tenant — o dado continua pertencendo ao tenant, só ganha um carimbo de
-- export auditado. Compartilhar exige consentimento do lead (LGPD) — ver
-- partner_consent_at abaixo, gate aplicado em código (opportunities.service.ts),
-- não só documentado.
-- Aditivo: tabela nova + colunas novas em opportunities. IF NOT EXISTS mantém
-- re-executável (convenção do repo pro banco de prod).

CREATE TABLE IF NOT EXISTS "partners" (
  "id"            TEXT PRIMARY KEY,
  "tenant_id"     TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "type"          TEXT NOT NULL,       -- ex.: 'pneus'
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "contact_email" TEXT,
  "contact_phone" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "partners_tenant_id_idx" ON "partners" ("tenant_id");

ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "shared_with_partner_id" TEXT;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "partner_share_status" TEXT;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "partner_shared_at" TIMESTAMP(3);
-- Presença de timestamp = consentimento dado (auditável: QUANDO, não só um booleano).
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "partner_consent_at" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "opportunities"
    ADD CONSTRAINT "opportunities_shared_with_partner_id_fkey"
    FOREIGN KEY ("shared_with_partner_id") REFERENCES "partners"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "opportunities_tenant_id_shared_with_partner_id_idx"
  ON "opportunities" ("tenant_id", "shared_with_partner_id");
