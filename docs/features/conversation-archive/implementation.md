# Implementação — Arquivar Conversa Resolvida (Inbox de Vendas)

> Permitir que o **vendedor web** arquive uma conversa **resolvida** — tirando-a da
> lista ativa do Inbox sem apagá-la, com uma visão "Arquivadas" para reabrir/consultar.
> Espelha o padrão de **arquivar campanhas** já existente no projeto.
>
> Escopo: **só Nexa** (`apps/backend` + `apps/frontend`). Status: pronto para revisão · 2026-06
> Base: `docs/SPEC-LISTAS-FILTROS-CRUD.md`, ADR 005 (escopo/tenant).

## 1. Contexto

Hoje o vendedor define o desfecho da conversa (`PATCH /conversations/:id/outcome` →
`won`/`lost`, que move o `status` para `closed`), mas a conversa **continua na lista**
(só dá para filtrar por status). **Não existe "arquivar"** para guardar a conversa
resolvida e limpar a caixa. Confirmado no código:

- `AiConversation` **não tem** campo de arquivo (`archived*`).
- `ConversationsController` só expõe `outcome`, `assign`, `messages`, `GET`s.
- `conversations.service.findAll` não filtra por arquivo.

**O padrão de arquivar já existe — em Campanhas** (referência a copiar):
`sender.service.setArchived(ids, archived)` usa `archivedAt`, `listCampaigns` filtra
`archivedAt: archived ? { not: null } : null`, controller `POST /sender/campaigns/archive`
e `/unarchive`, e a `CampaignsPage` tem o `archivedView`.

## 2. Estado atual (o que JÁ existe)

| Camada | Hoje |
|---|---|
| Schema | `AiConversation`: `status`, `outcome`, `outcomeAt`, `resolvedAt`. Sem `archivedAt`. |
| Backend | `conversations.controller`: `GET /`, `GET /:id`, `/:id/messages`, `/:id/timeline`, `PATCH /:id/outcome`, `PATCH /:id/assign`, `POST /:id/messages`. `service.findAll(tenantId, q, sellerId)`. |
| Frontend | `InboxPage`: filtro por status (`ConversationStatusFilter`), `setOutcome(won/lost/null)`. Sem botão/visão de arquivo. |
| Referência | Campanhas: `setArchived` + `archivedAt` + `archivedView` (padrão a espelhar). |

## 3. Mudanças por camada

### 3.1. Banco de dados (Prisma) — **requer migration (rodar: USER)**

Adicionar o campo de arquivo em `AiConversation` (aditivo, opcional — espelha o
`archivedAt` da `Campaign`):

```prisma
model AiConversation {
  // ...
  archivedAt DateTime? @map("archived_at") // guardada (arquivada) pelo vendedor — não apaga
  @@index([tenantId, archivedAt])          // lista padrão filtra por isto
}
```

> Migration aditiva (campo opcional) — segue `docs/infra/prisma-migrations.md`.

### 3.2. Backend (NestJS)

**Service** (`conversations.service.ts`) — espelha `setArchived` das campanhas:

```ts
/** Arquiva/desarquiva uma conversa — só esconde da lista ativa, não apaga. */
async setArchived(tenantId: string, id: string, archived: boolean) {
  const conv = await this.findOne(tenantId, id); // valida posse (tenant)
  // Regra: só arquiva conversa JÁ encerrada (não arquivar conversa aberta/ativa).
  if (archived && !['closed', 'opt_out', 'escalated'].includes(conv.status)) {
    throw new BadRequestException('Só é possível arquivar uma conversa resolvida/encerrada.');
  }
  return this.prisma.aiConversation.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
  });
}
```

- **`findAll`**: por padrão **esconde** as arquivadas e aceita a visão "Arquivadas":
  ```ts
  async findAll(tenantId, q, sellerId?, archived = false) {
    const where: any = { tenantId, archivedAt: archived ? { not: null } : null };
    if (sellerId) where.assignedSellerId = sellerId;
    if (q.search) where.phone = { contains: q.search };
    // ...resto igual
  }
  ```
- Considerar **auto-desarquivar** se o cliente responder numa conversa arquivada
  (ao gravar nova mensagem inbound, `archivedAt = null`) — opcional, decidir no PR.

**Controller** (`conversations.controller.ts`):

```ts
@Patch(':id/archive')                       // arquivar / desarquivar
setArchived(@CurrentTenant() t: string, @Param('id') id: string,
            @Body() dto: { archived: boolean }) {
  return this.conversations.setArchived(t ?? 'default', id, dto.archived);
}
```

- `findAll` ganha `@Query('archived') archived?: string` → passa `archived === 'true'`.
- DTO com `class-validator` (`@IsBoolean() archived`) — o `ValidationPipe` global é
  `whitelist+forbidNonWhitelisted` (ver `docs/api/api-standards.md`).
- Manter o **escopo do vendedor** já existente (`sellerScope(user)` → só a carteira dele).
- (Opcional) endpoint em lote `POST /conversations/archive { ids, archived }` como nas campanhas.

### 3.3. Frontend (Inbox de vendas)

- **Botão "Arquivar"** na conversa **resolvida/encerrada** (no header da conversa
  e/ou no item da lista), chamando `PATCH /conversations/:id/archive { archived: true }`;
  feedback via `useToast`, confirmação via `useConfirm`.
- **Visão "Arquivadas"** no Inbox (toggle, igual ao `archivedView` da `CampaignsPage`):
  busca `GET /conversations?archived=true`. Lá, botão **"Desarquivar"**
  (`{ archived: false }`).
- A lista ativa **esconde** as arquivadas por padrão (vem do backend).
- Reaproveitar os componentes existentes (`ConversationStatusBadge`,
  `ConversationStatusFilter`) e o design system (`Button`, `useConfirm`, `useToast`).

## 4. Regras & escopo

- **Arquivar ≠ apagar**: só marca `archivedAt`; a conversa e o histórico permanecem.
- Só arquiva conversa **encerrada** (`closed`/`opt_out`/`escalated`) — não conversa ativa.
- **Escopo por tenant** sempre (`findOne` valida posse); vendedor só arquiva da
  própria carteira (mantém `sellerScope`).
- Não interfere no Janitor/auto-close nem no pipeline da Lia (campo independente).

## 5. Critérios de aceite

- [ ] Vendedor consegue **arquivar** uma conversa resolvida; ela some da lista ativa.
- [ ] Existe a **visão "Arquivadas"** com ação de **desarquivar**.
- [ ] Tentar arquivar conversa **aberta/ativa** é bloqueado (400) com mensagem clara.
- [ ] Lista padrão (`GET /conversations`) **não** traz arquivadas; `?archived=true` traz só elas.
- [ ] Escopo por tenant e por carteira do vendedor respeitado.
- [ ] (Se adotado) responder numa conversa arquivada a **reabre** (desarquiva).

## 6. Casos de borda

- **Conversa arquivada recebe nova mensagem** do cliente: decidir entre manter
  arquivada (e sinalizar) ou auto-desarquivar (recomendado p/ não perder atendimento).
- **Conversa reaberta** (outcome `null` → status `open`): se estava arquivada,
  desarquivar junto (coerência).
- **Filtros combinados**: a visão "Arquivadas" deve respeitar busca e os filtros de status.

## 7. Relacionados

- Referência de código (padrão a espelhar): `application/sender/sender.service.ts`
  (`setArchived`/`listCampaigns`), `presentation/http/sender/sender.controller.ts`
  (`campaigns/archive`), `apps/frontend/src/pages/CampaignsPage.tsx` (`archivedView`).
- `docs/SPEC-LISTAS-FILTROS-CRUD.md` · `docs/api/api-standards.md` ·
  `docs/infra/prisma-migrations.md` · `docs/architecture/frontend-architecture.md`
