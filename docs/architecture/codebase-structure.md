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
  docker-compose.yml   PostgreSQL :5434 + Redis :6380 (+ WAHA :3018)
```

Package manager **pnpm 9**, Node >= 20. Scripts de banco no `package.json` raiz
(`db:up`, `db:generate`, `db:migrate`, `db:seed`, `db:studio`).

## Backend (`apps/backend/src`)

Arquitetura em camadas, influenciada por DDD (espelha o HiperTMS):

```
src/
  main.ts                 bootstrap: validateEnv + helmet, CORS, ValidationPipe, cookies, Swagger
  app.module.ts           composição dos módulos + guards + interceptor + logger + middleware
  application/<feature>/   regras de negócio (1 pasta por feature)
    agents/               router, sales, support, diagnostic, resolution,
                          escalation, case-classifier, conversation, supervisor
    actions/              action-policy.ts + actions.service (IA solicita, backend executa)
    connectors/           connector.interface.ts + hipertms.connector.ts
    contacts/ conversations/ events/ knowledge/ playbook/ handoff/
    followup/ sellers/ sender/ email/ whatsapp/ metrics/ notifications/
    opportunities/        pipeline de vendas (estágios new→qualified→proposal→won/lost)
    portal/               sessão + chamados do cliente (Portal de Suporte)
    monitor/              monitor de saúde do WAHA + alertas proativos (dual-channel email+WhatsApp)
    proactive-engine/     engine de SLA, follow-up e alertas antecipados
    integrations/         sync de planos TMS → Nexa (POST /integrations/plan-sync — ADR 033)
    webhooks/             recepção e roteamento de webhooks externos
    auth/ users/ admin/
  presentation/
    http/<feature>/       controllers + DTOs (boundary HTTP, prefixo /api)
                          inclui products/ (catálogo via Connector) e health/
    ws/                   gateways WebSocket (inbox em tempo real)
  infra/
    prisma/               PrismaModule / PrismaService
    tms/                  tms-lookup.service (leitura do HiperTMS)
  shared/                 transversais
    ai/                   anthropic.service (cliente Claude) + ai.module
    governance/           autonomy.service (kill switch)
    auth/                 jwt strategy/guard + permissions.guard (@RequirePerm)
                          + platform-admin.guard (admin sem tenant)
    tenant/               effective-tenant.interceptor (resolve tenant efetivo / acting-as)
    config/               validate-env (aborta boot em produção com segredo inseguro)
    audit/ middleware/    auditoria + correlationId
    dto/                  pagination.dto
    email-crypto/         criptografia de credenciais SMTP/IMAP em repouso
    waha/ decorators/ utils/
```

Regra de dependência: `presentation` → `application` → `infra`/`shared`. O
boundary HTTP não contém regra de negócio; serviços não conhecem detalhes de HTTP.

## Frontend (`apps/frontend/src`)

Ver `docs/architecture/frontend-architecture.md`. Resumo:

```
src/
  main.tsx App.tsx        roteamento (landing pública + área protegida)
  pages/        uma página por rota:
                Landing, Login, Dashboard (KPIs), Inbox (conversas + tempo real),
                SupportPage, SupportConfigPage, SupportDashboardPage, SupportClientsPage,
                MonitorConfigPage (config de alertas proativos — ADR 028/032),
                OpportunitiesPage (pipeline de vendas),
                EmailChannelSettingsPage (SMTP/IMAP por tenant),
                Contacts, Campaigns, Knowledge, Sellers, NumberHealth,
                Users, Playbook, DevTokensPage, portal/PortalPage
  components/
    ui/         design system próprio (~30 componentes) + stories (Storybook)
    conversation/  compostos do inbox/suporte (timeline, badges, métricas)
    Layout, HelpDrawer, GuidedTour
  app/
    providers/  Auth, Toast, Confirm, DateRange, Tenant (contexts React)
  lib/          api.ts (axios) + helpers (conversation-status, ticket-category)
.storybook/     configuração do Storybook (catálogo visual de UI)
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
