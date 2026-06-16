# Implementação — Página de Oportunidades (Pipeline de Vendas)

> O backend de **Opportunities** já existe (CRUD + summary + mover estágio), mas
> **não há tela**. Este doc especifica a `OpportunitiesPage` no frontend, consumindo
> a API pronta — no padrão de listas do projeto (`docs/SPEC-LISTAS-FILTROS-CRUD.md`).
>
> Escopo: **frontend do Nexa** + wiring (rota, menu, permissão). Backend **não muda**.
> Status: pronto para revisão · 2026-06

## 1. Contexto

Oportunidade = lead que virou negócio em andamento, com **estágios**
`new → qualified → proposal → won/lost`. São criadas manualmente ou **a partir de
lead quente** (`createFromLead`, ligado a uma conversa). Hoje o vendedor não tem
onde ver/gerir esse pipeline — falta a página.

## 2. Estado atual (o que JÁ existe)

**Backend pronto** (`application/opportunities` + `presentation/http/opportunities`):

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/opportunities?limit&offset&search&stage` | lista (busca por nome/empresa/telefone; filtro por estágio; paginação) → `{ items, total }` |
| `GET` | `/opportunities/summary` | `[{ stage, count, value }]` — total e valor por estágio |
| `GET` | `/opportunities/:id` | detalhe + `stageHistory` (histórico de mudança de estágio) |
| `POST` | `/opportunities` | cria (campos abaixo; `stage` default `new`) |
| `PATCH` | `/opportunities/:id` | edita os campos (**mudança de estágio é ignorada aqui**) |
| `PATCH` | `/opportunities/:id/stage` | move de estágio `{ stage, reason? }` → grava histórico |
| `DELETE` | `/opportunities/:id` | exclui |

- Guard: `JwtAuthGuard + PermissionsGuard`, **`@RequirePerm('opportunities')`** (admin passa).
- Estágios: `OPP_STAGES = ['new','qualified','proposal','won','lost']`.
- Campos da oportunidade: `name`, `company`, `phone`, `contactId`, `conversationId`,
  `stage`, `interestScore`, `intent`, `summary`, `value` (Decimal), `assignedTo`,
  `createdAt`, `updatedAt`, `stageHistory`.

**Frontend:** não existe `OpportunitiesPage`, rota nem item de menu.

## 3. Mudanças por camada (Frontend + wiring)

### 3.1. Página `apps/frontend/src/pages/OpportunitiesPage.tsx`

Seguir o **padrão canônico de listas** (referência: `ContactsPage`/`CampaignsPage`,
`docs/SPEC-LISTAS-FILTROS-CRUD.md` §4) + uma faixa de **resumo do pipeline**:

- **Resumo (topo):** cards por estágio com `count` e `value`, alimentados por
  `GET /opportunities/summary` (5 cards: Novo, Qualificado, Proposta, Ganho, Perdido).
- **Lista:** tabela com colunas `name`/`company`, `phone`, `stage` (badge),
  `interestScore`, `value`, `assignedTo`, `updatedAt`.
  - **Busca** (debounce) → `?search=`.
  - **Filtro por estágio** (`Select`) → `?stage=`.
  - **Paginação** (`limit/offset`, padrão `CampaignsPage`).
- **Criar/Editar:** mesmo `Modal` (modo create/edit) → `POST` / `PATCH /:id`.
  Form com os campos editáveis (name, company, phone, value, interestScore, summary,
  assignedTo). **Não** editar `stage` por aqui (a mudança de estágio é só pelo `/stage`).
- **Mover estágio:** ação dedicada (Select inline na linha ou no detalhe) →
  `PATCH /:id/stage { stage, reason? }`. Atualiza o resumo após mover.
- **Excluir:** `useConfirm()` + `DELETE /:id` + toast.
- **Detalhe (opcional, fase 2):** painel/rota `/opportunities/:id` mostrando dados +
  `stageHistory` (timeline de mudanças de estágio).
- Estados `EmptyState`/`LoadingState`/`ErrorState`; ações de escrita gated por permissão.
- Componentes do design system (`Table`, `Select`, `Modal`, `Badge`/`StatusBadge`,
  `Pagination`, `Button`, `Card`), `useConfirm`/`useToast`.

> **Estágio como badge:** reaproveitar/estender o mapa de cores tipo
> `conversation-status.ts` para os 5 estágios (sugestão: new=cinza, qualified=azul,
> proposal=âmbar, won=verde, lost=vermelho). Centralizar num helper, não espalhar.

### 3.2. Rota — `apps/frontend/src/App.tsx`

Dentro da área protegida (lazy import + `Perm`):

```tsx
const OpportunitiesPage = lazy(() => import('@/pages/OpportunitiesPage').then((m) => ({ default: m.OpportunitiesPage })));
// ...
<Route path="/opportunities" element={<Perm perm="opportunities"><OpportunitiesPage /></Perm>} />
```

### 3.3. Menu — `apps/frontend/src/components/Layout.tsx`

Adicionar item no grupo **Vendas** do `NAV_GROUPS` (junto de Inbox de Vendas,
Contatos, Disparo, Vendedores, Playbook):

```tsx
{ to: '/opportunities', label: 'Oportunidades', ic: 'dollar', perm: 'opportunities' },
```

(usar um ícone existente em `icons.tsx` — ex.: `dollar`/`trophy`; conferir o set.)

### 3.4. Permissão `opportunities`

- O backend exige `@RequirePerm('opportunities')` (admin passa sempre).
- Garantir que a permissão **`opportunities`** exista na lista de permissões
  atribuíveis a perfis/usuários (tela de Usuários) — senão só o admin enxerga.

### 3.5. Cliente HTTP

Chamadas via `lib/api` (axios, base `/api`). Cuidado com `value` (Decimal vem como
string/number no JSON) — formatar como moeda (R$) na UI e enviar número no payload.

## 4. Ordem de implementação

1. Página com **lista + busca + filtro de estágio + paginação** + cards de resumo.
2. **Criar/editar** (modal) + **excluir** (confirm).
3. **Mover estágio** (`/stage`) com atualização do resumo.
4. Rota + item de menu + permissão.
5. (Fase 2) Detalhe com `stageHistory`; (fase 3) visão **Kanban** arrastando entre
   colunas (cada drop = `PATCH /:id/stage`).

## 5. Critérios de aceite

- [ ] `/opportunities` lista as oportunidades do tenant com busca, filtro por estágio e paginação.
- [ ] Cards de resumo mostram `count` e `value` por estágio (de `/summary`).
- [ ] Criar/editar/excluir funcionam; editar **não** muda estágio.
- [ ] Mover estágio usa `PATCH /:id/stage` e o resumo reflete a mudança.
- [ ] Item de menu só aparece para quem tem a permissão `opportunities` (admin sempre).
- [ ] `value` exibido como moeda; estados vazio/carregando/erro presentes.

## 6. Casos de borda

- **Oportunidade criada de lead** (`createFromLead`, via conversa): aparece com
  `conversationId`/`contactId` — oferecer link para a conversa de origem (fase 2).
- **`value` nulo:** exibir "—" (não R$ 0,00 forçado).
- **Estágio inválido:** o backend rejeita (400) fora de `OPP_STAGES`; a UI só oferece os 5.
- **Permissão ausente:** sem `opportunities`, a rota redireciona ao fallback (`/inbox`).

## 7. Relacionados

- Backend: `application/opportunities/opportunities.service.ts` +
  `presentation/http/opportunities/opportunities.controller.ts`.
- Padrão de lista: `docs/SPEC-LISTAS-FILTROS-CRUD.md` · referência `CampaignsPage`/`ContactsPage`.
- `docs/architecture/frontend-architecture.md` · `docs/api/api-standards.md`.
