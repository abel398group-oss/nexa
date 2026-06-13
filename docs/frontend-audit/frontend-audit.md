# Auditoria de Frontend — HiperTMS → Nexa (índice)

> Blueprint completo do frontend do **HiperTMS** para replicar a experiência visual,
> a arquitetura de interface e os padrões de UX no **Nexa** (`C:\...\GitHub\nexa`).
> Análise apenas — **nada foi alterado no HiperTMS**.

## Documentos desta auditoria

| Arquivo | Conteúdo |
|---|---|
| [`design-system.md`](./design-system.md) | Cores, tipografia, espaçamento, raios, sombras, motion, dark mode |
| [`design-tokens.json`](./design-tokens.json) | Tokens consumíveis (colors/spacing/typography/radius/shadow/motion) |
| [`component-library.md`](./component-library.md) | Catálogo de componentes (TMS vs Nexa, com status de paridade) |
| [`layout-map.md`](./layout-map.md) | Shell, sidebar/topbar, responsividade, breakpoints |
| [`ux-analysis.md`](./ux-analysis.md) | Padrões de UX (fluxos, estados, feedback) + inventário de telas |
| [`nexa-gap-analysis.md`](./nexa-gap-analysis.md) | O que já existe / falta / adaptar / reutilizar / recriar |
| [`migration-plan.md`](./migration-plan.md) | Plano ordenado para fechar as lacunas |

## Arquitetura Frontend

### Stack

| | HiperTMS (`apps/web`) | Nexa (`apps/frontend`) |
|---|---|---|
| Framework | React + Vite + TypeScript | React 18 + Vite 5 + TypeScript |
| CSS | **Tailwind v4** (`@theme`, `@custom-variant dark`) | **Tailwind v3** (`@tailwind`, `darkMode: 'class'`) |
| UI kit | **shadcn/ui** (Radix) + **FlyonUI** + `cva` + `clsx`+`tailwind-merge` | Componentes próprios (sem Radix), `cn` zero-dep |
| Ícones | Heroicons (app) + Lucide (marketing) | Set inline próprio (`icons.tsx`, estilo Heroicons) |
| Gráficos | Recharts (`chart`) | — (ainda sem gráficos) |
| Permissões | **CASL** | RBAC simples (`role` + `permissions[]`) |
| Dados/rede | (axios/serviços) | axios (`lib/api.ts`) + socket.io-client |
| Rotas | react-router-dom | react-router-dom 6 |
| Docs de UI | Storybook | Storybook (configurado) |

> **Diferença estrutural-chave:** o TMS usa Tailwind v4 + FlyonUI + shadcn; o Nexa usa
> Tailwind v3 com componentes próprios. Por isso a replicação é por **paridade visual**
> (mesmos tokens e aparência), traduzindo o código — não copiando 1:1.

### Organização de pastas

**HiperTMS** (`apps/web/src/`):
```
api/  casl/  components/  config/  constants/  contexts/  entities/
features/  hooks/  lib/  pages/  polyfills/  routes/  schemas/
services/  shared/  styles/  types/  utils/
components/  → ui/ (primitivos shadcn) + layout/ + dashboard/ + admin/ +
               auth/ + brand/ + chat/ + commercial/ + company/ + onboarding/ +
               public/ + routing/ + shared/ + subscription/ + DynamicForm/
pages/       → por módulo: account, commercial, dashboard, directory, finance,
               fiscal, fleet, hubs, inventory, logistic, onboarding,
               platform-admin, pricing  (cada um com components/ hooks/ utils/)
```

**Nexa** (`apps/frontend/src/`):
```
components/  → ui/ (biblioteca própria) + conversation/ + Layout.tsx + ...
contexts/    → Auth, Toast, Confirm, DateRange
features/    → contact/ (FSD: api + types) — padrão herdado do TMS
lib/         → api.ts, conversation-status.ts, ticket-category.ts, cn.ts
pages/       → uma por rota (Dashboard, Inbox, Support, Contacts, ...)
shared/      → ui/ (fachada/barrel que reexporta components/ui)
```

> O Nexa já adota a **fachada `@/shared/ui`** e o padrão **FSD** (`features/contact`),
> espelhando convenções do TMS. Falta amadurecer `features/*` para mais domínios.

### Convenções de nomenclatura

- Telas: `XxxPage.tsx`. Componentes: PascalCase. Primitivos shadcn no TMS em minúsculas
  (`button.tsx`, `input.tsx`); no Nexa, PascalCase (`Button.tsx`).
- Tokens: cores `brand-*`/`base-*`/`navy`, semânticas `success/warning/danger/info`.
- Dark mode: classe `.dark` no `<html>` (idêntico nos dois).

## Resultado

Com estes documentos, um dev consegue reproduzir no Nexa o **mesmo design system,
componentes, layout, experiência visual e padrões de UX** do HiperTMS, sem reconsultar
o projeto original. Os pontos que ainda faltam estão em `nexa-gap-analysis.md`, com o
passo a passo em `migration-plan.md`.
