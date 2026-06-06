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
### Sprint 6 — Billing ✅ VALIDADO RODANDO (com stub do conector)
- [x] Tabelas: ai_billing_requests + billing_events + payment_status_sync (migration add_billing)
- [x] BillingService: createPaymentRequest (valida preço vs catálogo, máquina de estados)
- [x] Webhook /webhooks/asaas: valida ASSINATURA (rejeita sem token), confirma pagamento
- [x] Confirmação → provisionAccess + eventos payment_confirmed + tenant_created
- [x] Reconciliação (@Interval 60s) payment_status_sync
- [x] Testado: cobrança link_sent R$299; webhook sem assinatura REJEITADO; com assinatura→confirmed; eventos processados
- [x] Logs enxutos (singleLine)
- [ ] Conexão real TMS/Asaas → quando Uelder validar
### Sprint 7 — Frontend + Inbox ✅ VALIDADO VISUALMENTE
- [x] Scaffold React+Vite+TS+Tailwind (apps/frontend, proxy /api+/ws → :3001)
- [x] api.ts (axios withCredentials) + AuthContext (login/logout/me)
- [x] LoginPage (form admin@nexa.local) + InboxPage (lista conversas + thread + envio)
- [x] App.tsx (React Router: /login, /inbox protegida) + main.tsx
- [x] WebSocket no inbox (socket.io-client /ws) — mensagem volta em tempo real
- [x] Fix: alias `@/` faltava no vite.config (resolve.alias) → build exit 0 (119 módulos)
- [x] **VALIDADO NO NAVEGADOR**: login → inbox 6 conversas → abrir thread →
      enviar "Lia da Nexa" → bolha aparece via WS (screenshots conferidos)
### Sprint 8 — CRM (frontend) ✅ VALIDADO RODANDO
- [x] Layout com nav rail compartilhado (Inbox ↔ CRM ↔ sair) + rotas aninhadas
- [x] ContactsPage: tabela (nome/telefone/empresa/lead/origem) + busca + badge lead
- [x] Modal "Novo contato" (POST /contacts, valida phone BR, trata erros do backend)
- [x] App.tsx refatorado: Layout envolve /inbox e /contacts (Outlet)
- [x] Build exit 0; **VALIDADO NO NAVEGADOR**: CRM lista 6 → cadastra
      "Carlos Frete/Frete Rapido LTDA" → total 7, linha no topo, persistiu no banco
- [ ] Import CSV em lote na UI (backend /contacts/import já pronto) — futuro
### Sprint 9 — Knowledge Import ✅ VALIDADO RODANDO
- [x] connector.interface: + getKnowledge() (KnowledgeItem) — ADR 010
- [x] HiperTmsConnector: getKnowledge() STUB (5 FAQs reais: CT-e, precificação,
      planos, implantação, integrações)
- [x] KnowledgeService: findAll/findOne(+versões)/create(v1 não-aprovada)/
      importFromConnector (idempotente por tenant+title; gera nova versão se conteúdo mudou)/
      addVersion/approveVersion (transação: aprova + vira conteúdo fonte-de-verdade ADR 011)
- [x] 6 rotas /knowledge (GET, GET/:id, POST, POST import/:productCode, POST /:id/versions,
      POST versions/:id/approve)
- [x] Frontend KnowledgePage: lista + "Importar TMS" + detalhe + versões/aprovar; nav KB
- [x] **VALIDADO (API)**: import 5 criados → reimport idempotente 0/0 → aprovar v1 (reviewer+approvedAt)
- [x] **VALIDADO (UI)**: importou 5, abriu "CT-e", clicou Aprovar → "v1 ✓ aprovada · admin"
- [ ] Embeddings/pgvector (busca semântica) — Sprint 10
### Sprint 10 — Knowledge Service + Support Agent (Lia) ✅ VALIDADO RODANDO
- [x] KnowledgeService.retrieve(): RAG textual (título>tags>tópico>conteúdo, top-N) — pgvector depois
- [x] SupportAgentService.ask(): retrieval → prompt persona Lia → Claude Haiku (fetch nativo)
- [x] Guardrails: usa SÓ as fontes; sem KB → escala humano (não alucina)
- [x] Kill switch + ADR 012: autonomia OFF → gera RASCUNHO; ON+confiança alta → auto-envia
- [x] Fallback gracioso: se Claude falhar (key inválida/timeout) → resposta da fonte top-1 (confidence low)
- [x] Rota POST /agent/ask
- [x] Frontend: botão "✨ Lia" no inbox (sugere resposta da última msg do cliente + mostra fontes/confiança)
- [x] **VALIDADO (API)**: Q1 planos→fonte "Planos", Q2 fora-da-KB→escala humano, Q3 implantação→fonte certa
- [x] **VALIDADO (UI)**: ✨ Lia preencheu rascunho + barra "fontes: Tempo de implantação"
- [x] ✅ ANTHROPIC_API_KEY REAL configurada (apps/backend/.env — atenção: backend lê esse, não o root)
      → Lia respondendo com Claude Haiku DE VERDADE (confidence high, tom consultivo/vendas,
        faz pergunta de qualificação, respeita fontes). Testado Q planos + Q CT-e.
- [ ] Embeddings/pgvector p/ busca semântica (hoje é textual)
### Sprint 11 — Router + Sales Agent ✅ VALIDADO RODANDO
- [x] AnthropicService compartilhado (shared/ai, @Global) + AiModule — complete()/completeJson()
- [x] RouterAgent: classifica intent + leadScore (0-100) + roteia (sales/support/human/optout)
      opt-out por REGRA (precedência, sem IA, LGPD); fallback heurístico se Claude cair
- [x] SalesAgent: consultiva, usa catálogo de planos (connector) + KB, sugere próximo passo
      (ACTION=none|create_payment|schedule_meeting|handoff_human) — NÃO executa (ADR 012)
- [x] ConversationAgent (orquestrador): route → despacha p/ agente → auto-envia se autonomia ON
- [x] Rota POST /agent/handle (pipeline completo)
- [x] Frontend: botão ✨ Lia agora usa /agent/handle e mostra agente/intent/score/ação
- [x] **VALIDADO (IA real)**: frota 20 caminhões→sales/pricing/score 75; erro CT-e cliente→support/15;
      "falar com humano"→human/handoff; "PARAR"→optout/0 (regra)
- [ ] Flowise (orquestração visual) — opcional, não bloqueia
- [ ] Sprint 12 — Onboarding + Supervisora + Kill Switch (enforcement)
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
