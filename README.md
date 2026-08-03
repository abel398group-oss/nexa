# Nexa

> **Plataforma de IA Comercial e Suporte para SaaS.** Vende, faz onboarding e dá suporte
> via WhatsApp, com IA (a **Lia**) e arquitetura de conectores multi-produto.
> Primeiro conector: HiperTMS.

**Estágio:** Fase 4 — em produção. Ver [`docs/overview/roadmap.md`](docs/overview/roadmap.md) para o histórico de fases. Nome interno `nexa` (marca a definir).

---

## ⚠️ Status atual — DOIS sistemas coexistindo (e este README está desatualizado)

Hoje existem **dois sistemas Nexa em paralelo** — não confundir:

1. **MVP em produção (n8n + WAHA + Claude Haiku)** — é o que está rodando de verdade,
   atendendo leads via WhatsApp agora. Descrito em `docs/overview/system-overview.md`.
   Status: pré-produção, com pendências de hardening (ver seção 9 daquele documento).
2. **Nova plataforma (este repo: NestJS + React + Prisma)** — `apps/backend` e
   `apps/frontend` **já existem e têm implementação substancial** (auth, agents, connectors,
   contacts, conversations, email, whatsapp, opportunities, portal, admin, etc. em
   `apps/backend/src/`) — **muito além do "Sprint 1 (fundação de dados)" declarado abaixo
   e em `docs/SPRINT_PLAN.md`.** Esse rótulo de estágio está desatualizado; a referência
   mais confiável do estado real do código é `CLAUDE.md` (raiz), que já descreve dev
   servers rodando (`:3001`/`:5174`), migrations e convenções em uso.

**Recomendação:** revisar/atualizar `Estágio` (linha abaixo), `docs/SPRINT_PLAN.md` e
`docs/overview/roadmap.md` para refletir o progresso real antes de usá-los para planejamento.
**Regra que segue válida:** o MVP n8n continua rodando e não deve ser desligado até a nova
plataforma assumir as funções equivalentes; para o sistema em produção hoje, ver
`docs/overview/system-overview.md`.

---

## Documentação
A arquitetura completa (ADRs, PRDs, schema, roadmap, sprint plan) está em:
`./docs/` — começar por `docs/README.md` → `docs/ANALISE_CONSOLIDADA.md`.

---

## Stack
- Monorepo pnpm 9: `apps/backend` (NestJS 10 + Prisma 5), `apps/frontend` (React 18 + Vite 5), `packages/*`
- PostgreSQL 16 gerenciado DigitalOcean + pgvector · Redis (local: :6388) · Prisma 5
- IA: Claude Haiku/Sonnet (a "Lia"). Agentes implementados em NestJS (sem Flowise).

## Estrutura
```
apps/
  backend/   NestJS 10 + Prisma 5 (API REST + WebSocket + agentes de IA + conectores)
  frontend/  React 18 + Vite 5   (painel: inbox, suporte, campanhas, dashboard, admin)
packages/
  shared/    utils comuns
  types/     tipos compartilhados
  sdk/       cliente da API
docker-compose.yml             Redis :6388 + WAHA :3018 (Postgres é gerenciado DO — externo)
```

> Ver `CLAUDE.md` para guia completo de dev (ports, commands, regras de banco, deploy).

---

## Como rodar (dev local)

```bash
# 1. Redis (necessário para backend)
docker compose up -d redis     # Redis :6388

# 2. Instalar deps
pnpm install

# 3. Gerar client Prisma
pnpm db:generate

# 4. Aplicar migrations (banco gerenciado DO — requer DATABASE_URL em apps/backend/.env)
pnpm db:migrate                # nunca migrate reset/push em produção

# 5. Seed
pnpm db:seed

# 6. Subir backend e frontend
cd apps/backend && pnpm dev      # :3001
cd apps/frontend && pnpm dev           # :5174
```

> ⚠️ `DATABASE_URL` em `apps/backend/.env` aponta para o banco gerenciado DO (produção).
> Ver `CLAUDE.md` para regras detalhadas de DB, PowerShell e produção.

---

## Fase 5 — backlog (próximas entregas)
- Testes de frontend (Vitest + Playwright)
- Rotação de segredos (ANTHROPIC_API_KEY)
- InboxPage — paginação com socket real-time
- Lint bloqueante no CI
- Reconhecimento de áudio (Whisper)
- Agendamento de reuniões (Google Calendar)
- Multi-tenant SaaS (outros conectores além do HiperTMS)

## Princípios (não violar)
- IA conversa e recomenda; **backend decide e executa**
- Não recriar billing — consumir o TMS (conector)
- Multi-tenant + correlationId + idempotência desde já
- Congelamento de escopo: nada novo no meio do sprint
