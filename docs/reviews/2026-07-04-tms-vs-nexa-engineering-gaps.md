# HiperTMS vs Nexa — Engineering Structure Gaps & Adoption Plan

> **For the implementation squads.** Compares the *engineering structure* of
> HiperTMS v12 (the mature reference codebase) with Nexa as of 2026-07-04, and
> defines what is worth adopting, what to defer, and what to skip — with
> viability and effort estimates. Business-feature gaps are NOT covered here
> (see `ANALISE_HIPERTMS_GAPS.md`, largely implemented since June: email
> channel ✓, proactive engine ✓, monitor ✓). Frontend UX gaps: see
> `reviews/2026-07-03-frontend-audit.md`.
>
> Method: parallel source inventory of both repos across 10 engineering
> dimensions. Date: 2026-07-04.

---

## 1. Comparison matrix

| Dimension | HiperTMS v12 | Nexa today | Gap severity |
|---|---|---|:-:|
| Backend tests | Jest, ~90 specs | Vitest, ~23 specs | Medium |
| Frontend tests | Vitest, 9 specs | **0 specs** (setup exists, Storybook only) | **High** |
| E2E | Playwright, `apps/e2e` (4 suites) | **None** | **High** |
| CI | lint + tests + build, blocking | lint **non-blocking**, backend tests only | Medium |
| CD | Docker + rolling deploy + **auto-rollback** + staging workflow | Docker + deploy + healthcheck (no rollback, no staging) | Medium |
| Authorization | CASL (policies-as-code) + JWT | `@RequirePerm` string permissions + JWT | Low |
| Error tracking | **Sentry** (api + web) | **None** | **High** |
| Logging | NestJS default | pino + correlationId (**Nexa is better**) | — |
| Health/metrics | health endpoint | 3 health endpoints + latency p50/p95 (**Nexa is better**) | — |
| File storage | DO Spaces (S3) abstraction w/ local fallback | Local disk + Docker volume | Medium |
| Frontend data grid | TanStack Table | Hand-rolled `DataTable` | Low-Med |
| Frontend architecture | Conventional (not FSD) | FSD migration 3/6 slices done | — |
| WebSocket | socket.io + Redis adapter | socket.io + Redis adapter (parity) | — |
| Multi-tenant | `@CurrentTenant` + Prisma where | EffectiveTenantInterceptor + acting-tenant + break-glass audit (**Nexa is better**) | — |
| Migrations | 155+, backfill-script discipline | 11, clean | — |
| Docs/ADRs | 39 ADRs, Storybook design system | 31 ADRs, Storybook, C4 (parity) | — |

Where Nexa is already ahead: structured logging with correlationId, health
endpoints, platform-admin acting model with break-glass audit. Do not "adopt"
the TMS pattern in these — TMS should eventually adopt Nexa's.

---

## 2. Adopt NOW (P1) — high value, low-to-medium effort

### 2.1 Sentry (error tracking) — effort: S (½ day)

TMS has Sentry on api and web; Nexa has none, which means production errors
are only visible if someone happens to read `docker logs`. Given Fase 4
(produção), this is the single highest-leverage adoption.

- Backend: `@sentry/node` in `main.ts` bootstrap + pino integration; DSN via
  env `SENTRY_DSN` (add to `validate-env.ts` as *optional-warn*, not required).
- Frontend: `@sentry/react` in `main.tsx` with `import.meta.env.VITE_SENTRY_DSN`.
- Copy the TMS wiring — same stack, direct translation.
- *Accept:* forced test error appears in Sentry project for api and web.

### 2.2 CI hardening — effort: S (½ day)

Nexa's `ci.yml` runs eslint non-blocking and skips frontend tests entirely.
TMS blocks on everything.

- Make lint blocking (fix existing violations first).
- Add `pnpm --filter frontend test` once 2.3 lands (even with few tests).
- Add `tsc --noEmit` for the frontend (cheap, catches the most common breakage).
- *Accept:* PR with type error or lint error fails CI.

### 2.3 Frontend unit tests — effort: M (1-2 days to seed, ongoing)

Zero specs today. Don't aim for coverage; seed the pattern with the highest-risk
pure logic first (all already extracted and testable):

1. `shared/lib/phone.ts`, `shared/lib/conversation.ts` (isSupportTicket)
2. `pages/SupportClientsPage` grouping/filter logic (extract to helper)
3. api interceptor break-glass flow (`shared/lib/api.ts`) with MSW
- *Accept:* ≥10 specs green in CI; squad convention documented in
  `docs/conventions/`.

### 2.4 Playwright smoke E2E — effort: M (2 days)

TMS has `apps/e2e`; Nexa's critical flows (login → inbox → reply; widget round
trip; campaign create) break silently today — the web-chat contract bug shipped
precisely because no E2E pinned the socket contract.

- New `apps/e2e` with Playwright, 3 smoke suites: auth+inbox, web-chat widget
  contract (socket events `web_chat:send {body}` / `web_chat:message`),
  campaign draft creation.
- Run on CI against docker-compose (backend + seeded Postgres + Redis).
- *Accept:* `pnpm test:e2e` green locally and on CI.

---

## 3. Adopt SOON (P2) — valuable, needs a trigger

### 3.1 DO Spaces storage abstraction — effort: M (2 days). Trigger: scaling or attachments in campaigns

Uploads live on a local Docker volume (`nexa-uploads`). Works single-node;
breaks the day there are 2 backend replicas, and volume loss = data loss.
Port the TMS storage module (S3 client + local fallback) as
`infra/storage/`; swap `sender.controller.ts` upload + `MEDIA_PUBLIC_BASE`
URL building. Viability: high — TMS module is directly reusable.

### 3.2 Deploy auto-rollback — effort: S-M (1 day). Trigger: first bad deploy in produção

TMS `deploy.yml` snapshots the previous image and rolls back automatically if
the healthcheck fails; Nexa's deploy just fails (as seen on 2026-07-04 — the
env-validation failure left prod on the old container by luck of ordering, not
by design). Port the `PREV_IMG` + retag + `up -d` recovery block from the TMS
workflow. Viability: high, copy-adapt.

### 3.3 Staging workflow — effort: M. Trigger: >1 dev deploying regularly

TMS has `deploy-staging.yml` + a staging DB. Nexa deploys master → production
directly. With Abel + Uelder both merging, a staging lane pays for itself.
Requires: staging containers on the droplet (RAM budget check first — droplet
already runs TMS prod + staging + Nexa).

### 3.4 TanStack Table — effort: M. Trigger: the ListPage pattern work (frontend audit §4)

Adopt inside the canonical `ListPage` extraction instead of as a standalone
refactor — replacing the hand-rolled `DataTable` per page while migrating
pages anyway. Skip if the current `DataTable` keeps meeting needs.

---

## 4. Defer / Skip (P3)

| Item | Decision | Rationale |
|---|---|---|
| CASL (policies-as-code) | **Defer** | Nexa's `@RequirePerm` strings + admin bypass cover current needs (few roles, coarse permissions). CASL pays off with per-resource ownership rules — revisit when sellers get row-level restrictions. Migration cost: high (touches every controller). |
| Prisma RLS / tenant row-level security | **Skip for now** | EffectiveTenantInterceptor + audited acting-writes already exceed TMS's model. RLS adds operational complexity on managed Postgres; revisit at >10 tenants. |
| 155-migration backfill discipline | **Adopt as convention only** | Nexa's schema churn is low; document the TMS backfill-script pattern in `docs/conventions/` for when hotdata/typed-column migrations appear (first case will be campaign delivery status). |
| SAST/DAST, dependabot | **Defer** | Neither repo has it; open a shared infra task instead of copying a gap. |

---

## 5. Suggested execution order (squad-sized tasks)

1. Sentry api+web (2.1) — unblock production visibility first
2. CI: lint blocking + front type-check (2.2)
3. Seed frontend unit tests (2.3) — merge with CI task
4. Playwright smoke + web-chat contract test (2.4)
5. Deploy auto-rollback (3.2)
6. Storage abstraction (3.1) — before campaign attachments ship
7. Staging lane (3.3), TanStack Table via ListPage (3.4) — opportunistic

Each of 1-5 is independently mergeable; none blocks feature work.
