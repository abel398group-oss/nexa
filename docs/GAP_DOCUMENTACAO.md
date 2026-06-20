# Gap de Documentação — Nexa vs. HiperTMS v12

> Acompanhamento do padrão documental do Nexa em relação ao HiperTMS v12 (referência).
> A estrutura e os padrões são replicados; o conteúdo de domínio (logística/fiscal)
> não se aplica ao Nexa.
>
> **Última revisão:** 2026-06-20 (atualização pós-sessão monitor proativo)
> **Revisão anterior:** 2026-06-19 (pós-auditoria Fase 4)

---

## Status atual — todos os gaps estruturais resolvidos

| Categoria | HiperTMS | Nexa | Status |
|---|---|---|---|
| `CLAUDE.md` | ✅ | ✅ | ✅ Feito |
| `docs/README.md` (índice) | ✅ | ✅ | ✅ Feito |
| `docs/_templates/` (adr, prd, nota) | ✅ | ✅ | ✅ Feito |
| `docs/ai/` (agentes, guardrails, RAG, contexto, memória, revisão) | ✅ | ✅ | ✅ Feito |
| `docs/api/` (standards, error-handling, naming, swagger, integração) | ✅ | ✅ | ✅ Feito |
| `docs/architecture/` (codebase, frontend, C4 x3, ERD) | ✅ | ✅ | ✅ Feito |
| `docs/security/` (overview, LGPD, secrets) | ✅ | ✅ | ✅ Feito |
| `docs/infra/` (deploy, ci-cd, migrations, runbook, backup-dr, escalabilidade) | ✅ | ✅ | ✅ Feito |
| `docs/domain/glossary.md` | ❌ | ✅ | Nexa à frente |
| `docs/schema/` versionado | ✅ | ✅ | ✅ Feito |
| `docs/features/**/prd.md` (agents, campaigns, contacts, inbox, knowledge, connectors, analytics, proactive-engine) | ✅ | ✅ | ✅ Feito |
| ADRs (índice completo) | ✅ 33 ADRs | ✅ 28 ADRs | ✅ Feito |
| `docs/product/` (vision, sla, monitor, strategy/) | ✅ | ✅ | ✅ Feito |
| `docs/manuais/` (01, 02, 03) | ✅ | ✅ | ✅ Feito |
| `docs/quality/plano-testes.md` | ✅ | ✅ | ✅ Feito |
| `docs/monitor/` (escopo + docs por squad) | ❌ | ✅ | Nexa à frente |
| `CHANGELOG.md` | ✅ | ✅ | ✅ Feito |
| `docs/product/strategy/monetizacao.md` | ✅ | ✅ | ✅ Feito |
| `docs/design-system/` | ✅ completo | ❌ (só ADR 014) | Aguarda amadurecimento frontend |

---

## Gaps remanescentes

### 🟢 Desejável — quando o frontend amadurecer

| Documento | Nota |
|---|---|
| `docs/design-system/` completo | Componentes, tokens e guidelines já existem em código; docs formais aguardam estabilização do frontend |

---

## O que o Nexa tem que o TMS não tem

- `docs/domain/glossary.md` — linguagem ubíqua formal
- `docs/schema/` versionado e organizado
- `docs/monitor/` — módulo de monitoramento proativo com docs por squad
- `docs/reviews/` — auditoria datada do MVP e fixes documentados
- ADRs mais numerosas no contexto de IA/conectores

---

## Histórico

| Data | Evento |
|---|---|
| 2026-06-11 | Primeira auditoria comparativa — identificou 6 gaps críticos |
| 2026-06-11 a 06-18 | Todos os gaps estruturais resolvidos |
| 2026-06-18 | Segunda análise — foco em features faltando no produto |
| 2026-06-19 | Revisão — gaps estruturais marcados como resolvidos |
| 2026-06-20 | Monitor Proativo documentado; monetizacao.md criado; todos os gaps 🟡 resolvidos |
