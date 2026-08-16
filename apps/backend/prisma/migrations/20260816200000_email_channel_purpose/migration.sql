-- Propósito da caixa de e-mail: separa prospecção fria de transacional.
--
-- Hoje as duas saem do mesmo remetente. Uma denúncia de spam vinda do cold mail derruba
-- a reputação que a redefinição de senha e o alerta do Monitor precisam — e são esses
-- que não podem falhar.
--
-- Aditiva e com default que PRESERVA o comportamento: toda caixa existente vira `both` e
-- continua servindo aos dois. A separação só passa a valer quando o tenant cadastrar uma
-- segunda caixa e marcar o propósito dela. Nenhum envio muda no deploy.
ALTER TABLE "email_channels"
  ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'both';

-- Busca por propósito dentro do tenant, feita a cada envio.
CREATE INDEX IF NOT EXISTS "email_channels_tenant_purpose_idx"
  ON "email_channels" ("tenant_id", "purpose");
