# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository.

> Communicate with the user in **Brazilian Portuguese**. Write documentation,
> code comments, and commit messages in **English**.

## What this is

**Nexa** — a multi-tenant **AI commercial & support platform for SaaS**. It sells,
onboards and supports customers over WhatsApp (and e-mail) using an AI assistant
(**"Lia"**) and a multi-product **connector** architecture. First connector:
**HiperTMS**. Internal name `nexa` (brand TBD).

Core principle: **the AI talks and recommends; the backend decides and executes.**

pnpm monorepo:

- `apps/backend` — backend: **NestJS + Prisma + PostgreSQL 16 (pgvector) + Redis**
- `apps/frontend` — frontend: **React 18 + Vite 5 + TypeScript + Tailwind 3**
- `packages/shared` · `packages/types` · `packages/sdk` — shared utils, types, API client

## Production environment (droplet hiperTMS)

- **Path**: `/root/nexa/` (compose file: `/root/nexa/docker-compose.production.yml`)
- **Containers Nexa**: `nexa-backend-1` (serviço: `backend`, porta `3001`) · `nexa-frontend-1` (serviço: `frontend`, porta `8081`) · `nexa-redis-1` · `nexa-waha-1`
- **Containers HiperTMS**: em `/root/hipertms_v12/docker-compose.production.yml` — **nunca tocar**
- **Migrations em prod**: `cd /root/nexa && docker compose -f docker-compose.production.yml exec backend npx prisma migrate deploy`
- **Restart backend**: `cd /root/nexa && docker compose -f docker-compose.production.yml restart backend`
- **Logs**: `cd /root/nexa && docker compose -f docker-compose.production.yml logs backend --tail=100`
- **Regra**: nunca usar `/opt/nexa` ou `/home/ueldermartin/hipervias/` para Nexa — não existe. Sempre `/root/nexa/`.

## Working agreement (read first)

- **Dev server & tooling**: Claude **may** start it (`pnpm dev`, backend
  `start:dev` on `:3001`, frontend `vite` on `:5174`) and `docker compose`
  (Postgres `:5433`, Redis `:6380`, WAHA `:3018`). The user often already keeps
  servers running with file-watch, so check for a running instance / port
  conflict before starting another. Ports are deliberately offset from the
  HiperTMS / n8n MVP (3000/5432/6379) so both can run side by side.
- **Database**: the hard "never touch the DB" rule applies **only to the HiperTMS
  database** — never run migrations/seed against it, ever. For the **Nexa** database,
  Claude **may** run migrations and seed locally when the user asks (`pnpm db:migrate`,
  `pnpm db:seed`). Caveat: Claude usually has **no production `.env`** and may not be
  able to reach the user's running Nexa DB from its sandbox — in that case it writes
  the Prisma schema change + migration and asks the user to run it. In staging/prod
  use `prisma migrate deploy`, **never** `migrate dev` (ADR 013).
- **Git**: Claude may stage and commit on a branch without asking, but **must
  never push** without explicit authorization.
- **Commits**: follow **Conventional Commits** in English
  (`feat(agents): ...`, `fix(backend): ...`, `docs(ai): ...`).
- Free, no prompt: **reading and editing any project file**, plus build, tests,
  lint, type-check, and `prisma generate`.

## Commands

Run from the repo root unless noted. Package manager: **pnpm 9** (Node >= 20).

| Task | Command |
|------|---------|
| Bring up DB + Redis + WAHA | `pnpm db:up` |
| Tear down infra | `pnpm db:down` |
| Prisma client (no DB) | `pnpm db:generate` |
| **DB migrate (USER ONLY)** | `pnpm db:migrate` |
| **Seed (USER ONLY)** | `pnpm db:seed` |
| Prisma Studio | `pnpm db:studio` |
| Backend dev (`:3001`) | `cd apps/backend && pnpm start:dev` |
| Frontend dev (`:5174`) | `cd apps/frontend && pnpm dev` |
| Frontend build | `cd apps/frontend && pnpm build` |

API docs (Swagger) at `http://localhost:3001/api/docs` (disabled in production).

## Architecture

### Backend (`apps/backend/src`)

Layered / DDD-influenced, mirroring the HiperTMS structure:

- `application/<feature>/` — services and business logic, one folder per feature
  (`agents`, `actions`, `connectors`, `contacts`, `conversations`, `events`,
  `knowledge`, `playbook`, `handoff`, `followup`, `sellers`, `sender`, `email`,
  `whatsapp`, `metrics`, `notifications`, `opportunities` (sales pipeline),
  `portal` (customer support portal), `auth`, `users`, `admin`).
- `presentation/http/<feature>/` — controllers + DTOs (HTTP boundary). All routes
  are under the global prefix `/api`.
- `presentation/ws/` — WebSocket gateways (real-time inbox via socket.io).
- `infra/prisma/` — `PrismaModule` / Prisma access. `infra/tms/` — TMS lookup.
- `shared/` — cross-cutting: `ai/` (Anthropic client), `governance/` (autonomy
  kill switch), `auth/` (JWT guard, permissions guard, **platform-admin guard**),
  `tenant/` (**EffectiveTenantInterceptor** — resolves effective/acting tenant),
  `config/` (**validateEnv** — boot-time secret check), `audit/`, `waha/`
  (WhatsApp client), `middleware/` (correlationId), `dto/` (pagination),
  `decorators/`, `utils/`.

Cross-cutting tech (wired in `app.module.ts` / `main.ts`): boot-time env
validation (`validateEnv`), JWT auth with HttpOnly cookies, role + permission
guard (RBAC, `@RequirePerm`), `@nestjs/throttler` rate limiting (100 req/min/IP),
Helmet, restricted CORS, Swagger, structured logging (pino) with `correlationId`,
`EventEmitter` + `@nestjs/schedule`, and a global `EffectiveTenantInterceptor`.
Multi-tenant: `tenantId` always derived from the authenticated context, never
from the request body or the lead's message. The **platform admin** (`tenantId
=== null`) may act on a tenant via the validated `x-acting-tenant-id` header;
writes are audited and irreversible actions need an `x-acting-override`
("break-glass"). See `docs/features/platform-admin/` and
`docs/security/security-overview.md`.

### The AI layer (Lia)

- **Multiple specialized agents** (`application/agents/`) coordinated by a
  Router/Supervisor: router, sales, support, diagnostic, resolution, escalation,
  case-classifier, conversation, supervisor. See `docs/ai/ai-agents.md` and
  ADR 003. No agent calls another agent directly — everything goes through the
  Router; external actions go through the backend.
- **Action policy** (`application/actions/action-policy.ts`, ADR 012): irreversible
  actions (refund, cancel_subscription, alter_contract, …) require a human; the
  AI can only *request* actions, the backend validates and executes.
- **Autonomy kill switch** (`shared/governance/autonomy.service.ts`): a runtime
  panic button that disables AI autonomy.
- **Anthropic client** (`shared/ai/anthropic.service.ts`): model from `AI_MODEL`
  (default `claude-haiku-4-5-20251001`), with token/cost tracking.

### Frontend (`apps/frontend/src`)

React 18 + Vite. `axios` (`lib/api.ts`) for HTTP, `socket.io-client` for the
real-time inbox, `react-router-dom` 6 for routing (public landing + protected
area), Tailwind 3. Proprietary **design system** in `components/ui/` (~30
components, dark mode via `html.dark` — ADR 002 / ADR 014) documented in
**Storybook** (`pnpm storybook`, `.storybook/`). `pages/` (one per route),
`components/conversation/` (inbox/support composites), `contexts/` (Auth, Toast,
Confirm, DateRange), `lib/` (api client + helpers). See
`docs/architecture/frontend-architecture.md`.

## Documentation map

The `docs/` tree is the source of truth — consult it before large changes:

- **Index & navigation**: `docs/README.md`.
- **Decisions (ADRs)**: `docs/adr/` — numbered ADRs per domain (agents, event bus,
  security, knowledge base, connectors, environment, support, …). Read the relevant
  ADR before touching that domain; add/update one for significant decisions.
- **AI layer**: `docs/ai/` (`ai-agents.md`, `ai-guardrails.md`, `rag-architecture.md`,
  `context-engineering.md`, `memory-strategy.md`, `ai-review-process.md`).
- **Feature PRDs**: `docs/features/**/prd.md` and `docs/prd/`.
- **API standards**: `docs/api/` (`api-standards.md`, `error-handling.md`,
  `naming-conventions.md`) and `docs/api-contract.md`.
- **Security**: `docs/security/` (`security-overview.md`, `secrets-management.md`).
- **Architecture**: `docs/architecture/` (`codebase-structure.md`,
  `frontend-architecture.md`, C4 diagrams) and `docs/overview/system-overview.md`.
- **Database**: `docs/schema/` (`schema.prisma`, `migrations.md`, `runtime.md`).
- **Domain glossary**: `docs/domain/glossary.md`.
- **Infra**: `docs/infra/` (`deploy.md`, `ci-cd.md`, `prisma-migrations.md`).
- **Templates**: `docs/_templates/` (adr, feature-prd, nota).

## Conventions

- TypeScript throughout; ESLint enforced.
- Multi-tenant by default; backend is the authority for identity, tenant, role.
- Follow the patterns of neighboring files (naming, structure, comment density).
- Prefer extending existing feature modules over creating parallel structures.
- After changes, validate with the relevant build / test / type-check / lint
  command before considering the work done.
