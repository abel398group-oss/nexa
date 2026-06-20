# Documentação — Nexa

Plataforma de automação comercial e suporte B2B com IA (**Lia**) para SaaS.
Primeiro conector: HiperTMS.

> Princípio: **a IA conversa e recomenda; o backend decide e executa.**

## Estrutura documental

| Pasta | Conteúdo |
|---|---|
| `_templates/` | Modelos de ADR, PRD e nota |
| `product/` | Visão, roadmap, estratégia e SLA (`product/strategy/`, `product/sla.md`) |
| `overview/` | Visão de sistema, roadmap e schema (alto nível) |
| `features/` | PRDs de cada módulo do sistema |
| `prd/` | Regras de negócio, IA autônoma, workflows, modelo de dados |
| `architecture/` | Estrutura de código, frontend, diagramas C4, ERD e decisões |
| `adr/` | Architecture Decision Records (árvore canônica — 27 ADRs) |
| `ai/` | Camada de IA: agentes, guardrails, RAG, contexto, memória, revisão |
| `api/` | Padrões de API, Swagger, guia de integração para parceiros |
| `security/` | Visão de segurança, LGPD, política de secrets |
| `infra/` | Deploy, CI/CD, runbook de incidentes, backup e DR |
| `quality/` | Plano de testes, cobertura mínima, E2E |
| `manuais/` | Guias operacionais para usuários do painel |
| `schema/` | Schema Prisma, estratégia de migração e runtime |
| `reviews/` | Revisões, auditorias e postmortems datados |

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

Índice em [`adr/README.md`](adr/README.md) — 27 ADRs por domínio (automação,
agentes, event bus, segurança, KB, conectores, ambiente, suporte, e-mail,
platform admin, web chat embutido, …).

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

## Monitor Proativo

Módulo que observa o TMS e avisa o cliente via WhatsApp/e-mail sobre pendências críticas.

- [Escopo e modelo](product/monitor-proativo.md)
- [Visão geral e ordem de execução](monitor/README.md)
- [Squad Orquestra Nexa](monitor/squad-orquestra-nexa.md) — motor, tabelas, serviços
- [Squad Orquestra TMS](monitor/squad-orquestra-tms.md) — endpoints, receptor, página nativa
- [Squad Orquestra Nexa IA](monitor/squad-orquestra-nexa-ia.md) — intents da Lia on-demand
- [ADR 028](adr/028-monitor-proativo-tms.md) — decisão arquitetural

## Qualidade

- [Plano de Testes](quality/plano-testes.md) — cobertura mínima, E2E, critérios de PR

## Referência

- [Glossário](glossario.md) — definições de todos os termos do sistema
- [CHANGELOG](../CHANGELOG.md) — histórico de versões

## Gap documental e análise comparativa

- [`GAP_DOCUMENTACAO.md`](GAP_DOCUMENTACAO.md) — comparação com padrão HiperTMS (atualizado 2026-06-19)
- [`ANALISE_HIPERTMS_GAPS.md`](ANALISE_HIPERTMS_GAPS.md) — features do TMS adaptáveis ao Nexa (2026-06-18)
