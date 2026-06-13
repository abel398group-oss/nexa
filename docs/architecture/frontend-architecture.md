# Arquitetura de Frontend — Nexa

> O painel de operação da Lia. Decisões de stack em **ADR 002** e o design system
> em **ADR 014**.

## Stack

| Dependência | Versão | Papel |
|---|---|---|
| React | 18.3 | UI framework |
| Vite | 5.4 | Build tool e dev server |
| TypeScript | 5.5 | Tipagem estática |
| Tailwind CSS | 3.4 | Utilitários CSS |
| React Router DOM | 6.26 | Roteamento SPA |
| Axios | 1.7 | Cliente HTTP |
| socket.io-client | 4.8 | WebSocket (Inbox em tempo real) |
| Storybook | 8.3 | Catálogo/documentação visual de componentes |

Dev server em `:5174` (offset do TMS). Build: `tsc -b && vite build`.
Storybook: `pnpm storybook` (`:6006`).

## Organização (`src/`)

- **`pages/`** — uma página por rota: `LandingPage` (pública `/`), `LoginPage`,
  `DashboardPage`, `InboxPage`, `SupportPage`, `ContactsPage`, `KnowledgePage`,
  `SellersPage`, `CampaignsPage`, `UsersPage`, `PlaybookPage`,
  `EmailChannelSettingsPage`, `DevTokensPage`.
- **`components/ui/`** — **design system / biblioteca de UI** própria (ver abaixo).
- **`components/conversation/`** — compostos do inbox/suporte:
  `ConversationTimeline`, `ConversationStatusBadge`, `ConversationStatusFilter`,
  `ConversationOutcomeBadge`, `ConversationMetricsCard`, `TicketCategoryBadge`.
- **`components/`** — chrome do app: `Layout`, `HelpDrawer`, `HelpDemo`, `GuidedTour`.
- **`contexts/`** — estado de app via React Context: `AuthContext`, `ToastContext`,
  `ConfirmContext`, `DateRangeContext`.
- **`lib/`** — `api.ts` (instância axios), helpers de domínio
  (`conversation-status.ts`, `ticket-category.ts`).

## Rotas

`/` é a **landing pública**; `/login` autentica; as demais rotas ficam sob um
layout protegido (`Layout`) e caem em `/inbox` por padrão. `/dev/tokens` é
auxiliar de desenvolvimento. Roteamento em `App.tsx` (react-router 6).

## Design system (`components/ui/`)

Biblioteca própria, espelhando o HiperTMS (ADR 014), **sem dependência de lib de
componentes externa**. Cobre:

- **Primitivos de formulário**: `Button`, `Input`, `Textarea`, `Select`,
  `Checkbox`, `Switch`, `Label`.
- **Estrutura e dados**: `Card`, `Table`, `Pagination`, `Separator`, `Tabs`,
  `Badge`, `StatusBadge`.
- **Overlays e navegação**: `Modal`, `Sheet`, `Popover`, `Tooltip`, `Alert`,
  `CommandPalette`, `NotificationBell`.
- **Estados**: `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton`.
- **Ícones**: `icons.tsx`.

**Tokens** em `index.css` (`:root`) + extensões em `tailwind.config.js`. **Dark
mode** via classe `html.dark` (`darkMode: 'class'`): os tokens são sobrescritos em
`html.dark` e os componentes adaptam automaticamente.

### Storybook

Catálogo visual em `.storybook/` (addons `essentials` + `themes`). Há stories
para os componentes-chave (`Button`, `Input`, `Alert`, `StatusBadge`, `Tabs`),
uma visão geral (`Overview.mdx`) e os tokens (`tokens.stories.tsx`). Rodar com
`pnpm storybook`. Use o Storybook como fonte de verdade visual ao criar telas.

## Comunicação com o backend

- **HTTP** via axios (`lib/api.ts`), base `/api`, cookies de auth
  (`withCredentials`). Sem token em header — sessão é cookie HttpOnly.
- **Tempo real** via `socket.io-client` para o Inbox (mensagens chegando).
- CORS no backend libera apenas as origens em `CORS_ORIGINS`.

## Autenticação e multi-tenant no cliente

`AuthContext` mantém o usuário logado; o backend valida o cookie a cada request.
A UI esconde/mostra conforme `role`/`permissions` (espelha o RBAC — `@RequirePerm`).
O **admin da plataforma** (sem tenant) pode atuar como um cliente específico; o
cliente selecionado vai no header `x-acting-tenant-id` e ações irreversíveis
exigem override ("quebra de vidro") — ver `docs/security/security-overview.md` e
`docs/features/platform-admin/`.

## Relacionados

- ADR 002 — Frontend Stack · ADR 014 — Design System
- `docs/architecture/codebase-structure.md` · `docs/api/api-standards.md`
- `docs/features/platform-admin/`
