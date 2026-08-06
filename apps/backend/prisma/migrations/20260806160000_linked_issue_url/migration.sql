-- F13 (2026-08-06, Ciclo 2 — ponte com Dev/N3): link manual da issue externa
-- (Jira/GitHub/ClickUp/Trello) vinculada ao chamado. Ver
-- docs/reviews/2026-08-06-auditoria-operacao-time-suporte.md, item 6.
--
-- Aditivo: 1 coluna nova, nullable. IF NOT EXISTS mantém re-executável.

ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "linked_issue_url" TEXT;
