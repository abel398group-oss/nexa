---
type: tokens
tags: [design-system, tokens, spacing, layout]
updated: 2026-07-07
---

# Tokens — Espaçamento e Layout

---

## Layout

| Token | Valor | Uso |
|---|---|---|
| `--sidebar-width` | `15.5rem` | Largura do sidebar expandido |
| `--sidebar-rail` | `4rem` | Largura do rail (collapsed) |
| `--header-height` | `3.5rem` | Altura do TopBar |
| `--app-ui-zoom` | `0.8` | Zoom global do shell |
| `--content-max-w` | `1280px` | Largura máxima do conteúdo (marketing) |

---

## Escala de radii

| Token / Classe | Valor | Uso |
|---|---|---|
| `rounded` / `rounded-md` | `6px` | Botões, inputs, badges |
| `rounded-lg` | `8px` | Menus, nav rows, dropdowns |
| `rounded-xl` | `12px` | Cards, painéis |
| `rounded-2xl` | `16px` | Modais, sheets laterais |
| `rounded-3xl` | `30px` | Cards hero (marketing) |
| `rounded-full` | `9999px` | Avatares, pills, badges circulares |

---

## Espaçamento (base 4px)

Use os múltiplos padrão do Tailwind. Não criar valores customizados.

| Uso | Classes recomendadas |
|---|---|
| Padding interno de card | `p-4` ou `p-6` |
| Gap entre itens de lista | `gap-2` ou `gap-3` |
| Margem entre seções | `mt-6` ou `mt-8` |
| Padding de botão | `px-4 py-2` (md) / `px-3 py-1.5` (sm) |
| Padding de input | `px-3 py-2` |
| Gap de form | `space-y-4` |

---

## Grid / Layout de página

```tsx
// Padrão de página com sidebar fixo
<div className="flex min-h-screen">
  <AppSidebar />                    {/* fixed left, w-16 → w-60 */}
  <div className="flex-1 flex flex-col">
    <AppTopBar />                   {/* fixed top, h-14 */}
    <main className="flex-1 overflow-auto p-6 pt-20 pl-20">
      {/* conteúdo */}
    </main>
  </div>
</div>
```

---

## Densidades

| Densidade | Quando usar |
|---|---|
| **Compacta** (`dense`) | Tabelas com muitas linhas, mobile |
| **Normal** (padrão) | Formulários, cards, listas gerais |
| **Espaçosa** | Onboarding, páginas de configuração |

Componentes que aceitam `dense`: `DataTable`, `StandardListPage`.
