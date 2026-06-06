# Documentação — Hipervias Leads

> Documentação spec-driven do sistema de automação comercial via WhatsApp.
> Referência de construção: **HiperTMS v12** (mesma stack e padrões).

## Como navegar

### Visão geral (`overview/`)
- [`system-overview.md`](overview/system-overview.md) — visão geral do sistema
- [`database-schema.md`](overview/database-schema.md) — modelo de dados completo

### Decisões de arquitetura (`adr/`)
- [`001-arquitetura-automacao.md`](adr/001-arquitetura-automacao.md) — n8n + WAHA + Claude
- [`002-frontend-stack.md`](adr/002-frontend-stack.md) — stack e padrões do front (ref. TMS)
- [`003-arquitetura-agentes.md`](adr/003-arquitetura-agentes.md) — agentes (Flowise/n8n/backend)
- [`004-event-bus.md`](adr/004-event-bus.md) — arquitetura orientada a eventos
- [`005-seguranca-permissoes.md`](adr/005-seguranca-permissoes.md) — RBAC, LGPD, retenção
- [`006-knowledge-base.md`](adr/006-knowledge-base.md) — KB versionada + RAG
- [`007-event-catalog.md`](adr/007-event-catalog.md) — contrato padrão dos eventos
- [`008-integracao-billing-tms.md`](adr/008-integracao-billing-tms.md) — usar billing do TMS (não reinventar pagamento)
- [`009-leads-como-plataforma.md`](adr/009-leads-como-plataforma.md) — leads é plataforma própria (TMS = 1º conector)
- [`010-connector-architecture.md`](adr/010-connector-architecture.md) — arquitetura de conectores multi-produto
- [`011-source-of-truth.md`](adr/011-source-of-truth.md) — dono de cada informação (anti-divergência)
- [`012-security-prompt-injection.md`](adr/012-security-prompt-injection.md) — defesa IA + Action Policy + Kill Switch
- [`013-environment-strategy.md`](adr/013-environment-strategy.md) — ambientes dev/staging/prod

### Auditoria
- [`ANALISE_CONSOLIDADA.md`](ANALISE_CONSOLIDADA.md) — visão geral de TUDO + caça a lacunas (começar por aqui)
- [`AUDITORIA_TECNICA_N8N.md`](AUDITORIA_TECNICA_N8N.md) — estado REAL do MVP n8n (cirúrgico)

### Implementação
- [`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md) — fases de implementação (visão geral)
- [`SPRINT_PLAN.md`](SPRINT_PLAN.md) — sprint detalhado (passo a passo por sprint)
- [`MIGRATION_PLAN.md`](MIGRATION_PLAN.md) — MVP n8n → plataforma (anti dual-write)
- [`api-contract.md`](api-contract.md) — contrato de API inicial (vira openapi.yaml)
- [`testing-strategy.md`](testing-strategy.md) — pirâmide de testes + cenários de IA

### Schema (`schema/`)
- [`schema.prisma`](schema/schema.prisma) — modelo Prisma (artefato de design, validado c/ TMS)
- [`schema/README.md`](schema/README.md) — convenções, fases, integração TMS

### Especificações de features (`prd/`)
- [`workflows.md`](prd/workflows.md) — os 4 workflows detalhados
- [`business-rules.md`](prd/business-rules.md) — regras de negócio consolidadas
- [`ia-autonoma.md`](prd/ia-autonoma.md) — IA vende/fecha/onboarding/suporte sem humano + governança + arquitetura de agentes
- [`data-model-ia.md`](prd/data-model-ia.md) — modelo de dados da IA (fundação para autonomia)

## Filosofia: Spec-Driven

Escrevemos a **especificação antes** de construir.
- Para o que **já existe** (n8n): spec retroativa (documenta o funcionando)
- Para o que **falta** (frontend, suporte): spec primeiro, depois código

Fluxo: **spec → validação → construção → teste contra critérios de aceite**

## Status do projeto

| Camada | Status |
|---|---|
| Inbound (IA) | ✅ Produção |
| Sender (campanhas) | ✅ Funcional |
| Follow-up | ✅ Funcional (agendamento pendente) |
| Supervisor IA | ✅ Funcional (agendamento pendente) |
| Number pool | ✅ Funcional |
| Segurança (produção) | ⏳ Pendente |
| Frontend | 📋 A construir |
| Suporte TMS | 📋 A construir |
