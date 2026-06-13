# Design System — HiperTMS → Nexa

> Blueprint do sistema visual do HiperTMS (`apps/web`, **React + Vite + TS + Tailwind v4
> + shadcn/ui + FlyonUI**) para replicar no Nexa. Fonte da verdade dos tokens:
> `hipertms_v12/apps/web/src/styles/globals.css` (bloco `@theme`).
> No Nexa, os tokens vivem em `apps/frontend/src/index.css` + `tailwind.config.js`.

## 1. Marca

| Token | Valor | Uso |
|---|---|---|
| **Primária — Laranja-Ignição** | `#FF5A1F` | Ações primárias, nav ativa, links, números-chave |
| Primária hover/press | `#ED4708` | Estado pressionado do primário |
| Primária light | `#FFB089` | Realces suaves |
| **Secundária — Navy** | `#1E3A5F` | Gráficos e o gradiente assinatura |
| **Tinta / ink (texto)** | `#16181D` | Texto principal — carvão levemente violáceo, **nunca `#000`** |
| **Canvas** | `#FAFAF9` | Fundo — branco-quente, **nunca branco puro** |

Escala completa do primário (`brand-*` / `primary-*`):

```
50  #fff3ed   100 #ffe2d1   200 #ffd0b3   300 #ffb089   400 #ff8a5c
500 #ff5a1f   600 #ed4708   700 #c23a0a   800 #9a2e08   900 #7a2406   950 #4d1604
```

## 2. Paleta de cores

### Superfícies (light → dark)

| Token | Light | Dark | Uso |
|---|---|---|---|
| `base-100` | `#fafaf9` | `#0e0f13` | Fundo de página |
| `base-200` | `#f2f2f0` | `#16181d` | Chips, seções secundárias |
| `base-300` | `#e6e6e3` | `#1f222a` | Bordas, divisores |
| `base-content` | `#16181d` | `#fafaf9` | Texto sobre as superfícies |
| `surface` (card) | `#ffffff` | `#1f222a` | Cartões |
| `surface-elevated` | `#ffffff` | `#282c36` | Dropdowns, modais |
| `surface-input` | `#ffffff` | `#16181d` | Inputs |

### Sidebar ("midnight enterprise" — fixa, escura nos dois temas)

```
--sidebar-bg: #16181d   (dark: #0e0f13)      item ativo: overlay branco + ícone/dot LARANJA
--sidebar-icon-accent: #ff7a47 (dark #ff8a5c)
--sidebar-text: rgba(255,255,255,.56)   hover .93   active #f4f4f8
--sidebar-border: rgba(255,255,255,.09)
```

### Cores de feedback / status

Sempre como **pílulas de tinta suave** (fundo claro + texto escuro), nunca blocos sólidos.

| Status | Cor base | Tint (fundo) | Ink (texto) | Dark tint / ink |
|---|---|---|---|---|
| **Success** | `#16A34A` (green-600) | `#dcfce7` | `#166534` | `rgba(22,163,74,.22)` / `#86efac` |
| **Warning** | `#F97316` (orange-500) | `#fef3c7` | `#92400e` | `rgba(249,115,22,.20)` / `#fdba74` |
| **Error / Danger** | `#DC2626` (red-600) | `#fee2e2` | `#991b1b` | `rgba(220,38,38,.20)` / `#fca5a5` |
| **Info** | `#0284C7` (sky-600) | `#e0f2fe` | `#075985` | `rgba(2,132,199,.22)` / `#7dd3fc` |
| **Neutral** | — | `#f2f2f0` | `#44464d` | `#1f222a` / `#a1a1aa` |

### Gradiente assinatura

`linear-gradient(135deg, #FF5A1F 0%, #ED4708 50%, #1E3A5F 100%)` (ignição → brasa → navy).
Usado no card de cotação do hero e no tier "Mais popular" de pricing. Utilitário: `bg-signature`.

## 3. Tipografia

- **Corpo / UI:** **Inter** (`Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`).
- **Títulos (h1/h2):** stack **`system-ui`** deliberada (rápida, nativa, neutra).
- **Números / dados tabulares** (moeda, chaves CT-e, contagens): **mono + `tabular-nums`** (JetBrains Mono).
- **Pesos:** UI 400–600; manchetes de marketing **extrabold (800)** com tracking `-0.02em`.
- **Eyebrows** (rótulos de grupo): minúsculo, UPPERCASE, `letter-spacing 0.1em–0.2em`.
- **Casing:** sentence case em títulos/botões; UPPERCASE só em eyebrows.
- `line-height` base 1.5; `font-synthesis: none`; `-webkit-font-smoothing: antialiased`.

Escala (aproximada, via utilitários Tailwind):

```
xs 12 · sm 14 · base 15–16 · lg 18 · xl 20 · 2xl 24 · h1 ~32–51 (marketing)
```

## 4. Zoom global

`--app-ui-zoom: 0.8` aplicado no `html` (densidade de informação). `--app-layout-vh/vw`
recalculam altura/largura considerando o zoom. Prefira `rem` a `px` fixos no layout.

## 5. Espaçamentos

Base **4px**. Escala Tailwind padrão (`gap-2`=8, `gap-3`=12, `gap-4`=16, `p-5`=20, `p-6`=24…).
Marketing: ritmo de seção 64–80px; conteúdo `max-w-7xl` (1280px).

## 6. Border radius (escada)

| Token | Valor | Uso |
|---|---|---|
| `md` | 6px | Botões, inputs |
| `lg` | 8px | Linhas de nav, menus |
| `xl` | 12px | **Cards (padrão)** |
| `2xl` | 16px | Painéis |
| `3xl` | **30px** (`1.875rem`) | Card de cotação do hero |
| `full` | — | Pílulas, badges, avatares |

## 7. Sombras / elevação

```
shadow-soft / shadow-card : 0 2px 8px -2px rgb(0 0 0/.08), 0 2px 4px -2px rgb(0 0 0/.04)
shadow-card-hover         : 0 10px 25px -5px rgb(0 0 0/.08), 0 8px 10px -6px rgb(0 0 0/.04)
shadow-elevated           : 0 10px 40px -10px rgb(0 0 0/.15), 0 4px 12px -4px rgb(0 0 0/.08)
shadow-inner-soft         : inset 0 2px 4px 0 rgb(0 0 0/.04)
shadow-up                 : 0 -2px 10px rgb(0 0 0/.06)
glow-primary              : 0 0 26px -4px rgb(255 90 31/.30)   (reservado p/ CTA / estados-chave)
glow-danger               : 0 0 20px -4px rgb(220 38 38/.30)
glow-success              : 0 0 20px -4px rgb(22 163 74/.30)
```

Dark mode tem sombras próprias (mais opacas). Marketing usa `ring-1` + sombra borrada maior.

## 8. Opacidade / transparência

Translúcidos só em superfícies escuras/marketing: chips `bg-white/6` + `backdrop-blur` sobre o
gradiente do hero; overlays da sidebar em rgba-branco baixo. A UI clara do app fica **opaca**.

## 9. Transições / motion

- Entradas: `ease-entrance` = `cubic-bezier(0.22,1,0.36,1)` ~320ms.
- Layout / sidebar: `ease-layout` = `cubic-bezier(0.4,0,0.2,1)` ~200ms.
- Hover: escurece fundo + `translateY(-2px)` em cards; press: fill mais escuro.
- **Sem bounce, sem loop infinito.** Respeita `prefers-reduced-motion`.

## 10. Animações nomeadas

`ob-step-in` (onboarding, fade+slide 8px) · `tourPulse` (highlight laranja do tour) ·
`demoFade/demoPop/demoBlink` (demonstrações) · `slideInRight/Left` (sheets).

## 11. Dark mode

Ativado pela classe **`.dark` no `<html>`** (`@custom-variant dark`). **Todo** componente
deve funcionar nos dois temas. Dark canvas: `#0E0F13` / `#16181D`.

## 12. Tokens (JSON) — ver `design-tokens.json`

O arquivo `design-tokens.json` (mesma pasta) traz os tokens em formato consumível
(`colors`, `spacing`, `typography`, `radius`, `shadow`).
