# Progresso — Nexa (construção)

> ⚠️ **ARQUIVO HISTÓRICO** — Este documento registra o diário de construção (Sprints 1-13).
> Não é fonte de verdade do estado atual. Para o estado atual consulte:
> - `CHANGELOG.md` — o que está em produção
> - `docs/IMPLEMENTATION_ROADMAP.md` — fases e próximos passos
> - `docs/reviews/2026-06-26-auditoria-docs-vs-codigo.md` — última auditoria
>
> Última atualização real: 2026-06 (Sprints 1-13 concluídos, sistema em produção)

---

## 🗺️ CHECKLIST VIVO (visão rápida)

### ✅ FASE 1 — MVP da plataforma (Sprints 1-13) — CONCLUÍDA
- [x] Auth, CRM, Conversas+WebSocket, Action Policy, Event bus/DLQ, Conector TMS, Billing
- [x] Frontend (Login, Inbox, CRM, KB, Dashboard)
- [x] IA: Support + Router + Sales + Supervisora + Kill Switch
- [x] Observabilidade (tokens/custo/métricas)

### ✅ FASE 2 — Conector WhatsApp — CONCLUÍDA
- [x] WAHA → Nexa (inbound real validado)
- [x] Nexa → WAHA (outbound real validado, com allowlist)

### ✅ FASE 3 — Paridade com n8n — CONCLUÍDA (n8n desligado)
- [x] **Bloco A — Vendedores/Handoff** ✅
- [x] **Bloco B — Sender** ✅
- [x] **Bloco C — number_pool** ✅
- [x] **Bloco D — Follow-up** ✅

### ✅ FASE 4 — Produção — CONCLUÍDA
- [x] Hardening de segurança (auditoria 2026-06-20)
- [x] Deploy DigitalOcean (CI/CD via GitHub Actions)
- [x] Domínio configurado
- [x] Monitor Proativo TMS (v1.0.0)

### 🔮 FASE 5 — Próximo (ver ROADMAP)
- [ ] Monitor Frota (ADR-030)
- [ ] Cotação WhatsApp (ADR-031)
- [ ] Multi-tenant, HNSW pgvector

---

## Diário de construção (Sprints 1-13)

> Detalhes históricos de cada sprint abaixo. Preservados para referência.

### ✅ FASE 1 — MVP da plataforma (Sprints 1-13) — CONCLUÍDA
- [x] Auth, CRM, Conversas+WebSocket, Action Policy, Event bus/DLQ, Conector TMS, Billing
- [x] Frontend (Login, Inbox, CRM, KB, Dashboard)
- [x] IA: Support + Router + Sales + Supervisora + Kill Switch
- [x] Observabilidade (tokens/custo/métricas)

### ✅ FASE 2 — Conector WhatsApp — CONCLUÍDA
- [x] WAHA → Nexa (inbound real validado)
- [x] Nexa → WAHA (outbound real validado, com allowlist)

### FASE 3 — Paridade com n8n (pra poder DESLIGAR o n8n)
- [x] **Bloco A — Vendedores/Handoff** ✅ (schema Seller+SellerNotification+assignedSellerId;
      round-robin balanceado; notifica vendedor no WhatsApp; dedup por conversa; hook no orquestrador
      (lead quente score≥70 OU human → handoff); tela Vendedores + badge no inbox. VALIDADO: lead score 85
      → atribuído + notificado, assignedCount=1, badge "→ Vendedor")
- [x] **Bloco B — Sender** ✅ (Campaign + CampaignTarget; template c/ {{nome}}; worker @Interval dispara
      respeitando horário/limite/delay; cria conversa+outbound (vai pro WhatsApp+inbox); pula opted_out;
      tela Disparo c/ progresso. VALIDADO: campanha disparou em ~12s, chegou no zap)
- [x] **Bloco C — number_pool** ✅ (SenderNumber: limite diário 30, reset diário, horário comercial 7h-19h,
      delay anti-ban 30s entre envios. VALIDADO: pool 1/30 hoje, gate de horário/limite no worker)
- [x] **Bloco D — Follow-up** ✅ (FollowUp: cadência 24h/72h configurável; worker @Interval respeita
      horário comercial; agenda no disparo; PARA quando lead responde/opt-out; personaliza {{nome}};
      2 estágios. VALIDADO: followup_1 disparou + parou ao receber resposta)
- [x] n8n desligado — Nexa assumiu sozinho

### Ajuda contextual ✅ — botão "? Ajuda" na topbar abre painel deslizante com o "como usar" DAQUELA tela
(HelpDrawer.tsx, conteúdo por rota: dashboard/inbox/contacts/knowledge/sellers/campaigns; passos numerados + dica). VALIDADO.
+ Mini-demo ANIMADA em loop (HelpDemo.tsx, animação CSS) em TODAS as 6 telas — "janelinha" que passa os passos
  sozinha (cursor/caret/pop + barra de progresso), tipo GIF. VALIDADO em todas.
+ TOUR GUIADO (GuidedTour.tsx) — 1ª vez destaca menu/Inbox/Disparo/Vendedores/Ajuda/killswitch com cartão Próximo/Anterior/Pular + anel pulsante. Botão 🎓 Tour na topbar repete. VALIDADO.

### KPIs de vendedores + anexo na campanha + quantidade de disparo ✅ (2026-06-07)
- KPI vendedores: conversa ganha/perdida (botão no inbox ✅Ganhou/❌Perdeu → outcome); GET /metrics/sellers
  (leads, em andamento, ganhos, perdidos, % conversão); tabela "Desempenho de vendas" na tela Vendedores. VALIDADO.
- Campanha com ANEXO: upload PDF/Word (POST /campaigns/upload → uploads/ servido em /uploads, URL host.docker.internal)
  + LINK opcional (vai no fim do texto) + WahaClient.sendFile envia o arquivo após o texto. UI: file input + link.
- Campanha QUANTIDADE: sendLimit (radio Todos / Só N) + mostra limite diário; worker para ao atingir. VALIDADO (cap em 1).

### 🎉 PARIDADE COM N8N ATINGIDA — Nexa já faz tudo que o n8n faz (+ inbox/dashboard/governança)

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

### Sprint 3 — Contatos + Conversas + Mensagens ✅ VALIDADO RODANDO
- [x] Model Contact (migration add_contacts)
- [x] PaginationQueryDto (limit/offset/search)
- [x] Contacts: CRUD + import em lote (upsert por phone)
- [x] Conversations: criar (gera correlationId), listar, get
- [x] Messages: adicionar (in/out) + histórico
- [x] 18 rotas mapeadas; fluxo completo testado (login→contato→conversa→msgs→histórico)
- [x] WebSocket (tempo real) — VALIDADO: cliente recebe mensagem instantânea

### Sprint 4 — Ações + Event Bus + DLQ ✅ VALIDADO RODANDO
- [x] Action Policy (ADR 012): ações × backend × humano
- [x] ActionsService (request com idempotência + validação de policy)
- [x] Outbox: EventsService.publish → domain_events
- [x] Worker (@Interval 5s) processa outbox → emite domain.<tipo> → processed
- [x] DLQ + retry/backoff (2s/8s/30s → event_dlq após 3 tentativas)

### Sprint 5 — Conector HiperTMS (base) ✅ VALIDADO RODANDO
- [x] Interface Connector (ADR 010)
- [x] HiperTmsConnector implementado e conectado
- [x] ConnectorsService (registry por productCode)

### Sprint 6 — Billing ✅ VALIDADO RODANDO (com stub do conector)
- [x] BillingService: createPaymentRequest (máquina de estados)
- [x] Webhook /webhooks/asaas: valida ASSINATURA
- [x] Reconciliação (@Interval 60s)

### Sprint 7 — Frontend + Inbox ✅ VALIDADO VISUALMENTE

### Sprint 8 — CRM (frontend) ✅ VALIDADO RODANDO

### Sprint 9 — Knowledge Import ✅ VALIDADO RODANDO

### Sprint 10 — Knowledge Service + Support Agent (Lia) ✅ VALIDADO RODANDO
- [x] ANTHROPIC_API_KEY REAL configurada → Lia respondendo com Claude Haiku DE VERDADE

### Sprint 11 — Router + Sales Agent ✅ VALIDADO RODANDO

### Sprint 12 — Supervisora IA + Kill Switch ✅ VALIDADO RODANDO

### Sprint 13 — Observabilidade ✅ VALIDADO RODANDO

## 🎉 MVP COMPLETO (Sprints 1-13) — backend + frontend validados rodando

### Conector WhatsApp (WAHA → Nexa) ✅ PLUGADO E VALIDADO EM PRODUÇÃO
- [x] WhatsappService processando inbound real
- [x] Nexa → WAHA → WhatsApp: mensagens chegando no celular

---

## 🔑 Decisões travadas (não reabrir)
- Plataforma independente (TMS = 1º conector) · ADR 009/010
- pgvector já no Sprint 1 · Redis (não Kafka) · Docker Secrets→DO
- Flowise não bloqueia Sprints 1-10
- Congelamento de escopo (nada novo no meio do sprint)
- IA recomenda, backend executa

## ⚠️ Pendências externas
- [ ] Validar conexão de billing do TMS com o Uelder (antes de plugar real)
- [ ] Domínio (nexalia.com / nexa.com.br) — decisão de marketing
