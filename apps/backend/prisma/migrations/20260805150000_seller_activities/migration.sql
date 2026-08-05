-- SellerActivity (F7 — expansão RevOps, 2026-08-05): registro manual de
-- atividade do vendedor humano (ligação, e-mail, nota). Sem isto o painel de
-- KPI de vendedor (sellersKpi/sellerOverview) não tinha nenhum dado que não
-- viesse da IA. Aditivo: tabela nova, nenhuma coluna existente tocada.
-- IF NOT EXISTS mantém re-executável (convenção do repo pro banco de prod).

CREATE TABLE IF NOT EXISTS "seller_activities" (
  "id"             TEXT PRIMARY KEY,
  "tenant_id"      TEXT NOT NULL,
  "seller_id"      TEXT NOT NULL,
  "opportunity_id" TEXT,
  "type"           TEXT NOT NULL,       -- call | email | note
  "result"         TEXT,                -- atendeu | nao_atendeu | agendou_retorno | enviado | respondido | outro
  "duration_sec"   INTEGER,             -- so faz sentido pra type=call
  "notes"          TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  ALTER TABLE "seller_activities"
    ADD CONSTRAINT "seller_activities_seller_id_fkey"
    FOREIGN KEY ("seller_id") REFERENCES "sellers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "seller_activities"
    ADD CONSTRAINT "seller_activities_opportunity_id_fkey"
    FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "seller_activities_tenant_id_seller_id_idx"
  ON "seller_activities" ("tenant_id", "seller_id");

CREATE INDEX IF NOT EXISTS "seller_activities_tenant_id_opportunity_id_idx"
  ON "seller_activities" ("tenant_id", "opportunity_id");
