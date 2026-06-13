# Biblioteca de Componentes — HiperTMS → Nexa

> Catálogo dos componentes reutilizáveis do HiperTMS (`apps/web/src/components/ui/`,
> ~26 primitivos shadcn + componentes de app, documentados em Storybook) e o
> equivalente já existente no Nexa (`apps/frontend/src/components/ui/`, exposto por
> `@/shared/ui`). Coluna **Nexa**: ✅ existe · ⚠️ parcial · ❌ falta.

## Convenções

- **TMS:** primitivos shadcn (Radix + `class-variance-authority` + `cn` de `clsx`+`tailwind-merge`),
  estilizados com tokens semânticos (FlyonUI). Importação via fachada `@/shared/ui`.
- **Nexa:** componentes próprios em React (Tailwind v3, sem Radix), `cn` zero-dependência,
  fachada `@/shared/ui`. Visual idêntico via os mesmos tokens.

## Botões (`Button`)

| Aspecto | HiperTMS | Nexa |
|---|---|---|
| Variantes | `default/primary`, `secondary`, `destructive/danger`, `error`, `outline`, `ghost`, `link`, `success`, `warning`, `info` | `primary`, `outline`, `ghost`, `destructive`, `secondary`, `success`, `link` ✅ |
| Tamanhos | `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs/sm/lg` | `sm`, `md`, `lg`, `icon` ⚠️ (faltam `xs` e variações de icon) |
| Extras | `asChild` (Slot), `loading` (spinner) | `loading` ✅ · `asChild` ❌ |
| Base | h-9, rounded-md, ring 3px no focus, `[&_svg]:size-4` | igual ✅ |

## Inputs

| Tipo | HiperTMS | Nexa |
|---|---|---|
| Text / Number / Email / Password | `input` (shadcn) | `Input` ✅ |
| Textarea | `textarea` | `Textarea` ✅ |
| Select | `select` (nativo estilizado) | `Select` ✅ |
| Multi-select | via combinações (DynamicForm) | ❌ (não há multi-select dedicado) |
| Search | input + ícone (composição) | ⚠️ composto manualmente (CommandPalette p/ busca global) |
| Currency / Date | máscaras + `calendar` (date picker) | ⚠️ `DateRangePicker` próprio; falta input de moeda/data unitário |
| Label | `label` | `Label` ✅ |
| Checkbox / Switch | `checkbox`, `switch` | `Checkbox`, `Switch` ✅ |

## Cards

| Tipo | HiperTMS | Nexa |
|---|---|---|
| Card base | `card` (+ Header/Title/Description/Content/Footer) | `Card` (+ subcomponentes) ✅ |
| MetricCard (KPI) | `dashboard/MetricCard` — ícone à esquerda, label discreto (`text-fg-muted`), valor 24px, delta ▲▼ | `ConversationMetricsCard` ✅ (mesmo padrão; ícone + valor + hint) |
| Chart card | `chart` (Recharts wrapper) | ❌ (Dashboard usa chips/cards, sem gráfico) |

## Modais / overlays

| Tipo | HiperTMS | Nexa |
|---|---|---|
| Dialog / Modal shell | `FlyonModalShell`, `sheet` (Radix Dialog) | `Modal` (shell próprio) ✅ · `Sheet` ✅ |
| Confirmação | `ConfirmModal` | `useConfirm()` (ConfirmContext) ✅ |
| Formulário em modal | composição Dialog + form | ✅ (Modal + form nas telas) |
| Alerta | `alert` | `Alert` ✅ |
| Tooltip / Popover | `Tooltip`, `popover` (Radix) | `Tooltip`, `Popover` (próprios) ✅ |
| Toast | (contexto/lib próprio) | `ToastContext` ✅ |

## Tabelas

| Aspecto | HiperTMS | Nexa |
|---|---|---|
| Tabela base | `table` (+ `listTableTokens`) | `Table` (+ THead/TBody/TR/TH/TD) ✅ |
| Paginação | `Pagination` | `Pagination` ✅ |
| Filtros | composição por tela (PeriodFilter, SellerSelector) | ✅ por tela (ex.: filtro de tag em Contatos) |
| Ordenação | headers clicáveis (por tela) | ❌ (sem ordenação por coluna padronizada) |
| Seleção múltipla | checkbox por linha (por tela) | ✅ (Contatos: seleção em massa + barra de ações) |

## Navegação

| Item | HiperTMS | Nexa |
|---|---|---|
| Sidebar | `layout/AppSidebar` (shadcn Sidebar; rail 3.6rem ↔ 12.8rem) | `components/Layout.tsx` (aside retrátil 4rem ↔ 15rem) ✅ |
| Header / topbar | `layout/AppTopBar` (3.5rem) + `NavbarAccountMenu` | topbar no `Layout.tsx` ✅ |
| Breadcrumb | `PageBreadcrumbs` | ❌ (não há breadcrumb) |
| Tabs | `Tabs` | `Tabs` ✅ |
| Header de página | `PageHeader` + `PageContainer` | ⚠️ cabeçalho por tela (sem componente único) |

## Feedback / estados

| Estado | HiperTMS | Nexa |
|---|---|---|
| Vazio | `EmptyState` | `EmptyState` ✅ |
| Erro | `ErrorState` | `ErrorState` ✅ |
| Loading | `LoadingState` | `LoadingState` ✅ |
| Skeleton | `Skeleton` | `Skeleton` (+ `SkeletonList`) ✅ |
| Badge / StatusBadge | `badge`, `StatusBadge` (tones semânticos) | `Badge`, `StatusBadge` ✅ |
| Separator | `separator` | `Separator` ✅ |

## Ícones

- **TMS:** Heroicons 24/outline (app shell) + Lucide (marketing). Stroke 1.5–2px, 20px na nav,
  ícone ativo tingido de Laranja-Ignição.
- **Nexa:** set inline próprio (`components/ui/icons.tsx`, estilo Heroicons-outline) — não usa lucide.

## Resumo de paridade

**Já no Nexa (✅):** Button, Input, Textarea, Select, Label, Card(+sub), Checkbox, Switch,
Separator, Table(+sub), Tabs, Pagination, StatusBadge, Badge, Alert, Tooltip, Popover, Modal,
Sheet, EmptyState, ErrorState, LoadingState, Skeleton, MetricCard, ConfirmModal (via hook),
Toast, ícones de linha.

**Faltam / parciais (⚠️/❌):** Multi-select, input de moeda/data unitário, **Chart** (Recharts),
ordenação de tabela por coluna, **Breadcrumb**, `PageHeader`/`PageContainer` padronizados,
variações extras de Button (`xs`, icon-*), `asChild`.
