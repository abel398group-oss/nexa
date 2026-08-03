-- Recuperação de senha ("Esqueceu a senha?") — token de uso único, TTL 30min.
-- Aditiva: cria só a tabela nova, não altera nada existente (REGRA 5).
-- Guarda o HASH do token (nunca ele em claro), para que um vazamento do banco
-- não entregue links de redefinição válidos.
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id"         TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "used_at"    TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_key"
    ON "password_reset_tokens"("token_hash");

CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx"
    ON "password_reset_tokens"("user_id");
