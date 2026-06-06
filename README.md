# Nexa

> **Plataforma de IA Comercial e Suporte para SaaS.** Vende, faz onboarding e dá suporte
> via WhatsApp, com IA (a **Lia**) e arquitetura de conectores multi-produto.
> Primeiro conector: HiperTMS.

**Estágio:** Sprint 1 (fundação de dados). Nome interno `nexa` (marca a definir).

---

## Documentação
A arquitetura completa (ADRs, PRDs, schema, roadmap, sprint plan) está em:
`./docs/` — começar por `docs/README.md` → `docs/ANALISE_CONSOLIDADA.md`.

---

## Stack
- Monorepo pnpm: `apps/backend` (NestJS), `apps/frontend` (React+Vite), `packages/*`
- PostgreSQL 16 + pgvector · Redis · Prisma
- IA: Claude (a "Lia"). Orquestração de agentes: Flowise (Sprint 11)

## Estrutura
```
apps/
  backend/   NestJS + Prisma   (Prisma já no Sprint 1; NestJS no Sprint 2)
  frontend/  React + Vite      (Sprint 7)
packages/
  shared/    utils comuns
  types/     tipos compartilhados
  sdk/       cliente da API
docker-compose.yml             PostgreSQL + Redis
```

---

## Como rodar (Sprint 1 — fundação de dados)

```bash
# 1. Subir banco e redis
pnpm db:up                 # docker compose up -d (Postgres :5433, Redis :6380)

# 2. Configurar env
cp .env.example .env       # ajustar se necessário

# 3. Instalar deps
pnpm install

# 4. Gerar client + migrar
pnpm db:generate
pnpm db:migrate            # cria as tabelas (Fase 1)

# 5. Seed inicial (produto HiperTMS + KB exemplo)
pnpm db:seed

# 6. Ver o banco
pnpm db:studio
```

> Portas 5433/6380 para NÃO conflitar com o MVP n8n (5432/6379), que continua rodando.

---

## Próximos passos (ver SPRINT_PLAN nos docs)
- Sprint 2: NestJS + Auth + logger/correlationId + backup
- Sprint 3: Conversas/Mensagens
- Sprint 4: Ações + Eventos
- Sprint 5-6: Conector HiperTMS + Billing
- Sprint 7+: Frontend, Suporte, Agentes

## Princípios (não violar)
- IA conversa e recomenda; **backend decide e executa**
- Não recriar billing — consumir o TMS (conector)
- Multi-tenant + correlationId + idempotência desde já
- Congelamento de escopo: nada novo no meio do sprint
