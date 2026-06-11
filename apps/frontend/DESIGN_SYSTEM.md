# Nexa — Design System

> Sistema visual do front-end do Nexa, **espelhando fielmente o HiperTMS**.
> Fonte original: `hipertms_v12/docs/design-system/readme.md` e
> `hipertms_v12/apps/web/src/styles/globals.css` (token source of truth).
> Tokens vivem em `src/index.css` + `tailwind.config.js`. Dark mode via `html.dark`.

## Marca

- **Primária — Laranja-Ignição `#FF5A1F`** (hover/press → `#ED4708`). O único sinal
  de marca inconfundível; usado com parcimônia para ações primárias, nav ativa,
  links e números-chave.
- **Secundária — Navy `#1E3A5F`** (`navy`): gráficos e o gradiente assinatura.
- **Tinta / ink — carvão `#16181D`** (levemente violáceo, nunca `#000`).
- **Canvas — branco-quente `#FAFAF9`** (nunca branco puro).

## Fundações

**Tipografia.** Corpo/UI = **Inter**; títulos (h1/h2) usam `system-ui`. Números
(moeda, contadores) pedem `tabular-nums`. App roda com **`zoom: 0.8`** global.

**Cores de status — pílulas de tinta suave** (fundo claro + texto escuro), nunca
blocos sólidos. Tokens: `--success-tint/-ink`, `--warning-tint/-ink`,
`--danger-tint/-ink`, `--info-tint/-ink`, `--neutral-tint/-ink` (com overrides dark).

**Superfícies & cards.** Cantos suaves, borda hairline (1px, mix — nunca preto duro),
sombra macia. Escada de raios: `md` 6px (botões/inputs), `lg` 8px (menus),
`xl` 12px (cards), `2xl` 16px (painéis), **`3xl` 30px** (card de cotação do hero),
`full` (pílulas/badges/avatars).

**Sombras / elevação.** `shadow-card` → `card-hover` → `elevated` (modais).
Glows reservados para CTA/estado: `glow-brand`, `glow-danger`, `glow-success`.

**Movimento.** Contido. Entradas: `ease-entrance` `cubic-bezier(0.22,1,0.36,1)` ~320ms;
layout/sidebar: `ease-layout` `cubic-bezier(0.4,0,0.2,1)` ~200ms. Respeita
`prefers-reduced-motion`.

**Gradiente assinatura.** 135° `#FF5A1F → #ED4708 → #1E3A5F` (ignição → brasa → navy).
Utilitário: `bg-signature`. Usado em destaques (card do hero, tier "Mais popular").

**Shell dual-tone.** Sidebar permanentemente escura ("midnight enterprise", `#16181D`
com leve calor violeta) contra o canvas claro. Item ativo: overlay branco sutil +
**dot/ícone laranja**. Sidebar 12.8rem (rail 3.6rem), topbar 3.5rem.

## Como usar

Telas e features importam **sempre pela fachada**:

```tsx
import { Button, Card, Input, Select, Table, StatusBadge, Modal, useConfirm } from '@/shared/ui';
```

Importe direto de `@/components/ui/*` apenas dentro do próprio design system.

### Componentes disponíveis (`@/shared/ui`)

- **Primitivos:** `Button`, `Input`, `Textarea`, `Select`, `Label`, `Card`
  (+ `CardHeader/Title/Description/Content/Footer`), `Checkbox`, `Switch`, `Separator`.
- **Dados/navegação:** `Table` (+ `THead/TBody/TR/TH/TD`), `Tabs`
  (+ `TabsList/Trigger/Content`), `Pagination`.
- **Feedback/status:** `StatusBadge` (+ `statusTone`), `Badge`, `Alert`, `Tooltip`,
  `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton`.
- **Overlays:** `Popover`, `Modal`, `Sheet`, `useConfirm()` (diálogo confirmar/cancelar).

Catálogo vivo: `pnpm storybook` (Design System → Visão Geral / Tokens).

## Iconografia

Stroke (outline), nunca preenchido nem multicolor. App = Heroicons 24/outline;
landing = Lucide. Ícone ativo na sidebar tinge de Laranja-Ignição. **Sem emoji**
no produto (regra do TMS — exceção: setas de tendência ▲▼ em KPIs).

## Conteúdo / voz

pt-BR sempre. Voz direta, segunda pessoa, foco em benefício. Sentence case em
títulos e botões; UPPERCASE só em eyebrows/labels de grupo. CTAs verbo-primeiro.
Moeda `R$` com formatação `pt-BR` (`R$ 4.863,64`).
