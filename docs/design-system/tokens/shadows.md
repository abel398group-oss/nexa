---
type: tokens
tags: [design-system, tokens, shadows, elevation]
updated: 2026-07-07
---

# Tokens — Sombras e Elevação

Sistema de elevação deliberadamente suave — sem sombras dramáticas.

---

## Escala de elevação

| Token | Uso | Tailwind equiv. |
|---|---|---|
| `shadow-soft` | Elemento base, quase sem sombra | `shadow-sm` |
| `shadow-card` | Cards padrão em repouso | `shadow` |
| `shadow-card-hover` | Cards ao hover (lift) | `shadow-md` |
| `shadow-elevated` | Modais, popovers, dropdowns | `shadow-lg` |
| `shadow-glow-primary` | CTA principal, destaque máximo | — (custom) |
| `shadow-inner-soft` | Interior de inputs (pressão) | `shadow-inner` |

---

## Valores CSS

```css
/* Definidos em apps/frontend/src/index.css */
--shadow-soft: 0 1px 2px 0 rgb(0 0 0 / 0.04);
--shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.05);
--shadow-card-hover: 0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.05);
--shadow-elevated: 0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.05);
--shadow-glow-primary: 0 0 0 3px rgb(255 90 31 / 0.2), 0 4px 12px rgb(255 90 31 / 0.15);
```

---

## Uso correto

```tsx
// Card padrão
<div className="shadow-card hover:shadow-card-hover transition-shadow">

// Modal / popover
<div className="shadow-elevated">

// CTA com glow
<button className="shadow-glow-primary">Nova conversa</button>

// Input com inner
<input className="shadow-inner-soft focus:ring-2 focus:ring-primary/20">
```

---

## Regras

- **Nunca empilhar** sombras (shadow + shadow-md juntos cria ruído visual)
- **Glow primário** só em CTAs principais — máximo 1 por página
- Em dark mode, reduzir opacidade das sombras em 50%
- Cards em listas: `shadow-card` + `hover:shadow-card-hover`
- Modais sempre: `shadow-elevated`
