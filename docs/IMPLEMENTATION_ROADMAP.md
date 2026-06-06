# Implementation Roadmap — Sistema de Leads / IA Autônoma

> Roadmap de implementação derivado dos PRDs, ADRs e Schema (todos aprovados).
> Reflete a arquitetura NOVA (NestJS + agentes + event bus + billing TMS), não só o MVP n8n.
> **Nada implementado ainda** — referência para quando começar a construir.

**Última atualização:** 2026-06

**Princípio de priorização:** o maior risco hoje NÃO é arquitetura — é **construir coisas
demais antes de validar vendas reais**. Validar primeiro: lead → venda → pagamento → onboarding.
Analytics/Voice/Meta só depois disso funcionando.

**Importante:** o MVP n8n atual continua RODANDO em paralelo (30 leads/dia). O backend novo
é construído ao lado e vai absorvendo responsabilidades — não há "big bang".

---

## Pré-requisitos (decidir/validar ANTES de começar)
- [x] **Decisão:** leads = **plataforma independente** (ADR 009). TMS = 1º conector.
- [ ] Validar em runtime os endpoints de billing do TMS (ADR 008 checklist)
- [ ] Confirmar pgvector (ou remover `embedding` do schema)
- [ ] Definir interface `Connector` (na Fase 3 — Billing)

---

## Fase 0 — MVP atual ✅ (concluído)
Inbound IA, Sender, Follow-up, Supervisor em n8n. Single-tenant, 1 número, 30 leads/dia.

---

## Fase 1 — Hardening de produção
- [ ] API keys → env (revogar key exposta); senha WAHA → env
- [ ] HTTPS no webhook; auth no n8n; firewall
- [ ] **Backup dos workflows n8n no Git** (export JSON versionado)
- [ ] **Backup das credenciais do n8n**
- [ ] **Backup do Docker Compose**
- [ ] Backup automático do PostgreSQL

> Maior risco operacional hoje = Docker/volume/atualização do n8n falhar.

---

## Fase 1.5 — Fundação de dados da IA
Vem direto do `schema/schema.prisma`.
- [ ] PostgreSQL definitivo (+ pgvector se RAG) · Prisma · primeira migration
- [ ] `AiConversation`, `AiMessage`, `AiAction`
- [ ] `DomainEvent`, `EventDlq`
- [ ] `AiCustomerProfile`
- [ ] `AiKnowledgeBase`, `AiKnowledgeVersion`
- [ ] `AiBillingRequest`, `BillingEvent`, `PaymentStatusSync`

**Entregável:** fundação de dados da IA no banco.

---

## Fase 2 — Backend NestJS
- [ ] Estrutura NestJS (espelhar TMS: application/presentation/infra/shared)
- [ ] Auth (JWT cookie HttpOnly — ou reusar do TMS se módulo) + CASL
- [ ] Contacts API · Conversations API · Campaigns API
- [ ] Actions API (`ai_actions`) · Events API (outbox + worker)
- [ ] WebSocket (mensagens em tempo real)

**Entregável:** API que sustenta contatos, conversas, ações e eventos.

---

## Fase 3 — Primeiro Conector (HiperTMS) — ADR 008/009/010
O billing virou **parte do Connector**. Implementar o `HiperTmsConnector`.
Antes do frontend: a compra é via WhatsApp (self-checkout), não depende de tela.
- [ ] Interface `Connector` + registry `products` (HiperTMS = active)
- [ ] `getPlans()` → `GET /plans` (catálogo do TMS — fonte de verdade)
- [ ] `createPaymentRequest()` (IA solicita; backend chama TMS)
- [ ] `payment_link_created` → IA envia link
- [ ] `getPaymentStatus()` / `payment_confirmed` (webhook Asaas validado pelo TMS)
- [ ] `provisionAccess()` → `tenant_created` → libera acesso
- [ ] Reconciliação de billing (`payment_status_sync`)

**Entregável:** fluxo financeiro ponta a ponta (lead → pagamento → produto liberado),
via o primeiro Connector — pronto para plugar o próximo produto depois.

---

## Fase 4 — Frontend MVP
Primeiro a operação (o que o vendedor usa todo dia):
- [ ] Inbox de conversas (estilo WhatsApp Web)
- [ ] Conversas · CRM · Contatos
Depois:
- [ ] Dashboard · Campanhas · Saúde dos números

> O usuário compra pela operação, não pelo dashboard.

---

## Fase 5 — Suporte TMS
- [ ] Popular KB do TMS (extrair docs do hipertms_v12 → `ai_knowledge_base` + versões)
- [ ] Knowledge Service (retrieval da KB aprovada)
- [ ] Support Agent
- [ ] Escalação para humano
- [ ] Chatwoot (opcional — não necessário para validar o suporte)

**Entregável:** clientes tiram dúvidas sozinhos.

---

## Fase 6 — IA Autônoma (agentes — ADRs 003/004/007)
- [ ] Router/Supervisor (valida entrada/saída)
- [ ] SDR Agent · Sales Agent · Onboarding Agent · Billing Agent
- [ ] Event Bus completo (DLQ, circuit breaker)
- [ ] Feature Flags por tenant (rollout faseado de autonomia)
- [ ] `AiQualityAudit` (Supervisora) + `AiCustomerHealth`
- [ ] Migração incremental do workflow Inbound (n8n) → agentes (Flowise)

**Entregável:** atendimento multiagente com governança.

---

## Fase 7 — Multi-tenant (virar SaaS)
Antes da escala. Schema já é multi-tenant-ready; aqui ativa-se isolamento e fluxos.
- [ ] Tenant isolation (toda query filtra tenant)
- [ ] Roles · Permissions (CASL)
- [ ] Tenant configuration
- [ ] Tenant branding

**Entregável:** múltiplos clientes isolados.

---

## Fase 8 — Escala
- [ ] Pool de múltiplos números WhatsApp
- [ ] Aquecimento automático por fase
- [ ] NPS pós-venda
- [ ] Reconhecimento de áudio (Whisper)
- [ ] Agendamento Google Calendar
- [ ] (Avaliar) API oficial da Meta

---

## O que NÃO fazer agora (anti over-engineering)
Adiar até validar lead → venda → pagamento → onboarding:
- Analytics Agent · Voice Agent · API oficial da Meta · Kafka/RabbitMQ (Redis basta)

---

## Princípios que NÃO mudam
1. IA conversa e recomenda; **backend decide e executa** (ações críticas)
2. **Não recriar billing** — consumir o TMS (Asaas, planos, assinatura)
3. **Não over-engineer:** Redis (não Kafka), faseado, MVP primeiro
4. Multi-tenant + correlationId + idempotência desde o início (schema já pronto)
5. Autonomia por módulo (FAQ 100% ... cancelamento 0%)
6. Toda decisão financeira/identidade/acesso passa por validação rígida

---

## Ordem resumida (sem retrabalho)
```
0   — MVP atual ✅
1   — Hardening (+ backups)
1.5 — Fundação de dados da IA (Prisma + schema)
2   — Backend NestJS
3   — Billing TMS (fluxo financeiro)
4   — Frontend (Inbox/CRM primeiro, dashboard depois)
5   — Suporte TMS
6   — IA Autônoma (Router/SDR/Sales/Onboarding)
7   — Multi-tenant
8   — Escala
```

> A partir daqui, a documentação de arquitetura está encerrada e pronta para implementação.
