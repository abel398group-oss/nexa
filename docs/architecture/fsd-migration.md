# Plano de migração para FSD (Feature-Sliced Design) — Frontend

> Plano de reorganização do `apps/frontend/src` para a arquitetura FSD. **Não executar
> de uma vez.** É refactor de imports do projeto inteiro — fazer **uma fatia por vez,
> validando o build (`pnpm build` / dev server) entre cada passo**.
>
> Status: **fatias 1, 2 e 3 executadas e validadas (type-check OK)** · fatias 4-6 pendentes.
> Risco: alto se feito às cegas (quebra de import-path). Ganho: organização/escala —
> **zero impacto pro usuário final**.
>
> ### Progresso
> - [x] **Fatia 1 — `shared/`**: `lib/` → `shared/lib/` (47 imports `@/lib/` → `@/shared/lib/`). Build OK.
> - [x] **Fatia 2 — `app/`**: `contexts/` → `app/providers/` (16 imports) + `App.tsx` → `app/App.tsx` + `main.tsx`. Build OK.
> - [x] **Fatia 3 — `entities/`** (model/api por entidade). `tsc --noEmit` 0 erros. Detalhe abaixo.
> - [ ] **Fatia 4 — `features/`** (ações em slices).
> - [ ] **Fatia 5 — `widgets/`** (ConversationInbox, app-shell).
> - [ ] **Fatia 6 — `pages/` finas**.
>
> O alias `@/*` → `src/*` já cobre `@/entities/*` — **nenhuma mudança em tsconfig/vite** foi necessária.
> As fatias 4-6 são reestruturação de código (não só mover arquivo) — fazer uma por
> vez, com build verde entre cada.

### Fatia 3 — `entities/` (feito em jun/2026)

Cinco entidades, cada uma com `types/` (tipos de domínio) + `api/` (chamadas puras,
sem React) + `index.ts` (barrel público). As páginas passaram a consumir os barrels
em vez de declarar tipos e chamar `api.get/post` inline.

| Entity | Tipos | API pura | Consumido por |
|---|---|---|---|
| `contact` | Contact, ContactInput, … | listContacts, createContact, … | Campaigns, Contacts, Inbox (promovido de `features/contact`) |
| `conversation` | Conversation, Message | listConversations, sendMessage, assignSeller, setConversationResolved, … | Inbox, SupportClients |
| `seller` | Seller, SellerKpi, SellerMini | listSellers, createSeller, toggleSellerActive, … | Sellers, Inbox |
| `campaign` | Campaign, SenderNumber, SenderSettings, … | listCampaigns, create*/update/start/pause/delete, listSenderNumbers, … | Campaigns, NumberHealth |
| `ticket` | PortalMe, PortalTicket* | getPortalMe, listPortalTickets, openPortalTicket, … (sobre `portalApi`) | portal/PortalPage |

Notas:
- `features/contact` virou `entities/contact` (a pasta `features/` ficou vazia e foi removida).
- Os **tipos do ticket saíram de `shared/lib/portalApi`** para `entities/ticket`; o `shared/lib/portalApi`
  agora expõe só a instância axios isolada do portal (transporte = camada shared, correto no FSD).
- `Conversation` e `SenderNumber` viraram **supersets** (a forma rica), já que telas diferentes
  liam subconjuntos do mesmo endpoint.

> **Validação:** `tsc --noEmit` rodado contra cópia do `src` (o mount do sandbox adiciona bytes NUL
> no fim dos arquivos editados — artefato de mount, não corrupção do arquivo real) → **0 erros de tipo**.
> O build de produção (`pnpm build`) deve ser rodado localmente pelo usuário a cada fatia.

---

## Por que (e quando)

FSD organiza o front em **camadas com direção de dependência única** (de cima pra baixo),
o que deixa claro onde cada coisa mora e evita imports circulares. Vale fazer quando o
time crescer / o front ficar grande. Hoje o Nexa já tem pedaços disso (`features/contact`,
`shared/ui`) — o plano é completar de forma incremental, **sem pressa e com build validando**.

## Estado atual (jun/2026)

```
src/
  pages/            (18)  telas por rota (algumas grandes: Campaigns, Inbox/ConversationInbox)
  pages/portal/            portal do cliente
  components/       (5)   Layout, RouteGuards, etc.
  components/ui/    (44)  design system (re-exportado por shared/ui)
  components/conversation/ (6) composites do inbox (badges, timeline, filtros)
  features/contact/        slice já no estilo FSD (api/ + types/ + index.ts)
  shared/ui/               barrel do design system
  lib/              (10)  api (axios), phone, cn, queryClient, conversation, etc.
  contexts/         (5)   Auth, Toast, Confirm, DateRange
```

## Camadas-alvo (FSD)

Direção de import: **app → pages → widgets → features → entities → shared** (nunca pra cima).

| Camada | O que vai | Vem de hoje |
|---|---|---|
| `app/` | providers globais, router, bootstrap | `contexts/`, `App.tsx` |
| `pages/` | telas por rota, **finas** (compõem widgets/features) | `pages/` |
| `widgets/` | blocos compostos reusáveis | `ConversationInbox`, `Layout`, `components/conversation/` |
| `features/` | ações do usuário (verbos): criar campanha, reatribuir lead, tags… | hoje espalhado nas páginas |
| `entities/` | entidades de negócio (model+api+ui): contact, conversation, seller, campaign, ticket | `features/contact` (vira entity), tipos |
| `shared/` | `ui` (design system), `lib` (utils), `api` (axios), `config` | `components/ui`→`shared/ui`, `lib/`, `lib/api` |

## Ordem incremental (cada passo = 1 PR, validar build entre eles)

1. **`shared/` (fundação, mecânico).** Mover `lib/*` → `shared/lib/*` e `lib/api.ts` →
   `shared/api`. Manter `shared/ui` como está. Atualizar o alias `@/shared/*`. Muitos
   imports mudam, mas é find-replace. **Menor risco conceitual, maior volume.**
2. **`app/`.** Mover `contexts/*` → `app/providers/*` e `App.tsx` → `app/App.tsx`.
   Ajustar o `main.tsx`. Poucos arquivos.
3. **`entities/`.** Promover `features/contact` → `entities/contact` (model/api/ui). Criar
   `entities/conversation`, `entities/seller`, `entities/campaign`, `entities/ticket` com
   seus tipos e chamadas de API puras (tirar dos arquivos de página).
4. **`features/`.** Extrair as ações para slices: `feature/assign-seller`,
   `feature/campaign-crud`, `feature/contact-tags`, `feature/import-contacts`,
   `feature/ticket-resolve`, etc. Cada uma com sua UI + hook + chamada de API.
5. **`widgets/`.** `widgets/conversation-inbox` (o `ConversationInbox`), `widgets/app-shell`
   (o `Layout` + sidebar), movendo `components/conversation/*` pra dentro do widget.
6. **`pages/`.** Reduzir as páginas a "casca": cada uma só importa e compõe widgets/features.
   `CampaignsPage` (a maior) é a última — quebrar o form gigante em features.

## Convenções

- **Aliases:** `@/app`, `@/pages`, `@/widgets`, `@/features`, `@/entities`, `@/shared`
  (adicionar no `tsconfig.json` `paths` + no `vite.config`).
- **Barrels:** cada slice expõe um `index.ts` público; só ele é importado de fora.
- **Regra de import:** uma camada só importa das **camadas abaixo** (lint opcional:
  `eslint-plugin-boundaries` ou `@feature-sliced/eslint-config` pra reforçar).
- Não mover lógica de negócio nesta migração — só **realocar arquivos + ajustar imports**.
  Comportamento idêntico.

## Riscos / como não quebrar

- **Build não-confiável no sandbox do agente** (mount defasa edições) → **rodar `pnpm build`
  localmente a cada fatia**. Não emendar duas fatias sem build verde no meio.
- **Imports quebrados** são o risco #1: depois de cada movimentação, um `pnpm build` pega
  todos. Commit por fatia (reverter é fácil).
- **CampaignsPage (1300+ linhas)** é a de maior risco — deixar por último e quebrar em
  features pequenas, uma de cada vez.
- Sem mudança de runtime/migrations — é puramente estrutural.

## Referência

- Visão atual: `docs/architecture/frontend-architecture.md`
- Slice de exemplo já existente: `apps/frontend/src/features/contact/`
- FSD oficial: feature-sliced.design (layers/slices/segments)
