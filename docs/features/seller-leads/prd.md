# Seller leads panel (F6+) — approved 2026-07-20

> Approved by Abel. Sellers (2 for now) get a login-scoped view of THEIR leads
> with working stages, pause/discard control and weekly evolution analytics.
> Builds on the existing Opportunity funnel (F6) — no parallel structure.

## What exists (reused as-is)

Seller + round-robin handoff + WhatsApp notice; `User.role=vendedor` linked via
`User.sellerId`; Opportunity funnel (`new|qualified|proposal|won|lost`) with
`OpportunityStageHistory` audit; auto-create from hot lead (score ≥ 70);
`OpportunitiesPage` frontend.

## Changes

### 1. Ownership — `Opportunity.assignedSellerId` (FK → Seller)

- New nullable column + index `[tenantId, assignedSellerId]`. `assignedTo`
  (free text) stays for display/back-compat but is no longer the source of truth.
- `ConversationAgentService.handle`: seller handoff now runs BEFORE
  `createFromLead`, and the resulting `sellerId` is stored on the opportunity.
- Migration is additive (`ADD COLUMN IF NOT EXISTS`) — `prisma migrate deploy`.

### 2. Role scoping — vendedor sees only their leads

- Controller derives `sellerScope` from the JWT: role `vendedor` →
  `user.sellerId` (no sellerId → scope `__none__`, matches nothing, never
  leaks). Other roles → unscoped (admin/gestor see everything).
- Applies to: findAll, summary, findOne, update, moveStage, remove, evolution.
- Vendedor login permissions now include `'opportunities'` (SellersService
  create/update). Existing seller logins need a one-time permission refresh
  (re-save the seller in /sellers or SQL update).

### 3. New stages — `paused` and `discarded`

- `OPP_STAGES = [new, qualified, proposal, paused, won, lost, discarded]`.
  Stage is TEXT in the DB (by design) — no enum migration.
- `paused`: optional `pausedUntil` (date to resume). `discarded`: optional
  `discardReason` (`sem_fit | sem_resposta | concorrente | outro`) — reasons
  feed loss analysis later. Both stored on the opportunity + stage history.
- UI naming (PT): Novo, Qualificado, Proposta, Pausado, Ganho, Perdido,
  Descartado. "Em andamento" = new+qualified+proposal (KPI grouping only).

### 4. Analytics — `GET /opportunities/evolution?weeks=N`

- Weekly buckets (default 8): `received` (opportunities created in the week)
  × `won` (stage history entries `toStage='won'`). Scoped like everything else.
- Frontend: evolution chart (recharts) + KPI cards (recebidos, em andamento,
  fechados, taxa de fechamento) on OpportunitiesPage; page renders as
  "Meus leads" for role vendedor (backend enforces the scope regardless).

## Out of scope (phase 2)

Kanban drag-and-drop; auto-resume of paused leads (proactivity nudge when
`pausedUntil` arrives); manager comparison dashboard between sellers;
goal tracking.

## Acceptance

- [ ] Vendedor login lists/edits ONLY own opportunities (401-free, zero leak).
- [ ] Admin/gestor unchanged (see all).
- [ ] Hot lead → opportunity carries `assignedSellerId` of the notified seller.
- [ ] moveStage validates new stages; discard stores reason; pause stores date.
- [ ] Evolution endpoint returns weekly received×won respecting scope.
- [ ] `pnpm test:backend` green; frontend typecheck green; migrate deploy run by Abel.
