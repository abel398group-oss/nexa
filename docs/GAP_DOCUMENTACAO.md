# Gap de Documentação — Nexa vs. HiperTMS v12

> Comparação do **padrão documental** do HiperTMS v12 (referência madura) com o
> estado atual do Nexa. O Nexa é outro produto (plataforma de IA comercial e
> suporte), portanto **replica-se a estrutura e os padrões, não o conteúdo de
> domínio** (logística/fiscal não se aplicam).
>
> Data: 2026-06-11 · Autor: Aria (Architect)

---

## 1. Resumo executivo

O HiperTMS mantém uma árvore `docs/` rica e padronizada: índice de navegação,
templates versionados, ADRs temáticas com convenção rígida, PRDs por feature,
padrões transversais (API, segurança, infra), uma seção dedicada a **IA**
(guardrails, RAG, memória, context engineering) e um **design system** completo.

O Nexa já tem boa base (ADRs numerosas, glossário de domínio, schema versionado,
roadmap/sprint plan), mas faltam camadas transversais importantes — e, ironicamente
para um produto de IA, **não tem a seção `docs/ai/`** que o TMS tem.

| Categoria | HiperTMS | Nexa | Situação |
|---|---|---|---|
| Índice `docs/README.md` | ✅ rico | ✅ existe | OK |
| `CLAUDE.md` (guia p/ agentes) | ✅ | ❌ | **Falta** |
| `docs/_templates/` (adr, prd, nota) | ✅ | ❌ (só inline no adr/README) | **Falta** |
| `docs/product/` (visão, estratégia, roadmap) | ✅ amplo | ⚠️ só `vision.md` | **Parcial** |
| `docs/architecture/` (system-overview, codebase, frontend, C4) | ✅ | ⚠️ só `overview/system-overview.md` | **Parcial** |
| ADRs | ✅ 30 (convenção forte) | ✅ 22+2 (convenção simples) | OK (Nexa forte) |
| `docs/ai/` (guardrails, RAG, memória, context-eng) | ✅ 6 docs | ❌ | **Falta (crítico)** |
| `docs/api/` (standards, error-handling, naming) | ✅ | ⚠️ só `api-contract.md` | **Parcial** |
| `docs/domain/glossary.md` | ❌ | ✅ | Nexa à frente |
| `docs/design-system/` | ✅ completo | ❌ (só ADR 014) | **Falta** |
| `docs/security/` (overview, secrets, audit) | ✅ | ❌ | **Falta** |
| `docs/infra/` (ci-cd, prisma-migrations) | ✅ | ⚠️ só `deploy.md` | **Parcial** |
| `docs/features/**/prd.md` | ✅ | ✅ | OK |
| Schema versionado | gerador `.mjs` | ✅ `docs/schema/` (melhor) | Nexa à frente |
| `docs/reviews/` (revisões datadas) | ✅ | ⚠️ solto na raiz | **Parcial** |

---

## 2. O que o Nexa JÁ TEM (e está bom)

- **`docs/README.md`** — índice de navegação por pasta.
- **ADRs** — `docs/adr/` com 22 ADRs (001–022) cobrindo automação, agentes,
  event bus, segurança, KB, billing, suporte, etc. Mais 2 em
  `docs/architecture/decisions/`. **Pontos de atenção:** existem duas pastas de
  ADR (`adr/` e `architecture/decisions/`) — duplicação a consolidar; o
  `adr/README.md` lista só 2 dos 22 no índice.
- **`docs/domain/glossary.md`** — linguagem ubíqua (o HiperTMS nem tem).
- **`docs/schema/`** — `schema.prisma` + `migrations.md` + `runtime.md` +
  `README.md`. Mais organizado que o gerador do TMS.
- **`docs/features/**/prd.md`** — PRDs de agents, campaigns, connectors,
  contacts, inbox, knowledge.
- **`docs/prd/`** — regras de negócio, modelo de dados de IA, IA autônoma,
  workflows.
- **Planejamento** — `BACKLOG.md`, `PROGRESS.md`, `SPRINT_PLAN.md`,
  `MIGRATION_PLAN.md`, `IMPLEMENTATION_ROADMAP.md`, `GAP_ANALYSIS.md` (coisas
  que o TMS não centraliza).
- **`docs/testing-strategy.md`** e **`docs/api-contract.md`**.

---

## 3. O que FALTA no Nexa (gaps acionáveis)

### 3.1 — Crítico

**`CLAUDE.md` na raiz** — guia operacional para agentes de IA (este projeto é
orquestrado por agentes!). O do TMS define: idioma, stack, working agreement
(o que o agente pode/não pode rodar — migrations, push), tabela de comandos,
arquitetura backend/frontend resumida, mapa de documentação e convenções.
→ Sem ele, qualquer agente trabalha às cegas no repo.

**`docs/ai/`** — a seção mais importante para um produto de IA, e está ausente:
- `ai-guardrails.md` — limites do que a Lia pode decidir/executar (o princípio
  "IA conversa, backend decide" do README precisa virar doc formal).
- `rag-architecture.md` — como a KB/pgvector alimenta a Lia.
- `context-engineering.md` — montagem de contexto/prompt por conversa.
- `memory-strategy.md` — memória de curto/longo prazo por contato/tenant.
- `ai-agents.md` — perfis de agentes (vendas, suporte, roteador, supervisora).
- `ai-review-process.md` — como revisar saídas de IA.
(Hoje há fragmentos em `docs/prd/ia-autonoma.md` e ADR 012 prompt-injection,
mas falta a camada transversal de arquitetura de IA.)

### 3.2 — Importante

**`docs/_templates/`** — `adr.md`, `feature-prd.md`, `nota.md` versionados, para
padronizar criação de novos docs (hoje o template vive solto no `adr/README.md`).

**`docs/security/`** — `security-overview.md` (pilares: tenant isolation, least
privilege, backend-autoridade, segredos fora do repo), `secrets-management.md`,
e auditoria de comunicação entre produtos (relevante pro conector HiperTMS).

**`docs/api/`** (expandir) — hoje só `api-contract.md`. Faltam:
`api-standards.md` (paginação, multi-tenancy, versionamento), `error-handling.md`
(forma canônica de erro), `naming-conventions.md`.

**`docs/architecture/`** (expandir) — faltam `codebase-structure.md`,
`frontend-architecture.md`, e diagramas **C4** (`c4-context`, `c4-container`,
`c4-component`). Hoje só existe `overview/system-overview.md`.

### 3.3 — Desejável

**`docs/design-system/`** — o ADR 014 decide o DS, mas falta a implementação
documental: `tokens/`, `components/`, `guidelines/`. (Espera o frontend, Sprint 7.)

**`docs/infra/`** (expandir) — `ci-cd.md` e `prisma-migrations.md` além do
`deploy.md` atual.

**Consolidação de ADRs** — unificar `docs/adr/` e `docs/architecture/decisions/`
numa única árvore e completar o índice do `adr/README.md` (lista só 2 de 22).

**`docs/reviews/`** — mover `RELATORIO_TECNICO.md` / `AUDITORIA_TECNICA_N8N.md`
para uma pasta de revisões datadas (padrão `YYYY-MM-DD-*.md`).

---

## 4. Estrutura-alvo proposta para `docs/` do Nexa

```txt
/docs
  README.md                  ✅ (atualizar índice)
  /_templates                ❌ criar (adr, feature-prd, nota)
  /product                   ⚠️ expandir (vision ✅; +roadmap, +strategy)
  /architecture
    system-overview.md       ✅ (mover de overview/)
    codebase-structure.md    ❌
    frontend-architecture.md ❌
    c4-context|container|component.md ❌
    /decisions               ⚠️ consolidar com /adr
  /adr                       ✅ (índice incompleto)
  /domain                    ✅
  /ai                        ❌ criar (guardrails, rag, context, memory, agents, review)
  /api                       ⚠️ expandir (standards, error-handling, naming)
  /security                  ❌ criar (overview, secrets, audit)
  /infra                     ⚠️ expandir (deploy ✅; +ci-cd, +prisma-migrations)
  /design-system             ❌ (aguarda frontend / Sprint 7)
  /features                  ✅
  /schema                    ✅
  /reviews                   ❌ (consolidar relatórios soltos)
```

(Raiz: adicionar **`CLAUDE.md`**.)

---

## 5. Próximo passo

Definir com o time quais blocos implementar agora. Sugestão de ordem por impacto:
1. `CLAUDE.md` + `docs/_templates/`
2. `docs/ai/` (crítico p/ produto de IA)
3. `docs/security/` + expandir `docs/api/`
4. expandir `docs/architecture/` (C4, codebase, frontend) + `docs/infra/`
5. consolidar ADRs e reviews
6. `docs/design-system/` (quando o frontend amadurecer)
