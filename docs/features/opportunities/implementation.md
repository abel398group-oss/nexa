# Página de Oportunidades (Pipeline de Vendas) — estado atual

> Status: **implementado** · escrito como spec pré-construção em 2026-06,
> reescrito como referência de estado atual em 2026-08-05 porque a página já
> foi além do que a spec original descrevia (RBAC por vendedor, `paused`/
> `discarded`, evolução semanal — nenhum desses estava aqui). Detalhe completo
> da extensão por vendedor: `docs/features/seller-leads/prd.md`.

## 1. O que existe

**Backend** (`application/opportunities` + `presentation/http/opportunities`):

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/opportunities?limit&offset&search&stage` | lista (busca por nome/empresa/telefone; filtro por estágio; paginação) → `{ items, total }` |
| `GET` | `/opportunities/summary` | `[{ stage, count, value }]` — total e valor por estágio |
| `GET` | `/opportunities/evolution?weeks=N` | série semanal `{ weekStart, received, won }`, até 26 semanas |
| `GET` | `/opportunities/:id` | detalhe + `stageHistory` (histórico de mudança de estágio) |
| `POST` | `/opportunities` | cria (`stage` default `new`) |
| `PATCH` | `/opportunities/:id` | edita os campos (**mudança de estágio é ignorada aqui**) |
| `PATCH` | `/opportunities/:id/stage` | move de estágio `{ stage, reason?, pausedUntil?, discardReason? }` → grava histórico |
| `DELETE` | `/opportunities/:id` | exclui |

- Guard: `JwtAuthGuard + PermissionsGuard`, `@RequirePerm('opportunities')` (admin passa sempre).
- **Estágios:** `new`, `qualified`, `proposal`, `paused`, `won`, `lost`, `discarded`
  (`OPP_STAGES`, `opportunities.service.ts:7`). Estágio é `TEXT` no banco por
  design — sem migration de enum a cada estágio novo.
- **Escopo por vendedor (F6+):** toda query aceita `sellerScope`. O controller
  deriva do JWT — role `vendedor` → `user.sellerId` (sem `sellerId` → escopo
  `__none__`, não bate com nada, nunca vaza). Outras roles veem tudo.
- **`paused`:** aceita `pausedUntil` opcional (data pra retomar).
- **`discarded`:** exige `discardReason` válido (`sem_fit`, `sem_resposta`,
  `concorrente`, `outro`) — **obrigatório desde 2026-08-05** (era opcional;
  achado de revisão externa, ver `docs/reviews/2026-08-04-auditoria-arquitetura-seguranca.md`).
- Campos da oportunidade: `name`, `company`, `phone`, `contactId`, `conversationId`,
  `stage`, `interestScore`, `intent`, `summary`, `value` (Decimal), `assignedTo`
  (texto livre, legado), `assignedSellerId` (FK real, fonte da verdade),
  `pausedUntil`, `discardReason`, `createdAt`, `updatedAt`, `stageHistory`.
- Criação automática (`createFromLead`): idempotente por `conversationId`
  (fallback por `contactId`, só contra estágios ainda abertos — nunca revive
  `won`/`lost`/`discarded`). Disparada em lead quente (`leadScore ≥ 70` ou
  `intent === 'meeting_request'`); o handoff pro vendedor roda ANTES da
  criação, então `assignedSellerId` já nasce com o dono real do rodízio
  (`conversation-agent.service.ts:786-808`).

**Frontend** (`apps/frontend/src/pages/OpportunitiesPage.tsx`):

- Cards de resumo (`KpiCard`) por estágio, alimentados por `/opportunities/summary`.
- Gráfico de evolução semanal (recharts, carregado em chunk assíncrono —
  `OpportunitiesEvolutionChart.tsx`), alimentado por `/opportunities/evolution`.
- Lista via `StandardListPage`/`DataTable` — busca (debounce), filtro por
  estágio, paginação.
- Mudança de estágio **inline por `Select`** na linha — não é drag-and-drop
  (Kanban arrastável segue fora de escopo, ver `seller-leads/prd.md`).
- Mover para `paused`/`discarded` abre um modal dedicado que coleta
  `pausedUntil`/`discardReason` antes do PATCH — o botão "Descartar" fica
  desabilitado até um motivo ser escolhido (reforçado 2026-08-05 junto da
  obrigatoriedade no backend).
- Sair de `won`/`lost` (estágios finais) pelo dropdown pede confirmação —
  evita reabrir um negócio fechado com um clique errado.
- Criar/editar via modal (`POST`/`PATCH /:id`); excluir com `useConfirm()`.
- Rota `/opportunities` protegida por `Perm perm="opportunities"`
  (`app/App.tsx`); item de menu no grupo Vendas (`components/Layout.tsx`).

## 2. Casos de borda já tratados

- `value` nulo exibido como "—", não R$ 0,00 forçado.
- Estágio inválido: backend rejeita com 400; a UI só oferece os 7 válidos.
- Sem a permissão `opportunities`: rota redireciona ao fallback (`/inbox`).
- Vendedor sem `sellerId` cadastrado: escopo `__none__`, lista sempre vazia
  (nunca cai para "ver tudo" por engano).

## 3. Fora de escopo (ainda)

- Kanban com drag-and-drop entre colunas (hoje é dropdown por linha).
- Retomada automática de lead pausado quando `pausedUntil` vence (hoje é manual).
- Dashboard comparativo entre vendedores (hoje cada um vê só o próprio funil;
  visão agregada existe no `DashboardPage` geral, não aqui).

## 4. Relacionados

- Backend: `application/opportunities/opportunities.service.ts` +
  `presentation/http/opportunities/opportunities.controller.ts`.
- Extensão por vendedor (RBAC, `paused`/`discarded`, evolução): `docs/features/seller-leads/prd.md`.
- Padrão de lista: `docs/SPEC-LISTAS-FILTROS-CRUD.md`.
- Testes: `opportunities.service.spec.ts` (15 casos), `conversation-agent.service.spec.ts`
  (criação automática + propagação de `assignedSellerId`).
