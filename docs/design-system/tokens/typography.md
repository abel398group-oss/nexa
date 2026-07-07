---
type: tokens
tags: [design-system, tokens, typography]
updated: 2026-07-07
---

# Tokens — Tipografia

---

## Famílias

| Token | Valor | Uso |
|---|---|---|
| `--font-sans` | `Inter, system-ui, sans-serif` | Corpo, UI, rótulos |
| `--font-mono` | `JetBrains Mono, monospace` | Código, IDs, valores numéricos tabulares |
| `--font-display` | `system-ui, sans-serif` | Headings grandes (h1, h2) — carrega mais rápido |

---

## Escala de tamanhos

| Classe Tailwind | Tamanho | Uso |
|---|---|---|
| `text-xs` | 12px | Rótulos, eyebrows, metadados |
| `text-sm` | 14px | Corpo secundário, descrições |
| `text-base` | 16px | Corpo principal |
| `text-lg` | 18px | Subtítulos, highlights |
| `text-xl` | 20px | Títulos de seção |
| `text-2xl` | 24px | Headings de página |
| `text-3xl` | 30px | KPIs, números grandes |

> Com `zoom: 0.8` aplicado no shell, os tamanhos visuais são ~80% dos acima.

---

## Pesos

| Classe | Peso | Uso |
|---|---|---|
| `font-normal` | 400 | Corpo, descrições |
| `font-medium` | 500 | Rótulos, nav items |
| `font-semibold` | 600 | Títulos, valores de destaque |
| `font-bold` | 700 | Headings de seção |
| `font-extrabold` | 800 | Marketing, hero headlines |

---

## Tracking (letter-spacing)

| Classe | Uso |
|---|---|
| `tracking-tight` | Headings grandes |
| `tracking-normal` | Corpo |
| `tracking-wide` | Eyebrows (rótulos uppercase pequenos) |
| `tracking-widest` | Labels de seção uppercase |

---

## Padrões de uso

```tsx
// Heading de página
<h1 className="text-2xl font-semibold text-ink tracking-tight">

// Subtítulo / descrição
<p className="text-sm text-ink-muted">

// Rótulo de campo
<label className="text-xs font-medium text-ink-subtle uppercase tracking-wide">

// Valor numérico (tabela)
<span className="font-mono tabular-nums text-sm">

// Eyebrow de seção
<span className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">
```

---

## Regras

- **Sentence case** em títulos e botões: "Nova conversa", não "NOVA CONVERSA"
- **UPPERCASE** apenas para eyebrows de seção e nav-group labels
- Evitar mais de 3 tamanhos de fonte por página
- Números em tabelas: sempre `tabular-nums` para alinhar colunas
