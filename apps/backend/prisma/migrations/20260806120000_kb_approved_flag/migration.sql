-- F11 (2026-08-06): flag de aprovação no artigo vivo de KB (não só na versão).
-- Ver auditoria docs/reviews/2026-08-06-auditoria-kb-lia.md, seção 0.
--
-- DEFAULT TRUE de propósito: os 1438 artigos já existentes (importados do
-- conector HiperTMS + criados via painel) continuam retornáveis por
-- retrieve() sem qualquer backfill manual. Só criações NOVAS com
-- autoApprove=false (hoje: só TicketIntelligenceService/"lucio") nascem com
-- approved=false e ficam invisíveis pra Lia até alguém aprovar
-- (POST /knowledge/versions/:versionId/approve, endpoint já existente).
--
-- Verificado contra o banco real antes de decidir o default: das 1438 linhas
-- de ai_knowledge_base, 751 não têm NENHUMA versão com approved=true
-- (legado de antes do autoApprove existir no import) — filtrar por
-- "tem versão aprovada" teria apagado 52% do conhecimento da Lia em
-- produção. A coluna própria com default true evita esse blast radius.

ALTER TABLE "ai_knowledge_base" ADD COLUMN IF NOT EXISTS "approved" BOOLEAN NOT NULL DEFAULT true;
