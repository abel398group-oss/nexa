-- Lote na oportunidade (bug B2 da auditoria).
--
-- Contact.batchId guarda a PRIMEIRA lista que trouxe a pessoa e nunca muda. Quando o
-- mesmo contato voltava numa lista nova, a oportunidade nova era criada mas a
-- distribuição do lote novo não a encontrava — procurava por contatos com aquele
-- batchId, e o contato ainda apontava para o lote antigo. Resultado: oportunidade sem
-- dono, invisível para todo SDR, para sempre.
--
-- O lote pertence ao TRABALHO, não à pessoa: uma pessoa vem de várias listas ao longo
-- do tempo, cada oportunidade nasce de exatamente uma.

ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "batch_id" TEXT;

-- Índice parcial: só oportunidades vindas de lote são filtradas por ele.
CREATE INDEX IF NOT EXISTS "opportunities_batch_id_idx"
  ON "opportunities" ("batch_id") WHERE "batch_id" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "opportunities"
    ADD CONSTRAINT "opportunities_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "lead_batches" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill das oportunidades que já existem: herdam o lote do contato. É a informação
-- correta para elas — foram criadas quando contato e oportunidade tinham o mesmo lote.
UPDATE "opportunities" o
   SET "batch_id" = c."batch_id"
  FROM "contacts" c
 WHERE o."contact_id" = c."id"
   AND c."batch_id" IS NOT NULL
   AND o."batch_id" IS NULL;
