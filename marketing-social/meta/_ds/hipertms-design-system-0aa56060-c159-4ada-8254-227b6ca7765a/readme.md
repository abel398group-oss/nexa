# HiperTMS — Design System

> **HiperTMS** — *Gestão de Transporte Inteligente.* A SaaS TMS (Transport
> Management System) built **to sell freight**, aimed at micro and small
> Brazilian carriers (*micro e pequenas transportadoras*). The product promise
> is speed and clarity: **"Cadastrou, cotou. Comece a vender frete em 5
> minutos."** — price a freight in seconds and see your margin *before* the
> truck rolls. Ships with a national model rate table, no implementation fee.
> Core surfaces: freight **pricing/quoting (cotação)**, **shipments
> (embarques)**, **trips (viagens)**, **fiscal docs (CT-e / MDF-e / NF-e)**,
> **finance**, **fleet/drivers** and a light **CRM**. Plans from **R$ 89/mês**.

This project is the brand & UI design system extracted from the product
codebase. It gives design agents the tokens, components, foundations and full
UI-kit recreations needed to design on-brand HiperTMS interfaces and assets.

---

## Sources

Everything here was reverse-engineered from the product monorepo provided as a
read-only mount:

- **`hipervias_v12/`** — pnpm monorepo. The web app lives in
  `apps/web` (React + Vite + TypeScript, **Tailwind v4 + shadcn/ui +
  FlyonUI**). Key references used:
  - `apps/web/src/styles/globals.css` — **the token source of truth**
    (`@theme` block: colors, shadows, spacing, sidebar).
  - `apps/web/src/components/ui/*` — shadcn primitives (button, badge, card,
    input, switch, …) + Storybook stories.
  - `apps/web/src/pages/public/landing/*` — marketing landing (hero, bento,
    pricing, FAQ, quote-simulation card).
  - `apps/web/src/components/layout/AppSidebar.tsx`, `AppTopBar.tsx` — the
    authenticated app shell.
  - `apps/web/src/pages/dashboard/*`, `pages/logistic/*` — operational screens.
  - `apps/web/public/` & `public/assets/logo/` — logos, favicons, wordmark SVG.
  - `apps/web/index.html` — product meta / theme-color (`#FF5A1F`).
- `docs/brand/positioning.md`, `docs/design-system/*` — brand docs (currently
  placeholders in the repo; the real system lives in code).

> ⚠️ The reader is not assumed to have access to the mount. Paths are recorded
> so they can be re-opened if the codebase is re-attached.

---

## Brand at a glance

- **Name / wordmark:** *Hiper* (graphite **#16181D**) + **TMS** (Ignition
  Orange **#FF5A1F**).
- **Symbol:** a stylised **"H"** drawn like a **goalpost** — two upright posts
  joined by an orange **crossbar** with a small **focus dot** (evokes an axle /
  road / "lock-in your margin"). Used as favicon, sidebar rail icon, app badge.
- **Primary color:** **Laranja-Ignição / Ignition Orange `#FF5A1F`** — the one
  unmistakable brand signal. (Note: stale Storybook comments call the primary
  "indigo"; the live `@theme` tokens, meta theme-color and logo are all orange.
  **Orange is correct.**)
- **Personality:** pragmatic, fast, no-nonsense, made-for-PMEs; warm charcoal +
  ignition orange, never corporate-cold.

---

## CONTENT FUNDAMENTALS

**Language:** Brazilian Portuguese (pt-BR), always. Currency is `R$` with
`pt-BR` formatting (`R$ 4.863,64`).

**Voice — direct, second person, benefit-first.** Copy speaks to *você* ("you"),
imperative and active: *"Cadastrou, cotou."*, *"Precifique fretes em segundos e
saiba sua margem antes de rodar."*, *"Comece a vender frete em 5 minutos."* It
sells outcomes (speed, margin, conformity), not features. Sentences are short
and punchy; promises are concrete ("5 minutos", "R$ 89/mês", "sem taxa de
implantação").

**Tone:** confident, plain-spoken, a little proud. It leans on the target
customer's reality — *"O queridinho das pequenas transportadoras — atende 9 em
cada 10 operações."* No corporate jargon, no hype words. Reassuring on the
scary parts (fiscal): *"CT-e, MDF-e e NF-e conforme SEFAZ e Receita Federal."*

**Casing:** Sentence case for headings and buttons (*"Criar conta grátis"*,
*"Nova cotação"*). UPPERCASE only for small tracked eyebrows / nav-group labels
(*"O QUE VOCÊ GANHA"*, *"ACESSO RÁPIDO"*). Product nouns are capitalised as
proper features: *Cotações, Embarques, Viagens, CT-e, MDF-e*.

**Domain vocabulary (use the real terms):** cotação (quote), frete (freight),
embarque (shipment), viagem (trip), carga (cargo), margem (margin),
rentabilidade (profitability), ad valorem, pedágio (toll), ICMS, tenant,
transportadora. Document numbers look like `COT-2025-0481`.

**Buttons / CTAs:** verb-first, short — *Criar conta grátis, Cotar meu primeiro
frete, Começar agora, Falar com vendas, Abrir cotação, Nova cotação*.

**Emoji:** none. The product never uses emoji in UI or marketing. Don't add it.

---

## VISUAL FOUNDATIONS

**Color & vibe.** A warm, near-white canvas (**#FAFAF9**, not pure white) with
warm-charcoal text (**#16181D** — slightly violet-tinted ink, never #000). The
single accent is **Ignition Orange #FF5A1F** (hover/press → **#ED4708**), used
sparingly for primary actions, active nav, links and key numbers. A **deep navy
#1E3A5F** is the secondary, mostly for charts and the signature gradient.
Status colors are standard but muted: success green `#16A34A`, warning orange
`#F97316`, danger red `#DC2626`, info sky `#0284C7` — almost always shown as
**soft tinted pills** (light fill + dark ink) rather than solid blocks.

**The app shell is dual-tone:** a permanently **dark "midnight enterprise"
sidebar** (#16181D, never neutral zinc — it has a faint violet warmth) against
the light content canvas. Active sidebar items get a subtle white overlay fill
+ an **orange dot + orange icon**. Light/dark themes both exist; dark canvas is
#0E0F13 / #16181D.

**Typography.** Body & UI = **Inter**; headings (h1/h2) deliberately use the
**system-ui** stack (fast, native, neutral). Numeric/tabular data (currency,
CT-e keys, counts) uses **mono + tabular-nums** for tidy alignment. Marketing
headlines go **extrabold (800)** with tight tracking (`-0.02em`); UI text is
400–600. Eyebrows are tiny, uppercase, letter-spaced (`0.1em`–`0.2em`). The app
applies a global **`zoom: 0.8`** to the shell for information density.

**Backgrounds.** No photography in the product UI. Marketing uses **layered
radial gradients** ("glow" blooms of orange + navy) over the dark hero and over
the light canvas — soft, atmospheric, low-opacity. The **signature gradient** is
a 135° **#FF5A1F → #ED4708 → #1E3A5F** (ignition → ember → navy), used on the
hero quote card and the "Mais popular" pricing tier. No repeating textures.

**Cards & surfaces.** Rounded, soft, low-contrast. Default card = **`rounded-xl`
(12px)**, 1px hairline border (a *softened* mix, never a hard black line), and a
**soft shadow** (`shadow-soft`/`shadow-card`). Marketing tiles use a thin
`ring-1` instead of a border and a larger blurred shadow. **Radii ladder:** md
6px (buttons/inputs), lg 8px (nav rows/menus), xl 12px (cards), 2xl 16px
(panels), 3xl 30px (hero quote card), full (pills/badges/avatars).

**Shadows / elevation.** A deliberate soft system — `shadow-soft` → `card` →
`card-hover` (lift on hover) → `elevated` (modals/popovers). **Glow** shadows
(`shadow-glow-primary`) are reserved for the primary CTA and key status
moments, never decorative. Inner shadow (`shadow-inner-soft`) on inputs.

**Motion.** Restrained. Entrances use `cubic-bezier(0.22,1,0.36,1)` (soft
ease-out) over ~320ms; layout/sidebar transitions use the standard
`cubic-bezier(0.4,0,0.2,1)` over ~200ms. Hover = background darken + small
`translateY(-2px)` lift on cards; press = darker fill. No bounces, no infinite
loops. Respects `prefers-reduced-motion`.

**Interaction states.** Hover: primary darkens to #ED4708; ghost/outline get a
`base-200` wash; cards lift. Focus: a 3px soft ring in the control's color
(orange ring on inputs/buttons). Active nav: white overlay + orange dot/icon +
heavier weight. Disabled: 50% opacity, no pointer.

**Transparency & blur.** Used only on dark/marketing surfaces — translucent
white chips (`bg-white/6` + `backdrop-blur`) over the hero gradient; sidebar
overlays are rgba-white at low alpha. The light app UI stays opaque.

**Layout rules.** Fixed left sidebar (rail 3.6rem → expands to 12.8rem on
hover), fixed top bar (3.5rem). Marketing content maxes at **1280px** (max-w-7xl)
with generous section rhythm (64–80px). 4px spacing base.

---

## ICONOGRAPHY

Two line-icon systems are in play, both **stroke (outline) style**, never
filled, never multicolor:

- **App shell & authenticated screens → [Heroicons](https://heroicons.com)**
  (`@heroicons/react`, the **24/outline** set; 24/solid only for tiny trend
  arrows). Examples in use: `TruckIcon`, `DocumentTextIcon`,
  `CurrencyDollarIcon`, `ChartBarIcon`, `MapIcon`, `CreditCardIcon`,
  `BuildingStorefrontIcon`. Sidebar icons render at 20px (`h-5 w-5`); active
  icon is tinted Ignition Orange.
- **Marketing landing → [Lucide](https://lucide.dev)** (`lucide-react`).
  Examples: `Calculator`, `Timer`, `FileCheck2`, `Wallet`, `Truck`,
  `TrendingUp`, `ShieldCheck`, `Sparkles`, `ArrowRight`, `Check`.

Both are **CDN-available**, so this system links them from CDN rather than
copying SVGs:

- Heroicons: `https://unpkg.com/heroicons/24/outline/<name>.svg` (or the React
  pkg in code).
- Lucide: `https://unpkg.com/lucide-static/icons/<name>.svg`, or
  `https://cdn.jsdelivr.net/npm/lucide@latest` for the web build.

**Stroke weight** ~1.5–2px; size 16–24px in UI, 20px in nav. Tint with
`currentColor` — default `--color-fg-subtle`/`--color-fg-muted`, accent
`--color-primary`. **No emoji. No Unicode-glyph icons.** (Tiny trend arrows
`▲ ▼` are the one exception, used in KPI deltas.) The brand **logo/symbol** are
raster PNG + an SVG wordmark — see `assets/`.

> Substitution note: the original repo imports the icon React packages; this
> system references the same icon sets from their public CDNs. No custom icons
> were drawn.

---

## VISUAL SUBSTITUTIONS / CAVEATS

- **Inter & JetBrains Mono** load from the **Google Fonts CDN**. The source repo
  declares `font-family: Inter` but ships no Inter binaries; headings use the
  native `system-ui` stack (no webfont). **To self-host, drop the `.woff2`
  files in `assets/fonts/` and replace the `@import` in `tokens/fonts.css` with
  `@font-face` rules** — the binaries weren't provided yet, so the CDN stands.
- Icons are linked from CDN (Heroicons / Lucide), not vendored.
- **Dark mode:** add `class="dark"` (or `data-theme="dark"`) to `<html>`; all
  tokens have dark overrides. Both UI kits ship a working toggle.
- The **onboarding wizard** is rendered in brand Ignition-Orange; the source
  app's onboarding still uses a legacy blue accent (flagged for alignment).

---

## Index / manifest

**Root**
- `styles.css` — the single entry point consumers link (an `@import` manifest).
- `readme.md` — this guide.
- `SKILL.md` — Agent-Skills front-matter wrapper.
- `CANONICALIZATION.md` — plan to retire the codebase's scattered/stale design
  docs (e.g. the "índigo/azul" references) so this DS is the single source of truth.
- `assets/` — logos, favicons, wordmark SVGs (light + dark).

**`tokens/`** (all `@import`ed by `styles.css`)
- `fonts.css` — Google Fonts (Inter, JetBrains Mono).
- `colors.css` — primary scale, neutrals/ink, navy, surfaces, foreground,
  semantic + status tints, charts, sidebar; `.dark` overrides.
- `typography.css` — families, type scale, weights, leading, tracking.
- `spacing.css` — spacing scale, layout dims, radii, borders, motion.
- `shadows.css` — elevation + glow system.

**`guidelines/`** — foundation specimen cards (the Design System tab):
Colors (primary, neutrals, semantic, status tints, sidebar), Type (display,
body, weights, mono), Spacing (scale, radii, shadows), Brand (logo, symbol,
signature gradient).

**`components/`** — reusable React primitives (`window.HiperTMSDesignSystem_0aa560`):
- `core/` — **Button, Badge, Input, Select, Switch, Checkbox, Card** (+ `core.card.html`).
- `app/` — **MetricCard, StatusBadge** (+ `app.card.html`).
- `navigation/` — **Tabs, Pagination, Sidebar** (+ `navigation.card.html`).
- `overlay/` — **Dialog, Tooltip, Toast** (+ `overlay.card.html`).
- `data/` — **DataTable, Avatar** (+ `data.card.html`).

**`ui_kits/`** — full-screen, click-through product recreations:
- `app/` — authenticated TMS, dark-mode aware: login, dashboard, cotações list,
  nova cotação, **embarques (list + detail w/ timeline), viagens, CT-e &
  MDF-e detail, onboarding wizard, platform-admin pricing**. Toggle light/dark
  from the top bar (sun/moon).
- `marketing/` — public landing page (hero, bento, how-it-works, pricing,
  footer); dark-mode toggle in the nav.

**`slides/`** — branded deck template (`deck-stage.js` shell): title, agenda,
comparison, big-number, quote and closing slide types. 1920×1080, 16:9.
