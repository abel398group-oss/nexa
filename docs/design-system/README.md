---
type: design-system
tags: [design-system, brand, components, tokens]
updated: 2026-07-07
summary: Brand guide e catálogo de componentes do Nexa — tokens, primitivos, guidelines.
---

# Nexa — Design System

> **Nexa** é a plataforma de automação comercial e suporte B2B com IA (**Lia**).
> Produto Hipervias. Primeiro conector: HiperTMS.
>
> Promessa: *"Sua equipe atende mais com menos — a Lia cuida do WhatsApp,
> você cuida do negócio."*

Design e tokens foram deliberadamente alinhados ao HiperTMS para consistência
de marca dentro do ecossistema Hipervias.

---

## Brand em uma frase

**Nexa** (laranja-ignição **#FF5A1F**) + tagline *"IA que vende e atende"*.
Tom: direto, confiante, sem jargão. Foca em resultados práticos para times
comerciais de pequenas e médias empresas.

---

## Fundamentos visuais

| Elemento | Valor |
|---|---|
| Cor primária | `#FF5A1F` — Laranja-Ignição |
| Cor hover | `#ED4708` |
| Sidebar BG | `#16181D` — Carvão Meia-Noite |
| Canvas (light) | `#FAFAF9` — Off-white quente |
| Texto principal | `#16181D` |
| Fonte UI | Inter (400–600) |
| Fonte mono | JetBrains Mono |
| Zoom global | `0.8` (`--app-ui-zoom: 0.8`) |
| Raio padrão | `12px` (cards) / `6px` (inputs/botões) |

---

## Paleta de status (tints)

| Status | BG | Texto |
|---|---|---|
| Sucesso | `#F0FDF4` | `#16A34A` |
| Aviso | `#FFF7ED` | `#F97316` |
| Erro | `#FEF2F2` | `#DC2626` |
| Info | `#EFF6FF` | `#0284C7` |
| Neutro | `#F9FAFB` | `#6B7280` |


---

## Iconografia

| Contexto | Biblioteca | Estilo |
|---|---|---|
| App / painel autenticado | **Lucide React** | Outline, stroke 1.5–2px |
| Marketing / landing | **Lucide React** | Idem |
| Tamanho padrão no nav | 20px (`h-5 w-5`) |  |
| Ícone ativo | Tinta Laranja-Ignição | `currentColor` |

Sem emoji na UI. Sem ícones Unicode. Somente Lucide.

---

## Shell do app

```
┌─────────────────────────────────────────────────┐
│  AppSidebar (fixed, 4rem rail / 15rem expanded) │
│  AppTopBar (fixed, 3.5rem)                       │
│  <main> conteúdo scrollável                      │
└─────────────────────────────────────────────────┘
```

- Rail: `w-16` (4rem), expande ao hover → `w-60` (15rem)
- Sidebar BG: `#16181D`, ícones: `#FF7A47` (accent laranja suavizado)
- TopBar: fundo claro, breadcrumb + ações globais

---

## Motion

| Tipo | Curva | Duração |
|---|---|---|
| Entrada de elementos | `cubic-bezier(0.22,1,0.36,1)` | 320ms |
| Transições de layout | `cubic-bezier(0.4,0,0.2,1)` | 200ms |
| Hover cards | `translateY(-2px)` | 150ms |

Respeita `prefers-reduced-motion`. Sem bounces. Sem loops.

---

## Fontes de verdade

| O quê | Onde |
|---|---|
| Tokens CSS | `apps/frontend/src/index.css` (bloco `@theme` / variáveis CSS) |
| Componentes | `apps/frontend/src/components/ui/` (50 arquivos) |
| Stories | `*.stories.tsx` em `components/ui/` |
| Visão geral | `components/ui/Overview.mdx` |
| ADR de design | `docs/adr/014-design-system.md` |

---

## Índice deste design system

**`tokens/`**
- `colors.md` — paleta completa, variáveis CSS, uso
- `typography.md` — famílias, escala, pesos, tracking
- `spacing.md` — escala de espaçamento, radii, layout dims
- `shadows.md` — sistema de elevação e glow

**`components/`**
- `README.md` — catálogo dos 50 componentes com status
- Um arquivo por componente: props, uso, exemplos

**`guidelines/`**
- `brand.md` — logo, símbolo, voz, personalidade
- `colors.md` — como usar as cores (não apenas quais são)
- `spacing.md` — ritmo visual, grid, densidades
- `typography.md` — hierarquia, legibilidade, casos especiais
