# Gap de Documentação — Nexa vs. HiperTMS v12

> Acompanhamento do padrão documental do Nexa em relação ao HiperTMS v12 (referência).
> A estrutura e os padrões são replicados; o conteúdo de domínio (logística/fiscal)
> não se aplica ao Nexa.
>
> **Última revisão:** 2026-06-19 (atualização pós-auditoria de Fase 4)
> **Revisão anterior:** 2026-06-11 (Aria — Architect)

---

## Status atual — o que foi feito

Todos os gaps estruturais identificados na auditoria de 2026-06-11 foram resolvidos.
O Nexa agora possui paridade documental com o HiperTMS nos eixos transversais:

| Categoria | HiperTMS | Nexa | Status |
|---|---|---|---|
| `CLAUDE.md` | ✅ | ✅ | ✅ Feito |
| `docs/README.md` (índice) | ✅ | ✅ | ✅ Feito |
| `docs/_templates/` (adr, prd, nota) | ✅ | ✅ | ✅ Feito |
| `docs/ai/` (6 docs: agentes, guardrails, RAG, contexto, memória, revisão) | ✅ | ✅ | ✅ Feito |
| `docs/api/` (standards, error-handling, naming) | ✅ | ✅ | ✅ Feito |
| `docs/architecture/` (codebase, frontend, C4 x3) | ✅ | ✅ | ✅ Feito |
| `docs/security/` (overview, secrets, refs) | ✅ | ✅ | ✅ Feito |
| `docs/infra/` (deploy, ci-cd, migrations, runbook) | ✅ | ✅ | ✅ Feito |
| `docs/domain/glossary.md` | ❌ | ✅ | Nexa à frente |
| `docs/schema/` versionado | ✅ | ✅ | ✅ Feito |
| `docs/features/**/prd.md` | ✅ | ✅ | ✅ Feito |
| ADRs (índice completo) | ✅ 33 ADRs | ✅ 27 ADRs | ✅ Feito |
| Consolidação ADRs (1 pasta canônica) | ✅ | ✅ `docs/adr/` | ✅ Feito |
| `docs/product/` | ✅ amplo | ⚠️ só `vision.md` | Parcial |
| `docs/design-system/` | ✅ completo | ❌ (só ADR 014) | Aguarda amadurecimento frontend |

---

## Gaps remanescentes (por prioridade)

Os gaps abaixo foram identificados na análise comparativa de 2026-06-18
(`docs/ANALISE_HIPERTMS_GAPS.md`). São **lacunas de conteúdo e features**, não mais
de estrutura documental.

### 🔴 Crítico — implementação faltando no produto

| Item | O que falta | Referência TMS |
|---|---|---|
| **Canal e-mail** | Backend de outbox/retry/opt-out (ADR 021 define o canal, mas não há implementação de envio transacional) | `docs/api/email-alerts-service.md` |
| **Motor proativo** | Lia é 100% reativa; não há detecção de SLA/stale/follow-up automático por tempo | ADRs 022/023/024 do TMS |
| **Analytics/Relatórios** | Zero dashboards ou relatórios documentados ou implementados | `relatorios-catalog.md` (Design Master) |

### 🟡 Importante — docs faltando

| Documento | Status | Ação |
|---|---|---|
| `docs/features/analytics/prd.md` | ❌ | Criar |
| `docs/features/proactive-engine/prd.md` | ❌ | Criar |
| `docs/manuais/` (guias para usuário final) | ❌ | Criar (mínimo: 01-primeiros-passos, 02-inbox) |
| `docs/infra/escalabilidade-nexa.md` | ❌ | Criar (baseado em `escalabilidade-hipertms.md`) |
| `docs/product/strategy/sumario-executivo.md` | ❌ | Criar |
| `docs/product/strategy/monetizacao.md` | ❌ | Criar |

### 🟢 Desejável — quando o frontend amadurecer

| Documento | Nota |
|---|---|
| `docs/design-system/` completo | Componentes, tokens e guidelines já existem em código (Storybook); docs formais aguardam estabilização |

---

## O que o Nexa tem que o TMS não tem

- `docs/domain/glossary.md` — linguagem ubíqua formal
- `docs/schema/` versionado e organizado (vs gerador `.mjs` do TMS)
- ADRs mais numerosas no contexto de IA/conectores
- `docs/reviews/` com auditoria datada do MVP e fixes documentados
- `ANALISE_HIPERTMS_GAPS.md` — análise ativa de gaps vs TMS (vivo, 2026-06-18)

---

## Histórico

| Data | Evento |
|---|---|
| 2026-06-11 | Primeira auditoria comparativa — identificou 6 gaps críticos |
| 2026-06-11 a 06-18 | Todos os gaps estruturais resolvidos (CLAUDE.md, docs/ai/, docs/security/, docs/api/, docs/architecture/, docs/_templates/, ADRs) |
| 2026-06-18 | Segunda análise (`ANALISE_HIPERTMS_GAPS.md`) — foco em features faltando no produto |
| 2026-06-19 | Revisão deste documento — gaps estruturais marcados como resolvidos |
