# Gap Analysis — Nexa vs HiperTMS (frontend)

> O que já existe no Nexa, o que falta, o que adaptar, o que reutilizar e o que recriar
> para chegar à paridade visual/UX com o HiperTMS.

## ✅ O que JÁ existe no Nexa

- **Tokens completos** espelhando o TMS: `brand` (Laranja-Ignição), `navy`, `base-*`,
  sidebar midnight, sombras (`card/elevated/glow-*`), raios (incl. `3xl`), `bg-signature`,
  easings, **status tints**, zoom 0.8, dark mode por `.dark`.
- **Biblioteca `@/shared/ui`** com a maioria dos primitivos: Button, Input, Textarea, Select,
  Label, Card(+sub), Checkbox, Switch, Separator, Table(+sub), Tabs, Pagination, StatusBadge,
  Badge, Alert, Tooltip, Popover, Modal, Sheet, EmptyState, ErrorState, LoadingState, Skeleton.
- **MetricCard** (`ConversationMetricsCard`), **ConfirmModal** (via `useConfirm`), **Toast**.
- **Shell** (sidebar retrátil + topbar) com ícones de linha e item ativo laranja.
- **Login** e **Landing** no padrão do TMS (card com glow / hero escuro).
- **Storybook** + `Overview.mdx` + story de tokens.
- **Padrões FSD** (`features/contact`) e fachada `@/shared/ui`.
- Ícones de linha próprios (`icons.tsx`) no estilo Heroicons.

## ❌ O que FALTA

| Item | Observação |
|---|---|
| **Chart** (gráficos) | TMS usa Recharts; Nexa não tem gráficos no Dashboard |
| **Breadcrumb** | `PageBreadcrumbs` no TMS; inexistente no Nexa |
| **PageHeader / PageContainer** padronizados | cada tela monta o header na mão |
| **Multi-select** e **input de moeda/data** unitários | só há `DateRangePicker` próprio |
| **Ordenação de tabela** por coluna | não padronizada |
| **Sidebar com grupos/seções** rotuladas | Nexa tem lista única |
| **Sidebar off-canvas no mobile** | Nexa só recolhe a largura |
| Variações extras de `Button` (`xs`, `icon-*`, `asChild`) | parciais |

## 🔧 O que precisa ser ADAPTADO

- **Tailwind v4 → v3:** o TMS usa `@theme`/`@custom-variant`/utilities semânticas (`bg-surface`,
  `text-fg-muted`); o Nexa traduz isso em CSS vars + `tailwind.config.js`. Manter essa tradução
  (não copiar CSS v4 cru). Avaliar futura migração para v4 (opcional, grande).
- **shadcn/Radix → componentes próprios:** comportamentos do Radix (Popover, Tabs, Dialog)
  foram reimplementados sem dependência; ao portar novos primitivos, seguir esse padrão.
- **Ícones:** continuar no set inline próprio (não trazer lucide/heroicons como dependência).
- **Emoji no produto:** o TMS **não** usa; o Nexa usa em vários lugares (sidebar, cards, toasts).
  Decisão: padronizar para ícones de linha onde fizer sentido (já feito no shell).

## ♻️ O que pode ser REUTILIZADO (direto do Nexa)

- Toda a fachada `@/shared/ui` e os tokens — já prontos e alinhados.
- O shell (`Layout.tsx`) como base para grupos de sidebar e breadcrumb.
- O `ConversationMetricsCard` como base para um `MetricCard` genérico.
- O padrão de modais (`Modal` + `useConfirm`) para os fluxos CRUD.

## 🔁 O que deve ser RECRIADO / construído

- **Componente `Chart`** (wrapper de uma lib de gráfico) — para o Dashboard e relatórios.
- **`Breadcrumb`** + **`PageHeader`/`PageContainer`** padronizados.
- **Multi-select** e inputs especializados (moeda, data) se as telas exigirem.
- **Ordenação de tabela** reaproveitável (header clicável + estado de sort).
- Agrupamento de **seções na sidebar** (labels UPPERCASE por módulo).

## Observação de produto

O HiperTMS é um **TMS (frete)**; suas telas de negócio (fiscal, frota, financeiro, cotação)
**não** são portadas para o Nexa, que é uma **plataforma de IA comercial/suporte**. A paridade
é de **design system, componentes, layout e UX** — não dos módulos de negócio.
