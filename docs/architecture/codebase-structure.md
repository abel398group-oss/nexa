# Estrutura do Código — Nexa

> Como o monorepo está organizado e onde cada coisa vive. Para a visão de runtime,
> ver `docs/overview/system-overview.md` e os diagramas C4.

## Monorepo (pnpm workspaces)

```
nexa/
  apps/
    backend/    NestJS + Prisma (API, agentes de IA, conectores)
    frontend/   React + Vite (painel de operação da Lia)
  packages/
    shared/     utils comuns
    types/      tipos compartilhados
    sdk/        cliente da API
  docs/         documentação (fonte de verdade)
  docker-compose.yml   PostgreSQL :5433 + Redis :6380 (+ WAHA :3018)
```

Package manager **pnpm 9**, Node >= 20. Scripts de banco no `package.json` raiz
(`db:up`, `db:generate`, `db:migrate`, `db:seed`, `db:studio`).

## Backend (`apps/backend/src`)

Arquitetura em camadas, influenciada por DDD (espelha o HiperTMS):

```
src/
  main.ts                 bootstrap: helmet, CORS, ValidationPipe, cookies, Swagger
  app.module.ts           composição dos módulos + guards + logger + middleware
  application/<feature>/   regras de negócio (1 pasta por feature)
    agents/               router, sales, support, diagnostic, resolution,
                          escalation, case-classifier, conversation, supervisor
    actions/              action-policy.ts + actions.service (IA solicita, backend executa)
    connectors/           connector.interface.ts + hipertms.connector.ts
    contacts/ conversations/ events/ knowledge/ playbook/ handoff/
    followup/ sellers/ sender/ email/ whatsapp/ metrics/ notifications/
    auth/ users/ admin/
  presentation/
    http/<feature>/       controllers + DTOs (boundary HTTP, prefixo /api)
    ws/                   gateways WebSocket (inbox em tempo real)
  infra/
    prisma/               PrismaModule / PrismaService
    tms/                  tms-lookup.service (leitura do HiperTMS)
  shared/                 transversais
    ai/                   anthropic.service (cliente Claude) + ai.module
    governance/           autonomy.service (kill switch)
    auth/                 jwt strategy/guard + permissions.guard (@RequirePerm)
    audit/ middleware/    auditoria + correlationId
    dto/                  pagination.dto
    waha/ decorators/ utils/
```

Regra de dependência: `presentation` → `application` → `infra`/`shared`. O
boundary HTTP não contém regra de negócio; serviços não conhecem detalhes de HTTP.

## Frontend (`apps/frontend/src`)

Ver `docs/architecture/frontend-architecture.md`. Resumo:

```
src/
  main.tsx App.tsx
  pages/        uma página por tela (Inbox, Contacts, Campaigns, Knowledge, ...)
  components/   Layout, HelpDrawer, GuidedTour, ui/ (primitivos), conversation/
  contexts/     Auth, Toast, Confirm, DateRange
  lib/          api.ts (axios) + helpers (conversation-status, ticket-category)
```

## Banco de dados

Prisma + PostgreSQL 16 (pgvector). Schema e migrações em
`apps/backend/prisma/` (espelhados em `docs/schema/`). Migrações versionadas por
timestamp — ver `docs/infra/prisma-migrations.md`.

## Convenções

- TypeScript em todo o monorepo; importar pelos barrels dos packages.
- Preferir estender módulos de feature existentes a criar estruturas paralelas.
- Nomenclatura: ver `docs/api/naming-conventions.md`.

## Relacionados

- `docs/architecture/c4-container.md` · `docs/architecture/c4-component.md`
- `docs/overview/system-overview.md` · `CLAUDE.md`
