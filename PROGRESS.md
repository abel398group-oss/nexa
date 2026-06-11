# Progresso — Nexa (construção)

> Acompanhamento do que foi feito e o que falta. Atualizado a cada passo.
> Última atualização: 2026-06

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

### ⏳ FASE 3 — Paridade com n8n (pra poder DESLIGAR o n8n)
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
- [ ] Desligar webhook do n8n no WAHA (Nexa assume sozinho) — quando Abel validar o Nexa

### Ajuda contextual ✅ — botão "? Ajuda" na topbar abre painel deslizante com o "como usar" DAQUELA tela
(HelpDrawer.tsx, conteúdo por rota: dashboard/inbox/contacts/knowledge/sellers/campaigns; passos numerados + dica). VALIDADO.
+ Mini-demo ANIMADA em loop (HelpDemo.tsx, animação CSS) em TODAS as 6 telas — "janelinha" que passa os passos
  sozinha (cursor/caret/pop + barra de progresso), tipo GIF. VALIDADO em todas.
+ TOUR GUIADO (GuidedTour.tsx) — 1ª vez (localStorage nexa_tour_done) destaca menu/Inbox/Disparo/Vendedores/Ajuda/
  killswitch com cartão Próximo/Anterior/Pular + anel pulsante. Botão 🎓 Tour na topbar repete. VALIDADO.

### KPIs de vendedores + anexo na campanha + quantidade de disparo ✅ (2026-06-07)
- KPI vendedores: conversa ganha/perdida (botão no inbox ✅Ganhou/❌Perdeu → outcome); GET /metrics/sellers
  (leads, em andamento, ganhos, perdidos, % conversão); tabela "Desempenho de vendas" na tela Vendedores. VALIDADO.
- Campanha com ANEXO: upload PDF/Word (POST /campaigns/upload → uploads/ servido em /uploads, URL host.docker.internal)
  + LINK opcional (vai no fim do texto) + WahaClient.sendFile envia o arquivo após o texto. UI: file input + link.
- Campanha QUANTIDADE: sendLimit (radio Todos / Só N) + mostra limite diário; worker para ao atingir. VALIDADO (cap em 1).

### 🎉 PARIDADE COM N8N ATINGIDA — Nexa já faz tudo que o n8n faz (+ inbox/dashboard/governança)

### ⏳ FASE 4 — Produção
- [ ] Hardening de segurança (ver docs/reviews/2026-06-05-auditoria-tecnica-n8n.md)
- [ ] Deploy DigitalOcean (ficar 24/7)
- [ ] Liberar allowlist do WAHA (enviar p/ clientes reais)
- [ ] Validar billing real do TMS (com Uelder)
- [ ] Domínio (nexalia.com / nexa.com.br)

### 🔮 FASE 5 — Escala (futuro)
- [ ] Multi-tenant, embeddings/pgvector, Flowise

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
### Sprint 12 — Supervisora IA + Kill Switch ✅ VALIDADO RODANDO
- [x] SupervisorAgent: audita rascunho antes de enviar (alucinação, preço inventado, tom,
      promessa exagerada, prompt-injection). Hard-blocks por regex (garantia/100%/vitalício).
      Conservador: se IA da supervisora cair → NÃO aprova (exige humano).
- [x] Ajuste fino: vendedora passa allowedFacts (catálogo de planos + KB) p/ supervisora não
      reprovar venda legítima; prompt aceita pergunta de qualificação como correta
- [x] AutonomyService (kill switch runtime, @Global) + GET/POST /admin/autonomy (com audit log)
- [x] Orquestrador: auto-envio exige TUDO — autonomia ON + confiança alta + sem handoff +
      supervisora aprovou. Senão devolve rascunho + blockedReason.
- [x] Frontend: botão kill switch na nav (🤖 IA ON / ⏸️ IA OFF) liga/desliga em runtime
- [x] **VALIDADO (API)**: OFF→bloqueia auto-envio; ON+venda legítima→supervisora aprova(low)+auto-envia;
      hard-block de garantia→reprova(high). Toggle ON/OFF persistindo + audit log.
- [x] **VALIDADO (UI)**: botão "⏸️ IA OFF"→clica→"🤖 IA ON" (backend confirma); voltei p/ OFF (seguro)
- [ ] Onboarding pós-pagamento (welcome flow) — pendente (billing/provision já existe)
### Sprint 13 — Observabilidade ✅ VALIDADO RODANDO
- [x] Captura de tokens/custo: AnthropicService.completeWithUsage (input/output + custo est.)
      preço configurável (AI_PRICE_IN/OUT); SupportAgent migrado p/ AnthropicService compartilhado
- [x] addMessage estendido: metadata (aiGenerated/agent/risk) + tokensIn/out + estimatedCostUsd
- [x] MetricsService.overview: contatos (leadStatus, opt-outs), conversas, mensagens
      (in/out/aiGerada + % autônoma), tokens+custo, KB, billing, eventos+DLQ
- [x] Rota GET /metrics/overview + Frontend DashboardPage (nav 📊, auto-refresh 10s)
- [x] **VALIDADO**: 2 respostas autônomas → aiGerada=2 (18%), tokens 1007/186, custo US$0.0019;
      dashboard mostra 7 contatos, 6 conversas, 21 msgs, KB 5, 18% IA, DLQ 0
- [ ] Métricas por período + gráfico temporal — futuro

## 🎉 MVP COMPLETO (Sprints 1-13) — backend + frontend validados rodando

### Conector WhatsApp (WAHA → Nexa) ✅ ENDPOINT VALIDADO (falta plugar o WAHA)
- [x] WhatsappService: normalize() replica lógica validada do n8n (fix @lid, opt-out, validação BR)
- [x] process(): ignora fromMe → upsert contato → opt-out (LGPD) → acha/cria conversa aberta →
      grava inbound (WebSocket→inbox) → se autonomia ON, Lia responde sozinha
- [x] POST /webhooks/waha (público, token opcional via WAHA_WEBHOOK_TOKEN); tenant 'default'
- [x] **VALIDADO (payload simulado)**: msg normal→inbox; autonomia ON→Lia auto-responde;
      "PARAR"→contato opted_out. ZERO toque no WAHA/n8n até aqui.
- [x] PLUGADO (paralelo): WAHA session config c/ 2 webhooks [n8n + Nexa]. Sessão reconectou
      sem QR (auth salva). Inbound real do celular do Abel chegou no Nexa ✅.
      WAHA container alcança Nexa via http://host.docker.internal:3001/api/webhooks/waha.

### Emissor de saída (Nexa → WAHA → WhatsApp) ✅ VALIDADO RODANDO
- [x] WahaClientService (shared/waha, @Global): sendText via POST /api/sendText (session/chatId/text no body)
- [x] Allowlist de segurança (WAHA_SEND_ALLOWLIST) — só envia real p/ números listados (evita spam nos fakes)
- [x] addMessage outbound → dispara WAHA automaticamente (manual OU Lia autônoma), failsafe try/catch
- [x] .env backend: WAHA_API_URL=http://localhost:3018, WAHA_API_KEY, WAHA_SESSION=default,
      WAHA_SEND_ALLOWLIST=5512988073788 (só Abel por enquanto)
- [x] **VALIDADO**: WAHA sendText retornou msg ID p/ 5512988073788 (chegou no zap do Abel)
- [ ] ⚠️ ATENÇÃO: n8n AINDA responde em paralelo → cliente recebe resposta DOBRADA se Nexa autonomia ON.
      Antes de ligar Nexa autônomo p/ valer: remover webhook do n8n da session config do WAHA.
- [ ] Outbound do n8n não aparece no Nexa (WAHA só manda evento 'message' = inbound). OK por ora.

- [ ] Sprint 14+ — Multi-tenant + Escala (futuro)

---

## 🔑 Decisões travadas (não reabrir)
- Plataforma independente (TMS = 1º conector) · ADR 009/010
- pgvector já no Sprint 1 · Redis (não Kafka) · Docker Secrets→DO
- Flowise não bloqueia Sprints 1-10
- Congelamento de escopo (nada novo no meio do sprint)
- IA recomenda, backend executa

## ⚠️ Pendências externas
- [ ] Validar conexão de billing do TMS com o Uelder (antes de plugar real)
- [ ] Hardening de segurança antes do 1º disparo real (ver docs/reviews/2026-06-05-auditoria-tecnica-n8n.md)
- [ ] Domínio (nexalia.com / nexa.com.br) — decisão de marketing
