-- Lista de bloqueio permanente (LGPD): quem pediu para não receber mais.
-- Separada de `contacts` porque apagar o contato apagava o pedido — aconteceu
-- em 2026-08-03 e a pessoa voltou a receber campanha após uma reimportação.
-- Aditiva: só cria tabela nova (REGRA 5).
CREATE TABLE IF NOT EXISTS "opt_out_records" (
    "id"         TEXT NOT NULL,
    "tenant_id"  TEXT NOT NULL,
    "phone"      TEXT,
    "email"      TEXT,
    "reason"     TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opt_out_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "opt_out_records_tenant_id_phone_key"
    ON "opt_out_records"("tenant_id", "phone");

CREATE UNIQUE INDEX IF NOT EXISTS "opt_out_records_tenant_id_email_key"
    ON "opt_out_records"("tenant_id", "email");

CREATE INDEX IF NOT EXISTS "opt_out_records_tenant_id_idx"
    ON "opt_out_records"("tenant_id");

-- Backfill: quem já está como opted_out entra na lista, senão o histórico atual
-- ficaria desprotegido justamente contra o problema que motivou a tabela.
INSERT INTO "opt_out_records" ("id", "tenant_id", "phone", "email", "reason", "created_at")
SELECT gen_random_uuid()::text, c."tenant_id", c."phone", c."email", 'backfill', COALESCE(c."opt_out_at", CURRENT_TIMESTAMP)
FROM "contacts" c
WHERE c."status" = 'opted_out'
ON CONFLICT DO NOTHING;
