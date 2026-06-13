# Mapa de Layout — HiperTMS → Nexa

> Estrutura de layout, shell, responsividade e breakpoints do HiperTMS e o estado no Nexa.

## 1. Estrutura geral (app autenticado)

```
┌─────────────────────────────────────────────────────────┐
│ TOPBAR (3.5rem) — título/breadcrumb · busca · ações · conta│
├──────────┬──────────────────────────────────────────────┤
│ SIDEBAR  │  ÁREA DE CONTEÚDO                              │
│ midnight │  (PageContainer → PageHeader → conteúdo)       │
│ rail     │                                                │
│ 3.6rem ↔ │  scroll independente                           │
│ 12.8rem  │                                                │
└──────────┴──────────────────────────────────────────────┘
```

| Região | HiperTMS | Nexa |
|---|---|---|
| Sidebar | `layout/AppSidebar.tsx` — escura fixa, rail 3.6rem expande p/ 12.8rem; grupos com labels UPPERCASE; item ativo = overlay branco + ícone/dot laranja | `components/Layout.tsx` — `aside` retrátil 4rem ↔ 15rem; item ativo = overlay branco + barra/ícone laranja ✅ |
| Topbar | `layout/AppTopBar.tsx` (3.5rem) + `NavbarAccountMenu` | topbar no `Layout.tsx` (h-14) ✅ |
| Conteúdo | `PageContainer` + `PageHeader` + `PageBreadcrumbs` | `<Outlet/>` com header por tela ⚠️ (sem PageContainer/Breadcrumb) |
| Rodapé | rodapé só no marketing (`PublicLayout`) | rodapé na Landing ✅ |

## 2. Shell — detalhes

- **Sidebar dual-tone:** permanentemente escura (`#16181D`) contra o canvas claro. Ícones
  Heroicons 20px; ícone ativo tingido de Laranja-Ignição; transição `width 0.25s ease-layout`.
- **Topbar:** fixa, 3.5rem, com busca (Ctrl+K no Nexa), ações contextuais e menu de conta.
- **Zoom global:** `html { zoom: 0.8 }` aumenta a densidade — tudo dimensionado em `rem`.
- **Layout público** (`PublicLayout`): header de marketing + conteúdo `max-w-7xl` + rodapé.

## 3. Responsividade

| Dispositivo | Comportamento |
|---|---|
| **Desktop** (≥1024 / `lg`) | Sidebar visível, grids multi-coluna (`md:grid-cols-4`, `lg:grid-cols-2`) |
| **Tablet** (768–1023 / `md`) | Grids reduzem colunas; sidebar pode recolher |
| **Mobile** (<768) | Sidebar vira off-canvas/oculta (`hidden lg:flex`); layout 1 coluna; login/landing trocam o split por coluna única |

Padrões observados: `hidden lg:flex` (mostrar só em desktop), `grid-cols-2 md:grid-cols-4`,
`sm:flex-row` (empilha no mobile, lado a lado no desktop), `lg:text-left` (centraliza no mobile).

## 4. Breakpoints

Tailwind padrão (não há customização de breakpoints):

| Nome | Min-width |
|---|---|
| `sm` | 640px |
| `md` | 768px |
| `lg` | 1024px |
| `xl` | 1280px |
| `2xl` | 1536px |

Conteúdo de marketing limitado a `max-w-7xl` (1280px). **Observação:** com `zoom: 0.8`, os
breakpoints "efetivos" deslocam um pouco — mas o uso é o Tailwind padrão.

## 5. Grid e espaçamento de página

- Cards de métrica: `grid grid-cols-2 gap-4 md:grid-cols-4` (no Nexa, idêntico).
- Padding de página: `p-6`/`p-8`; header de página com borda inferior `border-base-200`.
- Seções com `SectionTitle` (eyebrow UPPERCASE `tracking-widest text-base-content/40`).

## 6. O que falta no Nexa (layout)

- **`PageContainer` / `PageHeader`** padronizados (hoje cada tela monta o próprio header).
- **`Breadcrumb`** (`PageBreadcrumbs` no TMS) — inexistente no Nexa.
- **Sidebar com grupos/seções** rotuladas (o TMS agrupa por módulo); o Nexa tem lista única.
- Comportamento **off-canvas no mobile** da sidebar (hoje o Nexa só recolhe a largura).
