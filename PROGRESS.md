# Progresso — Nexa (construção)

> Acompanhamento do que foi feito e o que falta. Atualizado a cada passo.
> Última atualização: 2026-06

---

## ✅ FEITO

### Pré-Sprint / Setup
- [x] Decisões ETAPA 0 (ambientes só local, billing depois, monorepo, localhost)
- [x] Nome: **Nexa** (plataforma) + **Lia** (a IA)
- [x] Monorepo criado (`GitHub/nexa/`)
- [x] Estrutura: apps/backend, apps/frontend, packages/{shared,types,sdk}
- [x] docker-compose.yml (PostgreSQL 16+pgvector :5433, Redis :6380)
- [x] .env.example, .gitignore, package.json (pnpm workspace)
- [x] Documentação movida para `nexa/docs/` (autocontido)
- [x] git init

### Sprint 1 — Fundação de dados (parcial)
- [x] schema.prisma (Fase 1: 10 tabelas core + enums)
- [x] seed.ts (produto hipertms + KB exemplo)

---

## ⏳ EM ANDAMENTO / PRÓXIMO

### Sprint 1 — VALIDADO ✅ (rodou de verdade)
- [x] `pnpm db:up` (Postgres :5433 + Redis :6380 no ar)
- [x] pnpm instalado via corepack/npm + `pnpm install` (bcrypt nativo compilou)
- [x] `prisma migrate` → 14 tabelas criadas
- [x] `prisma db seed` → admin + produto hipertms + KB
- [x] Build NestJS (exit 0) + API sobe na :3001

### Sprint 2 — Backend NestJS (em andamento)
- [x] Scaffold NestJS (estrutura modular: application/presentation/infra/shared)
- [x] main.ts (porta 3001, prefixo /api, cors+credentials) + app.module + config
- [x] Prisma module/service
- [x] Health endpoint (/api/health — com check de db + kill switch)
- [x] CorrelationId middleware + logger estruturado (pino)
- [x] tsconfig + nest-cli.json
- [x] Auth (JWT cookie HttpOnly + refresh com rotação + revogação de sessão)
- [x] Models User/Session/AuditLog no schema
- [x] Audit log (AuditService global + log no login)
- [x] Endpoints: POST /auth/login, /auth/refresh, /auth/logout, GET /auth/me
- [x] JwtStrategy (lê cookie) + JwtAuthGuard + @CurrentUser/@CurrentTenant
- [x] Seed: usuário admin (admin@nexa.local / admin123)
- [x] **VALIDADO RODANDO**: /api/health ok, login 201 (cookies HttpOnly), /me 200, sem cookie 401, audit log gravado, sessão criada
- [ ] Kill switch enforcement (flag exposta no health; bloqueio real com os agentes)
- [ ] Backup + teste de restore

### Correções feitas durante a validação
- [x] Add `pino-pretty` (faltava p/ logger dev)
- [x] Add `class-validator` + `class-transformer` (faltava p/ ValidationPipe)

---

### Sprint 3 — Contatos + Conversas + Mensagens ✅ VALIDADO RODANDO
- [x] Model Contact (migration add_contacts)
- [x] PaginationQueryDto (limit/offset/search)
- [x] Contacts: CRUD + import em lote (upsert por phone)
- [x] Conversations: criar (gera correlationId), listar, get
- [x] Messages: adicionar (in/out) + histórico
- [x] 18 rotas mapeadas; fluxo completo testado (login→contato→conversa→msgs→histórico)
- [x] WebSocket (tempo real) — VALIDADO: cliente recebe mensagem instantânea
      (gateway /ws + EventEmitter message.created; testado roundtrip completo)

### Sprint 4 — Ações + Event Bus + DLQ ✅ VALIDADO RODANDO
- [x] Action Policy (ADR 012): ações × backend × humano
- [x] ActionsService (request com idempotência + validação de policy)
- [x] Ação permitida → executa + publica evento; irreversível → blocked (REQUIRES_HUMAN)
- [x] Outbox: EventsService.publish → domain_events
- [x] Worker (@Interval 5s) processa outbox → emite domain.<tipo> → processed
- [x] DLQ + retry/backoff (2s/8s/30s → event_dlq após 3 tentativas)
- [x] Enum ActionType expandido (migration) + testado: create_payment executed, refund blocked, outbox processed, DLQ vazia

## 📋 FILA (próximos sprints)
### Sprint 5 — Conector HiperTMS (base) ✅ VALIDADO RODANDO
- [x] Interface Connector (ADR 010): healthCheck/getPlans/createPaymentRequest/getPaymentStatus/provisionAccess/suspendAccess
- [x] HiperTmsConnector (STUB — getPlans mock; healthCheck reporta "aguardando Uelder"; createPaymentRequest lança ServiceUnavailable se não configurado = fallback)
- [x] ConnectorsService (registry por productCode, lê products table)
- [x] Endpoints: GET /products, GET /products/:code/health, GET /plans
- [x] Testado: produto listado, health honesto (false até configurar TMS), planos R$89/299/599
- [ ] Conexão REAL com TMS → quando Uelder validar (preencher .env TMS_API_BASE_URL+TOKEN)
- [ ] Sprint 6A/6B — Billing (cobrança + confirmação) ← PRÓXIMO
- [ ] Sprint 7 — Frontend + Inbox
- [ ] Sprint 8 — CRM
- [ ] Sprint 9 — Knowledge Import (KB do TMS)
- [ ] Sprint 10 — Knowledge Service + Support Agent
- [ ] Sprint 11 — Agentes: Router + Sales (Flowise)
- [ ] Sprint 12 — Onboarding + Supervisora + Kill Switch
- [ ] Sprint 13 — Observabilidade
- [ ] Sprint 14+ — Multi-tenant + Escala

---

## 🔑 Decisões travadas (não reabrir)
- Plataforma independente (TMS = 1º conector) · ADR 009/010
- pgvector já no Sprint 1 · Redis (não Kafka) · Docker Secrets→DO
- Flowise não bloqueia Sprints 1-10
- Congelamento de escopo (nada novo no meio do sprint)
- IA recomenda, backend executa

## ⚠️ Pendências externas
- [ ] Validar conexão de billing do TMS com o Uelder (antes de plugar real)
- [ ] Hardening de segurança antes do 1º disparo real (ver docs/AUDITORIA_TECNICA_N8N.md)
- [ ] Domínio (nexalia.com / nexa.com.br) — decisão de marketing
