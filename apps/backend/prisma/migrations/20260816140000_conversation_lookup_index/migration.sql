-- Lookup de conversa por telefone: usado pelo find-or-create do disparo
-- (sender.service.ts) e do inbound (whatsapp.service.ts), agora escopado por
-- linha e por canal.
--
-- Antes só existia @@index([tenant_id]), o que faz esses dois caminhos varrerem
-- todas as conversas do tenant a cada mensagem — e eles rodam por alvo de
-- campanha e por mensagem recebida.
--
-- Aditivo e idempotente. Sem CONCURRENTLY de propósito: o Prisma envolve a
-- migration numa transação, e CREATE INDEX CONCURRENTLY não roda dentro de uma.
-- O lock é curto na escala atual da tabela.
CREATE INDEX IF NOT EXISTS "ai_conversations_tenant_phone_started_idx"
  ON "ai_conversations" ("tenant_id", "phone", "started_at" DESC);
