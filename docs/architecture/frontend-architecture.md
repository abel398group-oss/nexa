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
| PostCSS + Autoprefixer | — | Pipeline CSS |

Dev server em `:5174` (offset do TMS). Build: `tsc -b && vite build`.

## Organização (`src/`)

- **`pages/`** — uma página por tela: `InboxPage`, `ContactsPage`, `CampaignsPage`,
  `KnowledgePage`, `SellersPage`, `PlaybookPage`, `UsersPage`, `DashboardPage`,
  `LoginPage`, `EmailChannelSettingsPage`, `DevTokensPage`.
- **`components/`** — `Layout`, `HelpDrawer`, `HelpDemo`, `GuidedTour`,
  `ui/` (primitivos do design system) e `conversation/` (compostos do inbox).
- **`contexts/`** — estado de app via React Context: `AuthContext`, `ToastContext`,
  `ConfirmContext`, `DateRangeContext`.
- **`lib/`** — `api.ts` (instância axios; cookie HttpOnly + `credentials`),
  helpers de domínio (`conversation-status.ts`, `ticket-category.ts`).

## Comunicação com o backend

- **HTTP** via axios (`lib/api.ts`), base `/api`, cookies de auth
  (`withCredentials`). Sem token em header — sessão é cookie HttpOnly.
- **Tempo real** via `socket.io-client` para o Inbox (mensagens chegando).
- CORS no backend libera apenas as origens em `CORS_ORIGINS`.

## Design system

Proprietário, espelhando o HiperTMS (referência visual). Tokens CSS em `index.css`
+ extensões em `tailwind.config.js`; sem biblioteca de componentes externa. **Dark
mode** via classe `html.dark` (`darkMode: 'class'`): tokens em `:root` são
sobrescritos em `html.dark`, e os componentes adaptam automaticamente. Inventário e
regras completas no **ADR 014**.

## Autenticação no cliente

`AuthContext` mantém o usuário logado; o backend valida o cookie a cada request. A
UI esconde/mostra conforme `role`/`permissions` (espelha o RBAC do backend —
`@RequirePerm`).

## Relacionados

- ADR 002 — Frontend Stack · ADR 014 — Design System
- `docs/architecture/codebase-structure.md` · `docs/api/api-standards.md`
