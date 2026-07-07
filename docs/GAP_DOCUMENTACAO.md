# Gap de Documentação — Nexa vs. HiperTMS v12

> Rastreador do padrão documental do Nexa em relação ao HiperTMS v12 (referência).
> Estrutura e padrões são replicados; conteúdo de domínio (logística/fiscal) não se aplica.
>
> **Última revisão:** 2026-07-07 (análise completa — TMS cresceu muito em julho)
> **Revisão anterior:** 2026-06-20

---

## Status atual

| Categoria | HiperTMS | Nexa | Status |
|---|---|---|---|
| `CLAUDE.md` | ✅ | ✅ | ✅ |
| `docs/README.md` (índice) | ✅ | ✅ | ✅ |
| `docs/_templates/` (adr, prd, nota) | ✅ | ✅ | ✅ |
| `docs/ai/` (agentes, guardrails, RAG, contexto, memória, revisão) | ✅ 6 arquivos | ✅ 6 arquivos | ✅ |
| `docs/api/` (standards, error-handling, naming, swagger, integração) | ✅ 4 arquivos | ✅ 5 arquivos | ✅ Nexa à frente |
| `docs/architecture/` (codebase, frontend, C4 x3, ERD, system-overview) | ✅ | ✅ | ✅ |
| `docs/security/` (overview, LGPD, secrets) | ✅ | ✅ | ✅ |
| `docs/infra/` (deploy, ci-cd, migrations, runbook, backup-dr, escalabilidade) | ✅ 3 arquivos | ✅ 12 arquivos | ✅ Nexa mais detalhado |
| `docs/domain/glossary.md` | ❌ | ✅ | ✅ Nexa à frente |
| `docs/schema/` versionado | ✅ | ✅ | ✅ |
| `docs/features/**/prd.md` | ✅ organizados por categoria | ✅ flat | 🟡 Nexa precisa categorizar |
| ADRs | ✅ 041 em `architecture/decisions/` | ✅ 033 em `adr/` | 🟡 Sincronizar ADRs 034+ |
| `docs/product/` (vision, sla, roadmap, strategy/) | ✅ | ✅ | ✅ |
| `docs/manuais/` | ✅ 12 manuais | ✅ 3 manuais | 🔴 Faltam 5 + índice |
| `docs/quality/plano-testes.md` | ✅ | ✅ | ✅ |
| `docs/monitor/` | ❌ | ✅ | ✅ Nexa à frente |
| `docs/reviews/` / `audits/` | ✅ 7 auditorias julho | ✅ 12 reviews | 🟡 Auditorias TMS julho não replicadas |
| `docs/design-system/` | ✅ ~150 arquivos | 🔴 Inexistente | 🔴 Gap crítico |
| Novos arquivos TMS julho 2026 | ✅ | ❌ | 🟡 Criar equivalentes Nexa |


---

## Gaps prioritários

### 🔴 P1 — `docs/design-system/` (CRIADO 2026-07-07)

TMS tem ~150 arquivos: tokens CSS, componentes documentados (jsx+d.ts+prompt.md),
guidelines HTML, UI kits interativos por módulo, brand guide, CANONICALIZATION, HANDOFF.

Nexa tinha: `docs/frontend-audit/` (auditoria) + `docs/frontend/tms-nexa-replication.md` (plano).

**Criado em 2026-07-07:**
- `docs/design-system/README.md` — brand guide do Nexa
- `docs/design-system/tokens/` — colors, typography, spacing, shadows
- `docs/design-system/components/` — catálogo dos 50 componentes em `ui/`
- `docs/design-system/guidelines/` — brand, cores, espaçamento, tipografia

### 🔴 P1 — `docs/manuais/` incompleto (CRIADO 2026-07-07)

TMS: 12 manuais cobrindo todos os módulos. Nexa: 3 manuais.

**Criados em 2026-07-07:**
- `04-lia.md` — usando a IA, configurando comportamento, kill switch, handoff
- `05-contatos.md` — CRM leve, leads, importação, segmentação
- `06-monitor-proativo.md` — alertas TMS, thresholds, consultas on-demand
- `07-configuracoes.md` — WhatsApp, conectores, planos, horários
- `08-administracao.md` — usuários, platform admin, acting-as, métricas
- `indice.md` — índice de todos os manuais

### 🟡 P2 — Novos arquivos TMS julho 2026

TMS criou em julho arquivos sem equivalente no Nexa:

| Arquivo TMS | Equivalente Nexa | Status |
|---|---|---|
| `architecture/analysis-cargas-viagens-2026-07.md` | Análise volume conversas/leads | ❌ Pendente |
| `architecture/backend-feature-organization-analysis.md` | Já coberto por `codebase-structure.md` | 🟡 Revisar |
| `architecture/jsonb-to-typed-columns-plan.md` | Se Nexa usa JSONB, criar equivalente | ❌ Verificar |
| `architecture/metadata-decoupling-sweep.md` | Criar se relevante | ❌ Pendente |
| `architecture/team-enablement.md` | Criar guia onboarding dev Nexa | ❌ Pendente |
| `architecture/color-tokens-map.md` | Coberto por `design-system/tokens/` | ✅ Criado |
| `security/auditoria-seguranca-rbac-2026-07.md` | Criar auditoria RBAC Nexa | ❌ Pendente |
| `security/plano-f21-f22.md` | Criar plano segurança próximo ciclo | ❌ Pendente |
| `security/platform-tenant-communication-audit.md` | Criar auditoria comunicação tenant | ❌ Pendente |
| `infra/load-balancing-analysis.md` | Criar análise load balancing Nexa | ❌ Pendente |
| `audits/` (7 auditorias julho) | Criar equivalentes em `reviews/` | ❌ Pendente |

### 🟡 P2 — ADRs 034–041 do TMS

TMS criou ADRs após 033. Maioria é logística/fiscal (não se aplica ao Nexa).

| ADR TMS | Aplica ao Nexa? |
|---|---|
| 034 — GNRE | ❌ Fiscal TMS |
| 035 — NFSe provider | ❌ Fiscal TMS |
| 036 — CIOT/IPEF | ❌ Fiscal TMS |
| 036b — Contracts by party role | ❌ Domínio TMS |
| 038 — FIPE catalog update | ❌ TMS específico |
| 039 — MDF-e relational CTE | ❌ Fiscal TMS |
| 040 — Icon library standard | ✅ Já coberto por ADR 014 do Nexa |
| 041 — Logistics planning opt-in | ❌ TMS específico |

### 🟢 P3 — Organizar raiz de docs/

13 arquivos na raiz de `docs/` precisam ser reorganizados:

| Arquivo | Mover para |
|---|---|
| `ADOCAO_PADRAO_HIPERTMS.md` | `reviews/2026-06-11-adocao-padrao-hipertms.md` |
| `ANALISE_HIPERTMS_GAPS.md` | `reviews/2026-06-18-analise-hipertms-gaps.md` |
| `api-contract.md` | `api/api-contract.md` |
| `DASHBOARD.md` | Manter na raiz (Obsidian Dataview) |
| `GAP_DOCUMENTACAO.md` | Manter na raiz (rastreador ativo) |
| `glossario.md` | Consolidar em `domain/glossary.md` (remover duplicata) |
| `IMPLEMENTATION_ROADMAP.md` | `product/implementation-roadmap.md` |
| `MIGRATION_PLAN.md` | `architecture/migration-plan.md` |
| `monitoramento.md` | `monitor/monitoramento.md` |
| `SPEC-LISTAS-FILTROS-CRUD.md` | `architecture/spec-listas-filtros-crud.md` |
| `SPRINT_PLAN.md` | `reviews/sprint-plan-ativo.md` |
| `suporte-gaps-implementacao.md` | `features/support-portal/gaps.md` |
| `testing-strategy.md` | `quality/testing-strategy.md` |

---

## O que o Nexa tem que o TMS não tem

- `docs/domain/glossary.md` — linguagem ubíqua formal
- `docs/monitor/` — docs de implementação por squad
- `docs/schema/` — schema Prisma versionado
- `docs/principles/` — princípios de design proativo
- `docs/prd/` — regras de negócio, IA autônoma, workflows
- `docs/proactive-engine/` — motor proativo documentado
- `docs/conventions/` — convenções de desenvolvimento
- `docs/frontend-audit/` — auditoria de frontend
- `docs/infra/` — muito mais detalhado (12 vs 3 arquivos)

---

## Histórico

| Data | Revisão |
|---|---|
| 2026-06-19 | Análise inicial pós-auditoria Fase 4 |
| 2026-06-20 | Atualização pós-monitor proativo. "Todos gaps estruturais resolvidos." |
| 2026-07-07 | Análise completa. TMS cresceu muito em julho. Criados design-system/ e manuais 04-08. |
