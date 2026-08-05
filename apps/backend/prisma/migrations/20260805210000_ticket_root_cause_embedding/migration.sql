-- §3 (auditoria de suporte, 2026-08-05): vetor semântico do rootCause, usado
-- pelo TicketIntelligenceService para detectar recorrência mesmo quando a IA
-- descreve a mesma causa com palavras diferentes. Aditiva, nullable — não
-- afeta nenhuma linha existente. A extensão "vector" já existe (usada por
-- ai_knowledge_base.embedding desde a migração baseline).
ALTER TABLE "ai_conversations" ADD COLUMN "root_cause_embedding" vector(384);
