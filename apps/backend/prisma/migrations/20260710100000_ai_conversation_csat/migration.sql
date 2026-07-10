-- N2: CSAT (satisfação do cliente) e token público de avaliação
-- Aditiva: apenas adiciona colunas nullable e índice único.
ALTER TABLE "ai_conversations"
  ADD COLUMN "csat_score"   INTEGER,
  ADD COLUMN "csat_comment" TEXT,
  ADD COLUMN "csat_token"   TEXT;

CREATE UNIQUE INDEX "ai_conversations_csat_token_key"
  ON "ai_conversations"("csat_token");
