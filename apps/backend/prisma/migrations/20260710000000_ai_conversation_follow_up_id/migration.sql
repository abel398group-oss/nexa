-- N1: follow-up de chamado fechado
-- Aditiva: apenas adiciona coluna nullable + FK opcional (sem default, sem NOT NULL).
ALTER TABLE "ai_conversations"
  ADD COLUMN "follow_up_of_id" TEXT,
  ADD CONSTRAINT "ai_conversations_follow_up_of_id_fkey"
    FOREIGN KEY ("follow_up_of_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL;
