# Documentação — Nexa

Plataforma de automação comercial e suporte B2B com IA (**Lia**) para SaaS.
Primeiro conector: HiperTMS.

> Princípio: **a IA conversa e recomenda; o backend decide e executa.**

## Estrutura documental

| Pasta | Conteúdo |
|---|---|
| `_templates/` | Modelos de ADR, PRD e nota |
| `product/` | Visão, roadmap e estratégia de produto |
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

## Decisões de Arquitetura (ADRs)

Índice em [`adr/README.md`](adr/README.md) — 22 ADRs por domínio (automação,
agentes, event bus, segurança, KB, conectores, ambiente, suporte, e-mail, …).

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

## Gap documental

Comparação do padrão documental com o HiperTMS e roadmap de docs em
[`GAP_DOCUMENTACAO.md`](GAP_DOCUMENTACAO.md).
