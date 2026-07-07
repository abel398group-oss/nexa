---
type: design-system
tags: [design-system, components, catalog]
updated: 2026-07-07
summary: Catálogo dos componentes UI do Nexa — status, localização e uso.
---

# Catálogo de Componentes

Todos os componentes ficam em `apps/frontend/src/components/ui/`.
Stories em `*.stories.tsx`. Visão geral em `Overview.mdx`.

---

## Primitivos de formulário

| Componente | Arquivo | Status | Notas |
|---|---|---|---|
| `Button` | `Button.tsx` | ✅ Produção | Variants: default, outline, ghost, destructive |
| `Input` | `Input.tsx` | ✅ Produção | Com label, helper text, error state |
| `Select` | `Select.tsx` | ✅ Produção | Baseado em Radix UI |
| `SelectField` | `SelectField.tsx` | ✅ Produção | Select + Label + Error agrupados |
| `Checkbox` | `Checkbox.tsx` | ✅ Produção | Com indeterminate state |
| `Switch` | `Switch.tsx` | ✅ Produção | Toggle on/off |
| `Textarea` | `Textarea.tsx` | ✅ Produção | Auto-resize |
| `Label` | `Label.tsx` | ✅ Produção | Para forms |
| `DateRangePicker` | `DateRangePicker.tsx` | ✅ Produção | Período de datas |
| `Calendar` | `Calendar.tsx` | ✅ Produção | Picker de data simples |
| `FilterSelect` | `FilterSelect.tsx` | ✅ Produção | Select para filtros de lista |

---

## Feedback e estado

| Componente | Arquivo | Status | Notas |
|---|---|---|---|
| `Alert` | `Alert.tsx` | ✅ Produção | Variants: info, success, warning, error |
| `Badge` | `Badge.tsx` | ✅ Produção | Pill colorida |
| `StatusBadge` | `StatusBadge.tsx` | ✅ Produção | Badge com dot de status |
| `LoadingState` | `LoadingState.tsx` | ✅ Produção | Spinner + texto |
| `ErrorState` | `ErrorState.tsx` | ✅ Produção | Erro com retry |
| `EmptyState` | `EmptyState.tsx` | ✅ Produção | Vazio com CTA |
| `Skeleton` | `Skeleton.tsx` | ✅ Produção | Loading placeholder |
| `Tooltip` | `Tooltip.tsx` | ✅ Produção | Hover tooltip |

---

## Layout e navegação

| Componente | Arquivo | Status | Notas |
|---|---|---|---|
| `Tabs` | `Tabs.tsx` | ✅ Produção | Com badge counter |
| `Pagination` | `Pagination.tsx` | ✅ Produção | Paginação de tabelas/listas |
| `Breadcrumb` | `Breadcrumb.tsx` | ✅ Produção | Migalhas de navegação |
| `PageHeader` | `PageHeader.tsx` | ✅ Produção | Cabeçalho padronizado de página |
| `Separator` | `Separator.tsx` | ✅ Produção | Divisor horizontal/vertical |

---

## Overlays e modais

| Componente | Arquivo | Status | Notas |
|---|---|---|---|
| `Modal` | `Modal.tsx` | ✅ Produção | Dialog genérico com Radix |
| `Sheet` | `Sheet.tsx` | ✅ Produção | Drawer lateral (right/left) |
| `DropdownMenu` | `DropdownMenu.tsx` | ✅ Produção | Menu contextual |
| `Popover` | `Popover.tsx` | ✅ Produção | Floating panel |
| `CommandPalette` | `CommandPalette.tsx` | ✅ Produção | Ctrl+K global search |

---

## Dados

| Componente | Arquivo | Status | Notas |
|---|---|---|---|
| `Table` | `Table.tsx` | ✅ Produção | Tabela HTML base (primitivo) |
| `Avatar` | `Avatar.tsx` | ✅ Produção | Avatar com fallback de iniciais |
| `Chart` | `Chart.tsx` | ✅ Produção | Wrapper recharts |
| `KpiCard` | `KpiCard.tsx` | ✅ Produção | Card de métrica com delta |

---

## Utilitários

| Componente | Arquivo | Status | Notas |
|---|---|---|---|
| `icons` | `icons.tsx` | ✅ Produção | Re-exports do Lucide usados no app |
| `NotificationBell` | `NotificationBell.tsx` | ✅ Produção | Sino com badge de count |
| `IconButton` | `IconButton.tsx` | ✅ Produção | Button apenas com ícone |
| `Card` | `Card.tsx` | ✅ Produção | Card base com header/content/footer |

---

## Status dos tokens

| Item | Status |
|---|---|
| `tokens.stories.tsx` | ✅ Mostra todos os tokens visuais |
| `Overview.mdx` | ✅ Visão geral em Storybook |

---

## Como criar um novo componente

1. Criar em `apps/frontend/src/components/ui/NomeComponente.tsx`
2. Criar story em `NomeComponente.stories.tsx`
3. Exportar em `apps/frontend/src/components/ui/index.ts` (se existir barrel)
4. Adicionar linha neste catálogo com status `🚧 Em desenvolvimento`
5. Quando pronto, atualizar para `✅ Produção`
