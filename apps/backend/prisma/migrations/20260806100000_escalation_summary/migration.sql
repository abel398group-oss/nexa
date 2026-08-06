-- F10 (2026-08-06): resumo executivo de 3 linhas do transbordo, gerado pelo
-- EscalationAgentService no momento em que um ticket escala para humano.
-- Ver docs/reviews/2026-08-05-auditoria-suporte.md e
-- apps/backend/src/application/agents/escalation-agent.service.ts.
--
-- Aditivo: 1 coluna nova, nullable. IF NOT EXISTS mantém re-executável.

ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "escalation_summary" TEXT;
