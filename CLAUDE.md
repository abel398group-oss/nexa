# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository.

> Communicate with the user in **Brazilian Portuguese**. Write documentation,
> code comments, and commit messages in **English**.

> **MANDATORY:** read and follow [`REGRAS-SQUAD.md`](./REGRAS-SQUAD.md) before any
> change. It contains hard rules (TMS↔Nexa contract, validation, error handling,
> commit gates) created after a production incident caused by AI agents. Its final
> checklist must be included when completing any task.

## Token efficiency — bash commands

Always pipe/filter bash output to minimize tokens in context:
- `git status` → `git status --short`
- `git log` → `git log --oneline -10`
- `git diff` → `git diff --stat` (full diff only when needed)
- Long outputs → pipe through `head -50` or `grep` for relevant lines
- Typecheck → capture only `error TS` lines, never full tsc output
- Never print full file contents when only a section is needed

## What this is

**Nexa** — a multi-tenant **AI commercial & support platform for SaaS**. It sells,
onboards and supports customers over WhatsApp (and e-mail) using an AI assistant
(**"Lia"**) and a multi-product **connector** architecture. First connector:
**HiperTMS**. Internal name `nexa` (brand TBD).

Core principle: **the AI talks and recommends; the backend decides and executes.**

Engineering principle: **the system must be proactive** — Lia and every agent should
anticipate the next step, surface risks before they escalate, and close loops without
waiting to be asked. When implementing any feature, ask: *"what would happen 5 minutes
after this runs?"* and handle it. Examples: if a conversation is about to breach SLA,
alert before it does; if a follow-up wasn't answered, re-engage; if a connector is
unreachable at boot, log a clear warning and degrade gracefully instead of silently
failing later. Claude (as dev agent) applies the same mindset to code: when fixing a
bug, scan for the same pattern nearby; when adding a feature, wire up the monitoring
for it; when touching a service, check that its lifecycle hooks are correct.

pnpm monorepo:

- `apps/backend` — backend: **NestJS + Prisma + PostgreSQL 16 (pgvector) + Redis**
- `apps/frontend` — frontend: **React 18 + Vite 5 + TypeScript + Tailwind 4**
- `packages/shared` · `packages/types` · `packages/sdk` — shared utils, types, API client

## Production environment (droplet hiperTMS)

- **Path**: `/root/nexa/` (compose file: `/root/nexa/docker-compose.production.yml`)
- **Containers Nexa**: `nexa-backend-1` (serviço: `backend`, porta `3001`) · `nexa-frontend-1` (serviço: `frontend`, porta `8081`) · `nexa-redis-1` · `nexa-waha-1`
- **Containers HiperTMS**: em `/root/hipertms_v12/docker-compose.production.yml` — **nunca tocar**
- **Migrations em prod**: `cd /root/nexa && docker compose -f docker-compose.production.yml exec backend npx prisma migrate deploy`
- **Restart backend**: `cd /root/nexa && docker compose -f docker-compose.production.yml restart backend`
- **Logs**: `cd /root/nexa && docker compose -f docker-compose.production.yml logs backend --tail=100`
- **Regra**: nunca usar `/opt/nexa` ou `/home/ueldermartin/hipervias/` para Nexa — não existe. Sempre `/root/nexa/`.

### Acesso SSH ao servidor de produção

- **NÃO há chave SSH privada** em `~/.ssh/` na máquina do Abel — tentativas de `ssh root@hipertms.com.br` via terminal/Desktop Commander falham com `Permission denied (publickey)`.
- **NÃO perguntar ao Abel sobre a chave SSH** — ele não sabe / ela não existe localmente.
- **Alternativa para logs em produção**: usar o **console web do DigitalOcean** → Droplets → hiperTMS → Console (terminal direto no browser, sem chave).
- **Alternativa para comandos no container**: via painel DO Console, rodar os comandos docker normalmente.

### Regra: sempre ler o .env de produção antes de sugerir adicionar variável

**Antes de mandar qualquer comando `echo ... >> .env` para produção, sempre pedir `cat /root/nexa/.env` primeiro** — a variável pode já estar lá. Nunca assumir que falta sem verificar.

### Limitações conhecidas do ambiente de produção

- **`psql` NÃO existe** no host nem nos containers — nunca tentar usar.
- **`apt-get` com falha de 404** — mirrors DigitalOcean/Ubuntu com pacotes desatualizados; não depender de instalar pacotes no host.
- **Prisma CLI NÃO está na imagem de produção** (devDependency removida no build). Para rodar prisma no container, instalar temporariamente: `docker exec nexa-backend-1 sh -c "npm install -g prisma@5.22.0 && prisma migrate deploy"`. Usar `migrate deploy` (nunca `migrate dev`) em prod.
- **SQL direto no banco**: sem psql, usar o módulo `pg` já disponível no container via Node.js. Banco é Postgres gerenciado DigitalOcean (SSL obrigatório). O `DATABASE_URL` usa `sslmode=require` que nas versões novas do pg é tratado como `verify-full` — adicionar `uselibpqcompat=true` na URL para compatibilidade:
  ```bash
  docker exec nexa-backend-1 node -e "
  const {Client}=require('pg');
  const url=process.env.DATABASE_URL.replace('sslmode=require','sslmode=require&uselibpqcompat=true');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  // ... queries aqui com try/catch por statement
  "
  ```
- **`prisma db push` falha** se algum índice já existir — preferir SQL manual com `IF NOT EXISTS` via node acima.
- **Banco**: Postgres gerenciado DigitalOcean, database `nexa`. Não está no docker-compose
  — é externo. O host completo está no `DATABASE_URL` (`.env`, fora do repositório) e no
  painel da DigitalOcean; não fica versionado desde que o repositório virou público.
- **`/home/ueldermartin/hipervias/docker-compose.yml`**: arquivo antigo do HiperTMS v1, ignorar completamente.

## Migration rule — production safety

**Never** run `prisma migrate reset`, `prisma db push`, or any destructive
command against the production database. Always use `prisma migrate deploy`,
which applies only new migrations without deleting existing data.

New migrations must always be **additive**. If a column or table needs to be
removed, write a dedicated migration and get approval before running it in
production.

### P1002 (advisory lock timeout) — a configuração, não um acidente

`migrate deploy` pode travar em `P1002` esperando `pg_advisory_lock(72707369)`.
Isso **não é um lock órfão para caçar e matar**. O Postgres gerenciado da DO tem
um **pool (PgBouncer) na frente** — dá para confirmar: as conexões do pool
aparecem em `pg_stat_activity` com `client_addr = 127.0.0.1`. O advisory lock do
Prisma é preso à SESSÃO, e com pool não há garantia de que quem pega a chave seja
quem devolve. Um deploy interrompido deixa a trava numa conexão do pool que segue
viva e sendo reusada.

A saída é pedir ao Prisma que não use o lock:

```
PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=true npx prisma migrate deploy
```

Ou, para valer sempre, a linha `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=true` no
`.env` (o Prisma CLI lê o `.env` sozinho) — local e produção, já que os dois
apontam para o mesmo banco atrás do mesmo pool.

**Não rode `pg_terminate_backend` na conexão que aparece segurando o lock.** Ela
é do pool, está em uso, e derrubá-la erra as requisições que estiverem em cima
dela — sem resolver, porque o próximo deploy interrompido vaza de novo.
`pg_advisory_unlock` de outra conexão também não serve: só solta lock da própria
sessão, e de fora devolve `false` calado. Diagnosticado em 16/08/2026.

## Database rule — Abel uses the production DB locally (ALWAYS)

**Abel's `apps/backend/.env` points directly to the DigitalOcean managed database.**
This is intentional and permanent — do not suggest changing it, do not replace it
with a local URL, do not suggest `pnpm db:up` to solve database issues.

- `DATABASE_URL` in `apps/backend/.env` → always the DO managed Postgres URL
- Never suggest "use local DB" or "run pnpm db:up" to fix database connection issues
- Migrations run against the real DO database — always use `prisma migrate deploy`,
  never `migrate dev` or `migrate reset`

**What DOES need to run locally (Docker):**
- **Redis** — runs locally on port 6388. Start with: `docker compose up -d redis`
  (or `pnpm db:up` which also starts WAHA and Postgres — Postgres container is
  unused but harmless)
- **WAHA** — local WhatsApp testing only. Not required for most dev tasks.

**The only rule that still applies:** never run destructive migrations (`reset`,
`db push`, `drop`) against the DO database. `migrate deploy` only.

## Ambientes de execução

Dois ambientes distintos — nunca confundir:

| Ambiente | Onde rodar comandos | Como acessar |
|----------|-------------------|--------------|
| **Local (dev)** | Terminal do VS Code ou Git Bash na máquina do Abel (`C:\Users\Hipervias - Abel\Documents\GitHub\nexa\`) | Direto no terminal |
| **Produção (DigitalOcean)** | Console web DO → Droplets → hiperTMS → Console | Sem SSH (sem chave); nunca via terminal local |

- Comandos `pnpm`, `nest`, `Remove-Item dist`, etc. → **local**
- **Shell local = PowerShell** — não usar `&&` (inválido no PS 5.1); usar `;` ou comandos separados. `rm -rf` vira `Remove-Item -Recurse -Force`.
- Comandos `docker compose`, `docker exec`, `docker logs` → **produção via DO Console**
- Erros com caminho `C:\Users\Hipervias - Abel\...` → são **locais**
- Erros com caminho `/root/nexa/` → são de **produção**

## WhatsApp / WAHA — regras críticas (leia antes de tocar em qualquer coisa de WhatsApp)

- **WAHA usa `latest` em produção** — cada redeploy pode puxar versão nova com formato de payload diferente. Nunca assuma que o formato do webhook é estável.
- **LID (anonimização do WhatsApp)**: o WhatsApp envia remetentes como `<id>@lid` em vez do número real. O campo `payload.from` contém o LID, NÃO o número. Para resolver o número real, use a API do WAHA `/api/contacts?session=default&contactId=<lid>`.
- **`resolveLidToPhone()` — campo correto é `data.id`, não `data.number`**: o WAHA retorna `{ "id": "5511999999999@c.us", "number": "234754356076551" }`. O `number` é só o user do LID (sem código de país — inválido como fone BR). O número real está em `id` (ex: `"5511999999999@c.us"` → pegar antes do `@`). **Nunca ler `data.number` como telefone definitivo.**
- **Ao tocar em `whatsapp.service.ts` / `normalize()` / `resolveLidToPhone()`**: sempre testar com mensagem real antes de commitar. O fluxo de rejeição silenciosa (sem log) é perigoso — adicione log explícito em qualquer novo early-return.
- **Não adicionar early-returns sem `this.logger.warn()`**: todo caminho de descarte de mensagem DEVE logar o motivo. Silently dropping messages é o pior cenário para debug em produção.

## Working agreement (read first)

- **Dev server & tooling**: Claude **may** start it (`pnpm dev`, backend
  `dev` on `:3001`, frontend `vite` on `:5174`) and `docker compose`
  (Postgres `:5434`, Redis `:6380`, WAHA `:3018`). The user often already keeps
  servers running with file-watch, so check for a running instance / port
  conflict before starting another. Ports are deliberately offset from the
  HiperTMS / n8n MVP (3000/5432/6379) so both can run side by side.
- **Database**: the hard "never touch the DB" rule applies **only to the HiperTMS
  database** — never run migrations/seed against it, ever. For the **Nexa** database,
  **`pnpm db:migrate` is forbidden — it is `prisma migrate dev`, and there is no local
  Nexa database.** This file's own "Database rule" says the `.env` points at production
  and always will, so `migrate dev` here means `migrate dev` against production. It does
  not fail on drift — it *offers to reset*, and reset drops the schema and recreates it
  empty. On 16/08/2026 that wiped the entire production database: 53 tables recreated in
  one contiguous block of OIDs, zero rows, the shadow database left behind in the
  cluster. The drift that triggered it had been introduced the day before by commit
  `a311226`, which declared two hand-made indexes in the schema.

  `apps/backend/scripts/guard-remote-db.mjs` now refuses the command when the host is
  not local, but the guard only covers the npm script — a hand-typed
  `npx prisma migrate dev` still gets through. **To add a migration: write the
  `migration.sql` by hand and apply it with `prisma migrate deploy`.** Never
  `migrate dev`, never `db push`, never `migrate reset` (ADR 013).
- **Git**: Claude may stage and commit on a branch without asking, but **must
  never push** without explicit authorization.
- **Commits**: follow **Conventional Commits** in English
  (`feat(agents): ...`, `fix(backend): ...`, `docs(ai): ...`).
- Free, no prompt: **reading and editing any project file**, plus build, tests,
  lint, type-check, and `prisma generate`.

## Build & test rule — MANDATORY

> **Every change must pass build and tests before being considered done.**
> No exceptions — not even "small" fixes or refactors.

### O que Claude roda no sandbox (gate automático)

Claude's sandbox has Node but **no `pnpm`** — testes e build completo só rodam localmente.
O que Claude **deve** rodar via `mcp__workspace__bash` antes de qualquer commit:

| Escopo alterado | Comando no sandbox |
|----------------|--------------------|
| Frontend | `node node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc --noEmit --project apps/frontend/tsconfig.json 2>&1 \| grep "error TS" \| grep -v "vite/client"` |
| Backend | ⚠️ **não roda no sandbox** — symlinks pnpm não resolvem no Linux. Abel roda `cd apps/backend ; pnpm build` localmente. |

Se houver **qualquer erro `error TS` no frontend** → corrigir antes de commitar. Zero tolerância.

### O que o usuário (Abel) deve rodar localmente antes de fazer push

```powershell
# Frontend — type-check, build e testes
pnpm typecheck                       # tsc --noEmit (atalho raiz)
pnpm --filter frontend typecheck     # idem
cd apps/frontend ; pnpm build        # tsc -b + vite bundle
pnpm test:frontend                   # vitest run (atalho raiz)
pnpm --filter frontend test          # idem

# Backend — build e testes
cd apps/backend ; pnpm build         # nest build
pnpm test:backend                    # vitest run (atalho raiz)
pnpm --filter backend test           # idem

# Lint backend
pnpm lint
```

**Regras:**
1. Claude roda o type-check do **frontend** no sandbox a cada mudança — sem exceção.
2. Se o type-check falhar → Claude corrige antes de commitar.
3. Claude instrui Abel a rodar `typecheck` + `build` + `test:frontend` + `test:backend` antes de qualquer push para produção.
4. Nunca commitar código com erros de TypeScript conhecidos ou testes quebrados.

## Commands

Run from the repo root unless noted. Package manager: **pnpm 9** (Node >= 20).

| Task | Command |
|------|---------|
| Bring up DB + Redis + WAHA | `pnpm db:up` |
| Tear down infra | `pnpm db:down` |
| Prisma client (no DB) | `cd apps/backend && pnpm prisma:generate` |
| **DB migrate (USER ONLY)** | `cd apps/backend && npx prisma migrate deploy` |
| **Seed (USER ONLY)** | `pnpm db:seed` |
| Prisma Studio | `pnpm db:studio` |
| Backend dev (`:3001`) | `cd apps/backend && pnpm dev` |
| Frontend dev (`:5174`) | `cd apps/frontend && pnpm dev` |
| **Frontend build** ⚠️ | `cd apps/frontend && pnpm build` |
| **Frontend type-check** ⚠️ | `pnpm typecheck` · ou `pnpm --filter frontend typecheck` |
| **Frontend tests** ⚠️ | `pnpm test:frontend` · ou `pnpm --filter frontend test` |
| **Backend build** ⚠️ | `cd apps/backend && pnpm build` |
| **Backend tests** ⚠️ | `pnpm test:backend` · ou `pnpm --filter backend test` |
| Lint (backend) | `pnpm lint` |

> ⚠️ **Windows — `prisma:generate` trava se o backend estiver rodando.**
> O NestJS mantém o arquivo `query_engine-windows.dll.node` bloqueado enquanto
> o processo estiver ativo. **Sempre avisar o usuário para parar o backend local
> antes de rodar `prisma:generate`**, e lembrar de reiniciá-lo depois.

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
area), Tailwind 4. Proprietary **design system** in `components/ui/` (~30
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
  `naming-conventions.md`).
- **TMS↔Nexa contract**: `apps/backend/docs/portal-api-contract.md` is the source of
  truth for the endpoints the TMS consumes (handoff token, portal session, portal
  routes, web-chat token) — keep it in sync with the DTOs. `docs/api/guia-integracao.md`
  covers the WhatsApp handoff flow.
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
