-- Etapa 2A: autor humano da mensagem, gravado a partir do JWT (nunca do body).
-- Base da regra "só o autor edita a própria nota interna". Aditiva e nullable:
-- mensagens existentes ficam sem autor e só admin pode editá-las.
ALTER TABLE "ai_messages" ADD COLUMN "author_user_id" TEXT;
