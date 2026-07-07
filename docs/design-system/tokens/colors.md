---
type: tokens
tags: [design-system, tokens, colors]
updated: 2026-07-07
---

# Tokens — Cores

Todas as variáveis CSS definidas em `apps/frontend/src/index.css`.

---

## Primária (Laranja-Ignição)

| Token | Valor | Uso |
|---|---|---|
| `--color-primary` | `#FF5A1F` | CTAs, ícones ativos, links, destaques |
| `--color-primary-hover` | `#ED4708` | Hover em botões primários |
| `--color-primary-light` | `#FFF3EE` | Background de badges/alerts primários |

---

## Neutros / Canvas

| Token | Valor | Uso |
|---|---|---|
| `--color-canvas` | `#FAFAF9` | Fundo principal (light) |
| `--color-canvas-dark` | `#0E0F13` | Fundo principal (dark) |
| `--color-ink` | `#16181D` | Texto principal |
| `--color-ink-muted` | `#6B7280` | Texto secundário |
| `--color-ink-subtle` | `#9CA3AF` | Placeholder, rótulos desativados |
| `--color-border` | `#E5E7EB` | Bordas de cards, inputs, divisores |

---

## Sidebar

| Token | Valor | Uso |
|---|---|---|
| `--sidebar-bg` | `#16181D` | Background do sidebar |
| `--sidebar-icon-accent` | `#FF7A47` | Ícone ativo no sidebar (laranja suavizado) |
| `--sidebar-text` | `#D1D5DB` | Texto dos itens do sidebar |
| `--sidebar-text-active` | `#FFFFFF` | Texto do item ativo |
| `--sidebar-width` | `15.5rem` | Largura expandida |

---

## Status (Tints)

Sempre usar como pares BG + texto — nunca sólido.

| Status | BG | Texto | Uso |
|---|---|---|---|
| `success` | `#F0FDF4` | `#16A34A` | Concluído, conectado, online |
| `warning` | `#FFF7ED` | `#F97316` | Pendente, atenção, prazo próximo |
| `error` | `#FEF2F2` | `#DC2626` | Falha, desconectado, erro |
| `info` | `#EFF6FF` | `#0284C7` | Informativo, em progresso |
| `neutral` | `#F9FAFB` | `#6B7280` | Rascunho, inativo |

---

## Uso correto

```tsx
// ✅ Correto — usar variáveis CSS
<span className="bg-[--color-primary] text-white">

// ✅ Correto — Tailwind com token
<div className="border border-border bg-canvas">

// ❌ Errado — hardcoded sem variável
<span style={{ backgroundColor: '#FF5A1F' }}>
```
