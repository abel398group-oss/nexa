---
type: moc
tags: [moc, home, index]
updated: 2026-07-02
summary: Ponto de entrada do vault Nexa. Links para todos os MOCs e docs principais.
---
# Nexa — Home

> Plataforma de automação comercial e suporte B2B com IA (**Lia**).
> Stack: NestJS · PostgreSQL 16 + pgvector · Redis · React · Vite · WAHA
> Primeiro conector: HiperTMS.

## 🗺️ Status rápido

- [[CHANGELOG]] — o que está em produção agora
- [[docs/DASHBOARD]] — dashboard de status e ADRs
- [[docs/IMPLEMENTATION_ROADMAP]] — fases e próximos passos

## 📚 Documentação

- [[docs/README]] — índice completo de todos os docs
- [[docs/adr/README]] — 31 ADRs (decisões de arquitetura)
- [[docs/principles/proatividade]] — princípio de design proativo
- [[docs/proactive-engine/README]] — motor proativo nativo (conversas/campanhas)

## 🚀 Em implementação

- [[docs/monitor/README]] — Monitor Proativo TMS (✅ em produção)
- [[docs/monitor/squad-tms-frota]] — Monitor Frota km/CNH/CRLV (⏳ ADR-030)
- [[docs/features/cotacao-whatsapp/prd]] — Cotação de frete via WhatsApp (⏳ ADR-031)

## 🔧 Engenharia

- [[docs/architecture/codebase-structure]] — estrutura do código (apps/backend + apps/frontend)
- [[docs/schema/schema-overview]] — banco de dados, migrations, pgvector
- [[docs/infra/deploy]] — deploy no DigitalOcean, CI/CD
- [[docs/infra/runbook-incidentes]] — runbook de incidentes e rollback

## 🤖 Camada de IA

- [[docs/ai/ai-agents]] — Lia e os 9 agentes (Router, SDR, Sales, Support, Supervisor…)
- [[docs/ai/ai-guardrails]] — guardrails, kill switch, supervisora
- [[docs/ai/rag-kb]] — RAG + pgvector + multilingual-e5-small

## 🔒 Segurança

- [[docs/security/security-overview]] — pilares de segurança
- [[docs/security/lgpd]] — LGPD, opt-out, retenção
- [[docs/security/politica-secrets]] — rotação de credenciais

## 📋 Auditorias e reviews

- [[docs/reviews/2026-06-26-auditoria-docs-vs-codigo]] — gaps e desatualizações (última)
- [[docs/reviews/2026-06-20-auditoria-implementacao-nexa]] — NEXA-01→08 confirmados
