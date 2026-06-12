# Adoção do Padrão HiperTMS no Nexa

> Plano incremental para alinhar o Nexa às convenções maduras do HiperTMS v12.
> Princípio: **um passo por vez**, cada passo isolado, reversível e validável.
> Gerado em 2026-06-11 após auditoria comparativa dos dois repositórios.

---

## Contexto

O Nexa foi derivado do HiperTMS e **já herdou o backend correto**: mesma
arquitetura limpa (`application` / `presentation/http|ws` / `infra` / `shared`),
JWT em cookie HttpOnly, Throttler, Helmet, Swagger, multi-tenant via
`@CurrentTenant`, `PaginationQueryDto` + `{ items, total }`. Não há trabalho
estrutural a fazer no backend.

No **frontend**, o Nexa já tem o **design system** adotado (23 primitivos em
`components/ui/`, tokens de marca alinhados ao TMS, util `cn`, `Button`
espelhando o do TMS). O que **falta** em relação ao HiperTMS é a disciplina de
**camada de dados e estrutura de pastas**.

---

## Diagnóstico — o que falta vs. HiperTMS

| Dimensão | HiperTMS (alvo) | Nexa (hoje) | Gap |
|---|---|---|---|
| Design system (`components/ui`) | shadcn-style + Storybook | 23 primitivos + tokens | ✅ feito (falta Storybook) |
| Estrutura de pastas | **Feature-Sliced Design** (`features/<entity>/{api,hooks,types,index.ts}`) | `pages/` + `components/` plano | 🔴 ausente |
| Estado de servidor | **TanStack Query** | 41× `api.*` inline + `useState/useEffect` | 🔴 ausente |
| Formulários | **react-hook-form + Zod** | `useState` manual por campo | 🟡 ausente |
| Documentação de componentes | Storybook | — | 🟢 ausente |
| Testes | Vitest + **Playwright e2e** | ~3 specs, 0 e2e | 🔴 fraco |

---

## Roteiro incremental

Cada passo é uma entrega fechada. **Não avançar para o próximo sem validar o
anterior** (build + typecheck + revisão visual).

### Passo 1 — Estrutura FSD + feature `contact` de referência ⏳
**Sem dependência nova. Sem mudança de comportamento.**
- Criar `src/features/<entity>/` como convenção.
- Extrair as chamadas `api.*` de contatos para `features/contact/api/contact.api.ts`
  (funções puras) + `features/contact/types/contact.types.ts` + barrel `index.ts`.
- Refatorar `ContactsPage` para importar do barrel em vez de chamar `api.*` inline.
- Resultado: o padrão FSD fica estabelecido e documentado com um exemplo real.

### Passo 2 — Fundação TanStack Query + hooks de `contact`
**Dependência:** `@tanstack/react-query` (+ devtools em dev).
- `src/lib/queryClient.ts` + `QueryClientProvider` no `App.tsx`.
- Criar `features/contact/hooks/` (`useContacts`, `useCreateContact`, ...).
- Migrar `ContactsPage` para os hooks (remove `load()`/`useEffect` manual).

### Passo 3 — react-hook-form + Zod em um formulário
**Dependências:** `react-hook-form`, `zod`, `@hookform/resolvers`.
- Converter o formulário de contato (referência) para RHF + schema Zod.

### Passo 4 — Replicar para as demais features
- Aplicar passos 1–3, uma entidade por vez: `campaign`, `seller`, `knowledge`,
  `conversation`, `playbook`, `user`, `metrics`.

### Passo 5 — Storybook + Playwright e2e + convenções
- Storybook para `components/ui/` (paridade com o TMS).
- Setup `apps/e2e` (Playwright) — fecha o gap nº 1 do `GAP_ANALYSIS` (testes).
- Importar `CONVENCOES.md` + `docs/api/` do HiperTMS como base.

---

## Convenção FSD (referência rápida)

```
src/features/<entity>/
  api/<entity>.api.ts     # funções puras sobre o axios `api` — sem React
  hooks/                  # hooks TanStack Query (passo 2+)
  types/<entity>.types.ts # tipos e enums do domínio
  index.ts                # barrel público — única porta de import
```

Regra de import: consumir sempre via barrel (`@/features/contact`), **nunca**
alcançar o interior de uma feature.

---

## Status

- [x] Passo 1 — Estrutura FSD + feature `contact` ✅ (typecheck limpo)  ← **concluído 2026-06-11**
- [ ] Passo 2 — TanStack Query
- [ ] Passo 3 — react-hook-form + Zod
- [ ] Passo 4 — Replicar para demais features
- [ ] Passo 5 — Storybook + e2e + convenções
