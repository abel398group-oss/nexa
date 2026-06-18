# Nexa Frontend — Gaps para Gestão de Suporte Portal

**Objetivo:** o operador precisa gerenciar tickets de suporte originados pelo Portal do Cliente
(widget TMS) diretamente no Nexa, sem sair para outro sistema.

**Status do backend:** completo — `sourceChannel: 'portal'` já está disponível nos dados de
conversas; API de portal em `/api/portal/*` funcional (contrato v1.1, ver
`docs/portal-api-contract.md`).

**Este documento lista apenas o que está FALTANDO no frontend.** O que já existe não precisa
ser reconstruído (ver seção 1).

---

## 1. O que já existe (não reconstruir)

| O que | Onde |
|---|---|
| Inbox de Suporte (`scope="support"`) | `pages/SupportPage.tsx` |
| Componente compartilhado de inbox (lista + chat + resolver/reabrir) | `pages/InboxPage.tsx` — `ConversationInbox` |
| Lista de clientes com chamados | `pages/SupportClientsPage.tsx` |
| Config da persona da Lia de suporte | `pages/SupportConfigPage.tsx` |
| Entity `ticket` com chamadas ao portal API | `entities/ticket/` |
| Badge de canal (email / whatsapp) no card da lista | `InboxPage.tsx` — `ChannelBadge` |
| Badge TMS ("Cliente TMS — plano") no header da conversa | `InboxPage.tsx` — `/connectors/lookup` |
| Botão Resolver / Reabrir chamado | `InboxPage.tsx` — `scope === 'support'` |
| TMS lookup ao abrir conversa | `InboxPage.tsx` — `openGroup()` |

---

## 2. Gaps — tarefas para o squad

### Gap 1 — CRÍTICO: tickets portal nunca aparecem no Inbox de Suporte

**Arquivo:** `apps/frontend/src/shared/lib/conversation.ts`


`isSupportTicket()` classifica uma conversa como suporte com base em `ticketCategory`,
`customerStage` ou `status === 'escalated'`. **Não inclui `sourceChannel === 'portal'`.**

Consequência: tickets abertos pelo portal sem `ticketCategory` definida aparecem no
**Inbox de Vendas** (ou em nenhum inbox se o filtro excluir tudo).

**Fix — dois passos:**

**a)** Adicionar `sourceChannel` à interface `TicketLike`:

```ts
// conversation.ts
export interface TicketLike {
  status?: string | null;
  customerStage?: string | null;
  ticketCategory?: string | null;
  sourceChannel?: string | null;   // ← ADD
}
```

**b)** Incluir `sourceChannel === 'portal'` na função:

```ts
export function isSupportTicket(c: TicketLike): boolean {
  return (
    !!c.ticketCategory ||
    c.customerStage === 'cliente_ativo' ||
    c.status === 'escalated' ||
    c.sourceChannel === 'portal'   // ← ADD
  );
}
```

> O type `Conversation` (em `entities/conversation/types/conversation.types.ts`) já tem
> `sourceChannel?: string | null` — nenhuma mudança necessária lá.

---

### Gap 2 — Badge visual "portal" ausente nos cards da lista

**Arquivo:** `apps/frontend/src/pages/InboxPage.tsx` — componente local `ChannelBadge`

O componente trata `email` e `whatsapp` mas ignora `portal`. O agente não vê de onde
veio o chamado.

**Fix — adicionar o case `portal` antes do `return null`:**

```tsx
if (sourceChannel === 'portal') {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 font-medium"
      title="Canal: Portal do Cliente"
    >
      <Icon name="support" className="h-3 w-3" /> portal
    </span>
  );
}
```

---

### Gap 3 — Painel de contexto portal ausente no chat

Quando um agente abre uma conversa com `sourceChannel === 'portal'`, não há nenhuma indicação
de **qual problema o cliente reportou** nem **em que página do TMS ele estava**.

Esses dados são gravados no backend no momento do handoff:
- `subject` — título do chamado (ex.: "Não consigo acessar o financeiro")
- `portalPage` — rota do TMS onde o widget foi ativado (ex.: `/financeiro/faturas`)
- `portalErrorCode` — código de erro exibido ao cliente (ex.: `ERR_FORBIDDEN`)
- `externalId` — ID do cliente no TMS (para link direto ao perfil)

**Passo a) Verificar se o backend retorna esses campos**

Checar com o time de backend se `GET /conversations` e `GET /conversations/:id` já
expõem `subject`, `portalPage`, `portalErrorCode` e `externalId`. Se não, abrir tarefa
de backend para expor esses campos do model `AiConversation`.

**Passo b) Estender o type `Conversation`**

```ts
// entities/conversation/types/conversation.types.ts
export interface Conversation {
  // ... campos existentes mantidos ...
  subject?: string | null;
  portalPage?: string | null;
  portalErrorCode?: string | null;
  externalId?: string | null;
}
```

**Passo c) Renderizar a faixa de contexto no header do chat**

Em `InboxPage.tsx`, logo após a tag bar (depois do `div` de tags), inserir:

```tsx
{active.sourceChannel === 'portal' && (
  <div className="flex flex-wrap items-center gap-3 border-b border-violet-100 bg-violet-50/60 px-4 py-2 text-xs">
    <span className="font-semibold text-violet-700">
      <Icon name="support" className="inline h-3.5 w-3.5 mr-0.5" /> Portal
    </span>
    {active.subject && (
      <span className="text-base-content/70">
        Assunto: <strong className="text-base-content">{active.subject}</strong>
      </span>
    )}
    {active.portalPage && (
      <span className="text-base-content/50">Página: <code>{active.portalPage}</code></span>
    )}
    {active.portalErrorCode && (
      <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-red-700">
        {active.portalErrorCode}
      </span>
    )}
  </div>
)}
```

---

### Gap 4 — `entities/ticket` com tipos e endpoints desatualizados

O contrato do portal API foi atualizado para v1.1 (ver `docs/portal-api-contract.md`).
O código da entity ainda usa o contrato antigo — vai quebrar em runtime ao tentar
ler mensagens de um ticket.

#### 4a — Types errados (`ticket.types.ts`)

```ts
// ATUAL — ERRADO
export interface PortalTicketMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  intent: string | null;
  ack: number | null;
  createdAt: string;
}

// CORRETO (contrato v1.1)
export interface PortalTicketMessage {
  id: string;
  author: 'customer' | 'agent';
  body: string;
  isAgent: boolean;
  createdAt: string;
}
```

#### 4b — Endpoint e campo errados em `replyPortalTicket` (`ticket.api.ts`)

```ts
// ATUAL — ERRADO (endpoint e campo)
export async function replyPortalTicket(id: string, message: string) {
  const r = await portalApi.post(`/tickets/${id}/messages`, { message });
  return r.data;
}

// CORRETO
export async function replyPortalTicket(id: string, body: string): Promise<PortalTicketDetail> {
  const r = await portalApi.post<PortalTicketDetail>(`/tickets/${id}/replies`, { body });
  return r.data;
}
```

#### 4c — Endpoint errado em `portalLogout` (`ticket.api.ts`)

```ts
// ATUAL — ERRADO (método + path)
export async function portalLogout(): Promise<void> {
  await portalApi.post('/session/logout', {});
}

// CORRETO
export async function portalLogout(): Promise<void> {
  await portalApi.delete('/session');
}
```

> Os alias antigos (`POST /session/logout`, `POST /tickets/:id/messages`) ainda existem
> no backend por retrocompatibilidade, mas serão removidos futuramente. Migrar agora.

---

## 3. Prioridade de entrega

| # | Gap | Impacto | Esforço |
|---|---|---|---|
| 1 | `isSupportTicket()` incluir portal | **Alto** — sem isso tickets portal não aparecem no inbox certo | ~5 min |
| 2 | `ChannelBadge` — case portal | Médio — UX visual | ~5 min |
| 4 | Entity `ticket` — types + endpoints | **Alto** — bug em runtime ao ler/responder ticket portal | ~20 min |
| 3 | Painel de contexto portal | Médio — depende do backend expor os campos | ~1h (front) + backend task |

**Recomendação:** entregar 1, 2 e 4 juntos (< 30 min no total). O item 3 fica em paralelo
enquanto o backend confirma quais campos já são retornados.

---

## 4. Arquivos a tocar

```
apps/frontend/src/
  shared/lib/conversation.ts          ← Gap 1
  pages/InboxPage.tsx                 ← Gaps 2 e 3c
  entities/conversation/types/
    conversation.types.ts             ← Gap 3b
  entities/ticket/types/
    ticket.types.ts                   ← Gap 4a
  entities/ticket/api/
    ticket.api.ts                     ← Gaps 4b e 4c
```

Nenhum arquivo novo precisa ser criado.

---

## 5. Fluxo completo após os gaps resolvidos

```
TMS (cliente abre chamado via widget)
  → POST /api/portal/session           handoff token → JWT cookie
  → POST /api/portal/tickets           cria AiConversation (sourceChannel='portal')
  → Nexa Inbox de Suporte              conversa aparece (Gap 1 fix)
      badge "portal" visível           (Gap 2 fix)
      faixa de contexto: assunto/page  (Gap 3 fix)
      botão Resolver disponível        (já existe)
      resposta do agente               via POST /conversations/:id/messages
                                       (backend roteia para o ticket portal)
  → Portal do Cliente                  cliente vê a resposta do agente
      via GET /api/portal/tickets/:id
```

---

*Gerado em 2026-06-18 | Ref: portal-api-contract.md v1.1*
