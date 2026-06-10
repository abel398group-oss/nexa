-- HandoffToken: botão "Falar com a Lia" no painel TMS (ADR 022 Modalidade B)
CREATE TABLE IF NOT EXISTS "handoff_tokens" (
  "id"          TEXT         NOT NULL,
  "token"       TEXT         NOT NULL,
  "tenant_id"   TEXT         NOT NULL,
  "external_id" TEXT         NOT NULL,
  "page"        TEXT,
  "error_code"  TEXT,
  "used_at"     TIMESTAMP(3),
  "expires_at"  TIMESTAMP(3) NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "handoff_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "handoff_tokens_token_key"
  ON "handoff_tokens"("token");

CREATE INDEX IF NOT EXISTS "handoff_tokens_token_idx"
  ON "handoff_tokens"("token");

CREATE INDEX IF NOT EXISTS "handoff_tokens_tenant_id_idx"
  ON "handoff_tokens"("tenant_id");
