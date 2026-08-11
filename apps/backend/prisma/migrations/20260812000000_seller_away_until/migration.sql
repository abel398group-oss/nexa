-- "Ausente até" no vendedor (módulo 1). Férias, atestado, afastamento.
-- Aditiva e nullable: toda linha existente fica NULL, que significa presente — nenhum
-- vendedor muda de comportamento por causa desta migration.
--
-- Data e não booleano: ausência tem fim. Booleano depende de alguém lembrar de desligar,
-- e quem volta na segunda passa a semana sem receber lead sem ninguém entender por quê.

ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "away_until" TIMESTAMP(3);

-- Índice parcial: só quem está ausente é filtrado, e são poucos. O índice sobre a tabela
-- inteira custaria escrita em todo update de vendedor para servir uma minoria de linhas.
CREATE INDEX IF NOT EXISTS "sellers_away_until_idx"
  ON "sellers" ("away_until") WHERE "away_until" IS NOT NULL;
