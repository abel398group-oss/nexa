# Documentação — Nexa

Plataforma de automação comercial e suporte B2B com IA (**Lia**) para SaaS.
Primeiro conector: HiperTMS.

> Princípio: **a IA conversa e recomenda; o backend decide e executa.**

## Estrutura documental

| Pasta | Conteúdo |
|---|---|
| `_templates/` | Modelos de ADR, PRD e nota |
| `product/` | Visão, roadmap e estratégia de produto (`product/strategy/` para sumário executivo e monetização) |
| `overview/` | Visão de sistema, roadmap e schema (alto nível) |
| `domain/` | Glossário e linguagem ubíqua |
| `features/` | PRDs de cada módulo do sistema |
| `prd/` | Regras de negócio, IA autônoma, workflows, modelo de dados |
| `architecture/` | Estrutura de código, frontend, diagramas C4 e decisões |
| `adr/` | Architecture Decision Records (árvore canônica) |
| `ai/` | Camada de IA: agentes, guardrails, RAG, contexto, memória, revisão |
| `api/` | Padrões de API, erros, nomenclatura e contrato |
| `security/` | Visão de segurança, segredos e referências |
| `infra/` | Deploy, CI/CD e migrations |
| `schema/` | Schema Prisma, estratégia de migração e runtime |
| `reviews/` | Revisões e auditorias datadas |

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

## Gap documental e análise comparativa

- [`GAP_DOCUMENTACAO.md`](GAP_DOCUMENTACAO.md) — comparação com padrão HiperTMS (atualizado 2026-06-19)
- [`ANALISE_HIPERTMS_GAPS.md`](ANALISE_HIPERTMS_GAPS.md) — features do TMS adaptáveis ao Nexa (2026-06-18)
