# ADR 014 — Design System Nexa: Inventário, Regras e Plano de Migração

- **Status**: Aceito
- **Data**: 2026-06-09
- **Autores**: Equipe Nexa
- **Relacionados**: ADR 002 (Frontend Stack — parcialmente implementada)

---

## Contexto

O Nexa não possui um pacote de design system formal. O sistema visual evoluiu
de forma orgânica em quatro camadas distribuídas, espelhando o HiperTMS (referência
visual acordada com Uelder). A ausência de regras explícitas gerou dívidas técnicas
que dificultam a manutenção e a expansão do time.

Este ADR formaliza o estado atual, estabelece as regras de uso e define o plano de
deprecação das dívidas identificadas em auditoria de 2026-06-09.

---

## Decisão

### 1. Arquitetura em 4 Camadas

```
┌─────────────────────────────────────────────────────┐
│  4. PÁGINAS / FEATURES                              │
│     Consomem apenas: átomos CSS + classes base-*    │
├─────────────────────────────────────────────────────┤
│  3. ÁTOMOS CSS  (@layer components em index.css)    │
│     .btn-primary  .btn-outline  .btn-ghost          │
│     .card  .input  .badge                           │
├─────────────────────────────────────────────────────┤
│  2. CLASSES TAILWIND  (tailwind.config.js)          │
│     brand-*  base-*  sidebar-*  shadow-*            │
├─────────────────────────────────────────────────────┤
│  1. TOKENS CSS  (:root em index.css)  ← FONTE REAL  │
│     --surface-*  --text-*  --border-*               │
│     --accent-*   --shadow-*  --sidebar-*            │
└─────────────────────────────────────────────────────┘
```

A regra fundamental é: **cada camada consome apenas a camada imediatamente
abaixo**. Páginas não tocam tokens diretamente quando existe um átomo.

---

### 2. Inventário Completo de Tokens

Fonte da verdade: `apps/frontend/src/index.css` — bloco `:root`.
Dark mode: `html.dark` sobrescreve apenas os **valores**, nunca a estrutura.

#### 2.1 Superfícies

| Token | Light | Dark | Uso correto |
|-------|-------|------|-------------|
| `--surface-muted` | `#f2f2f0` | `#0e0f13` | Background do `<body>` e área de página |
| `--surface` | `#fafaf9` | `#1f222a` | Cards, painéis — classe `.card` |
| `--surface-elevated` | `#ffffff` | `#282c36` | Modais, dropdowns, popovers |
| `--surface-input` | `#ffffff` | `#16181d` | Inputs, textareas, selects — classe `.input` |

**Hierarquia visual em dark mode** (do mais escuro ao mais claro):
```
body (#0e0f13) < página (#16181d) < card (#1f222a) < modal (#282c36)
```

#### 2.2 Texto

| Token | Light | Dark | Uso correto |
|-------|-------|------|-------------|
| `--text-primary` | `#16181d` | `#fafaf9` | Texto principal, títulos, labels |
| `--text-secondary` | `#52525b` | `#d4d4d8` | Subtítulos, metadados, descrições |
| `--text-muted` | `#a1a1aa` | `#71717a` | Placeholders, hints, disabled |

> **Tokens mortos — a deprecar**: `--fg`, `--fg-muted`, `--fg-subtle`
> Definidos em `:root` mas não consumidos por nenhum componente atômico.
> Remover na próxima limpeza de tokens (não quebra nada).

#### 2.3 Bordas

| Token | Light | Dark | Uso correto |
|-------|-------|------|-------------|
| `--border` | `#e6e6e3` | `#2a2f3c` | Bordas de cards, divisores, tabelas |
| `--border-input` | `#d4d4d8` | `#353b4e` | Bordas de inputs e formulários |

#### 2.4 Accent / Brand

| Token | Light | Dark | Uso semântico |
|-------|-------|------|---------------|
| `--accent-brand` | `#ff5a1f` | `#ff8a5c` | Laranja primário — CTAs, links ativos |
| `--accent-amber` | `#d97706` | `#fbbf24` | Alertas, custo, atenção |
| `--accent-red` | `#dc2626` | `#f87171` | Erros, exclusão, opt-out |
| `--accent-green` | `#059669` | `#34d399` | Sucesso, status ativo, ganhos |

#### 2.5 Sombras

| Token | Uso |
|-------|-----|
| `--shadow-card` | Sombra padrão — consumida por `.card` |
| `--shadow-card-hover` | Hover de card — **pendente**: adicionar em `.card:hover` |
| `--shadow-elevated` | Modais e dropdowns — consumida por `.shadow-elevated` |
| `--shadow-inner-soft` | Inputs com profundidade (uso opcional) |
| `--shadow-up` | Barras fixas no bottom |
| `--shadow-glow-brand` | Efeito glow laranja — tours, highlights especiais |

#### 2.6 Layout / Zoom

| Token | Valor | Uso |
|-------|-------|-----|
| `--app-ui-zoom` | `0.8` | Zoom global via `html { zoom }` |
| `--app-layout-vh` | `calc(100svh / 0.8)` | Altura real da viewport após zoom |
| `--app-layout-vw` | `calc(100vw / 0.8)` | Largura real após zoom |

Classes utilitárias: `.min-h-app`, `.h-app`, `.min-w-app`

#### 2.7 Sidebar (always-dark)

Tokens `--sidebar-*` são usados **exclusivamente** pelo `<aside>`.
A sidebar é sempre dark independente do tema ativo.
Nunca usar tokens `--sidebar-*` em conteúdo principal.

| Token | Uso |
|-------|-----|
| `--sidebar-bg` | Background principal da sidebar |
| `--sidebar-hover` | Hover de item de menu |
| `--sidebar-active` | Item de menu ativo |
| `--sidebar-icon-accent` | Ícone / indicador do item ativo (laranja) |
| `--sidebar-text` | Texto de item inativo |
| `--sidebar-text-hover` | Texto em hover |
| `--sidebar-text-active` | Texto do item ativo |
| `--sidebar-border` | Divisores internos da sidebar |

---

### 3. Inventário de Átomos CSS

Definidos em `@layer components` dentro de `index.css`.
**Obrigatório** usar esses átomos para os elementos correspondentes.
Proibido recriar o mesmo padrão com classes Tailwind inline.

| Átomo | Elemento | Tokens consumidos |
|-------|----------|------------------|
| `.btn-primary` | Botão de ação principal | `brand-500`, `brand-600` |
| `.btn-outline` | Botão secundário/neutro | `--surface`, `--border-input`, `--text-primary` |
| `.btn-ghost` | Botão terciário / ação discreta | `--text-primary`, `--surface-elevated` |
| `.card` | Container com elevação | `--surface`, `--border`, `--shadow-card` |
| `.input` | Campo de formulário | `--surface-input`, `--border-input`, `--text-primary` |
| `.badge` | Etiqueta de status genérica | `--border`, `--text-secondary` |

**Componentes React** em `apps/frontend/src/components/ui/`:
`Badge`, `Sheet`, `Skeleton`, `EmptyState`, `CommandPalette`,
`DateRangePicker`, `NotificationBell`

---

### 4. Regras de Uso

#### ✅ PERMITIDO

```tsx
// Átomo CSS — sempre preferido
<button className="btn-primary">Salvar</button>
<div className="card p-5">...</div>
<input className="input w-full" />

// Classes Tailwind de tokens (base-*)
<div className="bg-base-100 text-base-content border-base-200">

// Token via CSS variable (quando não existe classe Tailwind equivalente)
<table style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-card)' }}>

// Accent semântico via Tailwind (status, badges coloridas)
<span className="bg-emerald-100 text-emerald-700">ativo</span>
<span className="bg-red-100 text-red-700">erro</span>
<span className="bg-amber-100 text-amber-700">atenção</span>

// Opacidade de texto
<p className="text-base-content/50">texto secundário</p>
<p className="text-base-content/70">texto suave</p>
```

#### ❌ PROIBIDO

```tsx
// bg-white direto — não adapta ao dark mode
<div className="bg-white">
// ↳ usar: bg-base-100 | .card | style={{ background: 'var(--surface)' }}

// zinc-* direto — vocabulário de migração, não adicionar novos usos
<p className="text-zinc-500">
// ↳ usar: text-base-content/50

// gray-* — vocabulário legado
<div className="bg-gray-50">
// ↳ usar: bg-base-100

// Botão inline em vez de átomo
<button className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">
// ↳ usar: <button className="btn-primary">

// Card inline em vez de átomo
<div className="rounded-xl bg-white border shadow-sm">
// ↳ usar: <div className="card">

// !important em código de página ou componente
// ↳ apenas a compat layer em index.css pode usar !important
```

---

### 5. Padrão de Dark Mode — Regra de Ouro

#### Como funciona

O dark mode funciona por **substituição de valor de token** via `html.dark`.
Se o componente usa tokens, adapta automaticamente — **zero código adicional**.

```css
/* index.css — o token muda de valor, o componente não precisa saber */
:root        { --surface: #fafaf9; }   /* light */
html.dark    { --surface: #1f222a; }   /* dark  */

/* @layer components — usa o token, adapta em ambos os modos */
.card { background: var(--surface); }  /* funciona em light E dark */
```

#### Onde `!important` é permitido

**Somente na compat layer** — o bloco "DARK: compat Tailwind classes legadas"
em `index.css`. Essa camada existe exclusivamente para cobrir código legado
que ainda usa `bg-white` / `zinc-*` / `gray-*` antes de ser migrado.

**Nenhum componente novo deve depender dela.**

#### Checklist dark mode para novos componentes

- [ ] Usa superfícies via token ou classe `base-*`? (não `bg-white`)
- [ ] Usa texto via token ou `text-base-content/*`? (não `text-zinc-*`)
- [ ] Usa borda via token ou `border-base-*`? (não `border-zinc-*`)
- [ ] Testou alternar o tema no browser antes de fazer PR?

---

### 6. Plano de Deprecação — `zinc-*`, `gray-*` e compat layer

#### Fase 1 — Congelar (vigente a partir deste ADR)

- Proibir **novos usos** de `zinc-*` e `gray-*` em código de página/componente
- Code review rejeita PRs que adicionem `text-zinc-*`, `bg-zinc-*`, `border-zinc-*`
- Novos componentes: obrigatoriamente seguir as regras da seção 4

#### Fase 2 — Migrar hardcodes da compat layer (próximo sprint)

Substituir cores hardcoded pelos tokens já definidos:

| Código atual (index.css) | Substituição correta |
|--------------------------|----------------------|
| `background-color: #1f2937` (inputs dark) | `var(--surface-input)` |
| `border-color: #4b5563` (inputs dark) | `var(--border-input)` |
| `color: #e5e7eb` (inputs dark) | `var(--text-primary)` |
| `.dark header { background !important }` | Remover após Layout.tsx usar token no header |
| `.dark .rounded-xl.bg-white { !important }` | Remover após modais usarem `var(--surface-elevated)` |

Componentes/arquivos com `bg-white` / `rounded-xl bg-white` pendentes:
- `Layout.tsx` — `header` usa `bg-white` (linha 295)

#### Fase 3 — Remover alias zinc do tailwind.config.js (após Fase 2)

Quando não houver mais `zinc-*` no código de aplicação:
1. Remover o bloco `zinc: { ... }` de `tailwind.config.js`
2. Remover as regras `.dark .text-zinc-*` e `.dark .bg-zinc-*` de `index.css`
3. Remover as regras `html.dark .bg-gray-*` de `index.css`
4. A compat layer inteira pode então ser eliminada

---

### 7. Catálogo de Componentes — Storybook

**Decisão: NÃO instalar agora. Reavaliar quando o time atingir 3+ devs front.**

#### Prós
- Catálogo visual de todos os átomos com variações de estado
- Detecta regressões visuais quando tokens mudam
- Onboarding de novo desenvolvedor muito mais rápido

#### Contras (determinantes para o momento atual)
- Setup não trivial com Vite + Tailwind + CSS variables
  (requer decorators para carregar `index.css` com os tokens no iframe)
- Manutenção contínua — cada componente novo precisa de story;
  com time pequeno vira dívida mais rápido do que ajuda
- A alternativa abaixo é suficiente para o estágio atual

#### Alternativa adotada: Página `/dev/tokens`

Uma rota protegida por `import.meta.env.DEV` que renderiza:
- Todos os tokens de superfície, texto, borda e accent com seus valores
- Todos os átomos CSS (`.btn-primary`, `.btn-outline`, `.card`, `.input`, `.badge`)
- Toggle dark/light nativo para testar visualmente

Custo zero de setup, funciona com o dark mode toggle existente.

---

### 8. Divergência com ADR 002

A ADR 002 listou dependências que **nunca foram instaladas**:

| Item citado na ADR 002 | Status real | Decisão deste ADR |
|------------------------|-------------|-------------------|
| FlyonUI | ❌ Não instalado | **Não instalar** — sistema de tokens próprio é mais alinhado ao TMS e já está maduro |
| recharts | ❌ Não instalado | Instalar quando dashboard precisar de gráficos (backlog) |
| CASL | ❌ Não instalado | Instalar quando RBAC no frontend ficar complexo (backlog) |
| Tailwind v3 | ✅ Instalado e configurado | Manter |
| Inter (fonte) | ✅ Configurado em `tailwind.config.js` | Manter |
| lucide / heroicons | ❌ Não instalado | Usar emojis por ora; instalar lucide quando houver demanda de ícones consistentes |

Este ADR **sobrepõe a ADR 002** no que diz respeito ao design system.

---

## Consequências

### Positivas
- Dark mode funciona por token sem `!important` nas páginas
- Vocabulário único: sempre `base-*` / tokens CSS / átomos
- Checklist claro para code review
- Novos devs têm regras explícitas do que usar e do que não usar

### Negativas / Riscos aceitos
- Fase 2 da migração exige revisar os componentes que ainda usam
  `bg-white` no Layout.tsx — pequeno esforço pontual
- Sem Storybook, regressões visuais só são detectadas manualmente
  até que o time cresça
- `--surface-elevated` em light mode é `#ffffff` (branco puro) em vez de
  derivar de `--app-base-*` — inconsistência menor, aceita por paridade com TMS

---

## Referências

- `apps/frontend/src/index.css` — tokens e compat layer
- `apps/frontend/tailwind.config.js` — extensões de tema
- `apps/frontend/src/components/ui/` — componentes React reutilizáveis
- HiperTMS `apps/web/src/styles/globals.css` — referência visual (Uelder, 2026-06)
