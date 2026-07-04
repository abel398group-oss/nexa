---
type: moc
tags: [moc, docs, index]
updated: 2026-07-02
summary: Índice completo da documentação do Nexa — todas as pastas e links.
---
# Documentação — Nexa

Plataforma de automação comercial e suporte B2B com IA (**Lia**) para SaaS.
Primeiro conector: HiperTMS.

> Princípio 1: **a IA conversa e recomenda; o backend decide e executa.**  
> Princípio 2: **o sistema é proativo** — avisa antes do problema, nunca depois. Ver [`principles/proatividade.md`](principles/proatividade.md)

## Estrutura documental

| Pasta | Conteúdo |
|---|---|
| `_templates/` | Modelos de ADR, PRD e nota |
| `product/` | Visão, roadmap, estratégia e SLA (`product/strategy/`, `product/sla.md`) |
| `overview/` | Visão de sistema, roadmap e schema (alto nível) |
| `features/` | PRDs de cada módulo do sistema |
| `prd/` | Regras de negócio, IA autônoma, workflows, modelo de dados |
| `architecture/` | Estrutura de código, frontend, diagramas C4, ERD e decisões |
| `adr/` | Architecture Decision Records (árvore canônica — 31 ADRs) |
| `ai/` | Camada de IA: agentes, guardrails, RAG, contexto, memória, revisão |
| `api/` | Padrões de API, Swagger, guia de integração para parceiros |
| `security/` | Visão de segurança, LGPD, política de secrets |
| `infra/` | Deploy, CI/CD, runbook de incidentes, backup e DR |
| `quality/` | Plano de testes, cobertura mínima, E2E |
| `manuais/` | Guias operacionais para usuários do painel |
| `schema/` | Schema Prisma, estratégia de migração e runtime |
| `reviews/` | Revisões, auditorias e postmortems datados |
| `principles/` | Princípios de design que guiam todos os módulos |
| `proactive-engine/` | Motor proativo nativo do Nexa (conversas, campanhas, tickets) |
| `monitor/` | Monitor Proativo TMS (logística, financeiro, frota) |

## Como navegar

Ordem recomendada:

1. **Visão de sistema**: `overview/system-overview.md` + `architecture/c4-context.md`
2. **Produto e features (PRDs)**: `product/` + `features/` + `prd/`
3. **Arquitetura e decisões**: `architecture/` + `adr/`
4. **Camada de IA**: `ai/` (agentes, guardrails, RAG, contexto, memória)
5. **Domínio**: `domain/glossary.md`
6. **Padrões transversais**: `api/`, `security/`, `infra/`
7. **Banco**: `schema/`

Para agentes de IA trabalhando no repositório: começar por `CLAUDE.md` (raiz).

## Módulos documentados

- [Agentes de IA](features/agents/prd.md) — Lia (vendas + suporte), roteador, supervisora
- [Campanhas](features/campaigns/prd.md) — Disparos em lote via WhatsApp
- [Contatos](features/contacts/prd.md) — CRM leve de leads
- [Inbox](features/inbox/prd.md) — Conversas WhatsApp e atendimento humano
- [Knowledge Base](features/knowledge/prd.md) — Base de conhecimento RAG da Lia
- [Conectores](features/connectors/prd.md) — Integração com produtos (HiperTMS)
- [Platform Admin](features/platform-admin/) — Admin da plataforma e atuação multi-tenant (acting-as + break-glass)

> O **design system** do frontend já existe em código (`apps/frontend/src/components/ui/`)
> e tem catálogo no Storybook — ver `architecture/frontend-architecture.md` e ADR 014.

## Decisões de Arquitetura (ADRs)

Índice em [`adr/README.md`](adr/README.md) — 31 ADRs por domínio (automação,
agentes, event bus, segurança, KB, conectores, ambiente, suporte, e-mail,
platform admin, web chat embutido, monitor frota, cotação WhatsApp, …).

## Repositório e componentes

- **Monorepo pnpm**
  - **Backend**: NestJS + Prisma + PostgreSQL 16 (pgvector) + Redis (`apps/backend`)
  - **Frontend**: React + Vite + TypeScript + Tailwind (`apps/frontend`)
  - **Packages**: `shared`, `types`, `sdk`

Pontos de partida:

- `architecture/codebase-structure.md`
- `ai/ai-agents.md` + `ai/ai-guardrails.md`
- `security/security-overview.md`
- `api/api-standards.md`

## Manuais do usuário

Guias operacionais para quem usa o painel:

- [01 — Primeiros Passos](manuais/01-primeiros-passos.md) — acesso, dashboard, conectar WhatsApp, ativar Lia
- [02 — Operação Diária](manuais/02-operacao-diaria.md) — inbox, atendimento, base de conhecimento, kill switch
- [03 — Campanhas de Disparo](manuais/03-campanhas.md) — criar, monitorar, WhatsApp e e-mail

## Segurança e Conformidade

- [Visão de Segurança](security/security-overview.md) — pilares de segurança do sistema
- [LGPD](security/lgpd.md) — dados tratados, base legal, opt-out, retenção, DPO
- [Política de Secrets](security/politica-secrets.md) — rotação de credenciais, cofre, inventário

## Infra e Operações

- [Deploy](infra/deploy.md) — deploy no DigitalOcean, checklist de produção
- [CI/CD](infra/ci-cd.md) — GitHub Actions, pipelines
- [Runbook de Incidentes](infra/runbook-incidentes.md) — backend down, WAHA, banco, rollback
- [Backup e DR](infra/backup-dr.md) — estratégia de backup, restauração, plano de recuperação
- [Escalabilidade](infra/escalabilidade-nexa.md) — gargalos, roadmap de escala, Redis adapter

## Arquitetura

- [Estrutura do Código](architecture/codebase-structure.md)
- [Arquitetura Frontend](architecture/frontend-architecture.md)
- [Diagrama C4](architecture/c4-context.md)
- [ERD — Banco de Dados](architecture/erd.md) — diagrama de entidades e relacionamentos

## Frontend — Evolução e Replicação TMS

Análise estrutural completa do frontend HiperTMS com guias de implementação no Nexa:

- [Replicação TMS → Nexa](frontend/tms-nexa-replication.md) — gaps, prioridades, código pronto para `StandardListPage`, `DataTable`, `StandardFormPage`, Tailwind 4, sonner
  - **Fase A** — PageContainer + Breadcrumbs + StandardListPage
  - **Fase B** — DataTable genérico com mobile cards automáticos
  - **Fase C** — StandardFormPage + FormSection / FormGroup / FormField
  - **Fase D** — migração em massa de todas as listagens
  - **Fase E** — Tailwind 4 (branch separado)
  - **Fase F** — sonner e CASL (quando necessário)

## API e Integrações

- [Padrões de API](api/api-standards.md)
- [Swagger / OpenAPI](api/swagger-guide.md) — como ativar e usar (⚠️ ativação pendente)
- [Guia de Integração](api/guia-integracao.md) — webhooks, handoff, parceiros

## Produto

- [Visão de Produto](product/vision.md)
- [Sumário Executivo](product/strategy/sumario-executivo.md)
- [Monetização](product/strategy/monetizacao.md) — planos, add-ons, funil, métricas
- [SLA por Plano](product/sla.md) — uptime, limites, créditos, suporte
- [Monitor Proativo TMS](product/monitor-proativo.md) — escopo do módulo de alertas automáticos

## Motor Proativo Nativo (proactive-engine)

Motor interno que detecta anomalias nas conversas, campanhas e tickets do Nexa:

- [Documentação completa](proactive-engine/README.md) — regras, cron, deduplicação, configuração
- 6 regras: `conversation.stale_open`, `lead_no_reply`, `sla_breach`, `campaign.followup_due`, `ticket.auto_close`, `conversation.digest`
- Cron a cada 15min + digest diário às 18h BRT
- Módulo: `apps/backend/src/application/proactive-engine/`

## Monitor Proativo TMS

Módulo que observa o TMS e avisa o cliente via WhatsApp/e-mail sobre pendências críticas.

- [Escopo e modelo](product/monitor-proativo.md)
- [Visão geral e ordem de execução](monitor/README.md)
- [Squad Orquestra Nexa](monitor/squad-orquestra-nexa.md) — motor, tabelas, serviços
- [Squad Orquestra TMS](monitor/squad-orquestra-tms.md) — endpoints, receptor, página nativa
- [Squad Orquestra Nexa IA](monitor/squad-orquestra-nexa-ia.md) — intents da Lia on-demand
- [ADR 028](adr/028-monitor-proativo-tms.md) — decisão arquitetural

### Em implementação — Monitor Frota (ADR-030)
- [Squad TMS — Frota](monitor/squad-tms-frota.md) — km, CNH, CRLV, ANTT
- [Squad Nexa — Frota](monitor/squad-nexa-frota.md) — intents e formatação
- [ADR 030](adr/030-monitor-frota-whatsapp.md)

## Cotação WhatsApp (em implementação — ADR-031)

Cotação de frete via Lia com dois modos: prospect (calculadora pública) e cliente (tabela de preços do tenant).

- [PRD](features/cotacao-whatsapp/prd.md)
- [Squad TMS](features/cotacao-whatsapp/squad-tms.md)
- [Squad Nexa](features/cotacao-whatsapp/squad-nexa.md)
- [ADR 031](adr/031-cotacao-whatsapp.md)

## Qualidade

- [Plano de Testes](quality/plano-testes.md) — cobertura mínima, E2E, critérios de PR

## Referência

- [Glossário](glossario.md) — definições de todos os termos do sistema
- [CHANGELOG](../CHANGELOG.md) — histórico de versões

## Auditorias e Reviews

- [2026-07-04 — Estrutura de Engenharia: TMS vs Nexa](reviews/2026-07-04-tms-vs-nexa-engineering-gaps.md) — matriz comparativa em 10 dimensões, o que adotar (Sentry, CI, testes, E2E), quando (storage, rollback, staging) e o que pular (CASL, RLS), com viabilidade e esforço
- [2026-07-03 — Auditoria de Frontend](reviews/2026-07-03-frontend-audit.md) — matriz de UI por página, gaps priorizados (P0–P2) e bugs funcionais verificados (web chat, opt-out localhost, entregabilidade Gmail)
- [2026-06-26 — Auditoria Docs vs Código](reviews/2026-06-26-auditoria-docs-vs-codigo.md) — gaps e desatualizações encontradas
- [2026-06-20 — Auditoria de Implementação](reviews/2026-06-20-auditoria-implementacao-nexa.md) — NEXA-01→08 + Monitor

## Gap documental e análise comparativa

- [`GAP_DOCUMENTACAO.md`](GAP_DOCUMENTACAO.md) — comparação com padrão HiperTMS (atualizado 2026-06-19)
- [`ANALISE_HIPERTMS_GAPS.md`](ANALISE_HIPERTMS_GAPS.md) — features do TMS adaptáveis ao Nexa (2026-06-18)
