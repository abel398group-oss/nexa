---
type: note
tags: [roadmap, fases, status]
updated: 2026-07-02
summary: Roadmap de implementação do Nexa — fases 0 a 9, o que está em produção e o que vem a seguir.
---
# Implementation Roadmap — Sistema de Leads / IA Autônoma

> Roadmap de implementação derivado dos PRDs, ADRs e Schema (todos aprovados).
> Reflete a arquitetura NOVA (NestJS + agentes + event bus + billing TMS).
> **Atualizado em 2026-06-26** — fases 0 a 5 implementadas e em produção. Monitor Proativo implementado.

**Última atualização:** 2026-06-26

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

## Fase 0 — MVP ✅ (concluído e migrado)
Inbound IA, Sender, Follow-up, Supervisor. Migrado de n8n para NestJS + Prisma em produção.

---

## Fase 1 — Hardening de produção ✅ (concluído)
- [x] API keys → env; senha WAHA → env
- [x] HTTPS; auth; firewall
- [x] Backup dos workflows no Git
- [x] Backup automático do PostgreSQL
- [x] CI/CD via GitHub Actions → DigitalOcean

---

## Fase 1.5 — Fundação de dados da IA ✅ (concluído)
- [x] PostgreSQL 16 + pgvector + Prisma em produção
- [x] 28 tabelas: conversas, mensagens, ações, eventos, KB, follow-up, e-mail, embeddings
- [x] Migrations versionadas

---

## Fase 2 — Backend NestJS ✅ (concluído)
- [x] Estrutura NestJS (application/presentation/infra/shared)
- [x] Auth JWT cookie HttpOnly + Refresh Token Rotation + CASL
- [x] Contacts, Conversations, Campaigns, Knowledge, Metrics, Email APIs
- [x] WebSocket (Socket.io) — ⚠️ Redis adapter pendente para escala horizontal

**Em produção.** Auditoria 2026-06-20 (`docs/reviews/2026-06-20-auditoria-implementacao-nexa.md`):
- [x] Swagger ativado em `main.ts`
- [x] Prisma pool: `connection_limit=20` na `DATABASE_URL` (parcial — sem log programático)
- [x] `@socket.io/redis-adapter` — fail-open via `REDIS_URL`
- [x] Criptografia `smtpPass`/`imapPass` — AES-256-GCM (`EmailCryptoService`)
- [x] Supervisor: sanitização de `customerMessage` — injection patterns bloqueados
- [x] Exportação CSV de contatos — `GET /contacts/:id/export` (LGPD art. 18)
- [x] Anonimização por retenção — `@Interval(24h)` no `ConversationJanitorService`
- [x] Webhooks outbound — módulo completo com HMAC-SHA256 + retry backoff
- [x] `PlanQuotaGuard` — tabela `plan_limits`, HTTP 402, decorator `@UsePlanQuota`
- [x] Slow query logging — `$on('query')` acima de `PRISMA_SLOW_QUERY_MS`ms
- [x] Monitor Proativo — módulo completo `apps/backend/src/application/monitor/`

---

## Fase 3 — Primeiro Conector (HiperTMS) ✅ (concluído)
- [x] Conector TMS implementado (tms-lookup.service + actions via API)
- [x] Enriquecimento automático de contato via TMS (ADR 020)
- [x] Campanhas com filtro TMS (ADR 024)
- [x] Handoff token para portal do cliente

---

## Fase 4 — Frontend MVP ✅ (concluído)
- [x] Inbox de conversas (WhatsApp Web style)
- [x] CRM de contatos
- [x] Dashboard com métricas
- [x] Campanhas
- [x] Configurações de canal (e-mail, WhatsApp)
- [x] TenantSelector (Platform Admin / break-glass)
- [x] Feature-Sliced Design implementado

---

## Fase 5 — Suporte TMS ✅ (concluído em grande parte)
- [x] KB importada e versionada (RAG com pgvector + multilingual-e5-small)
- [x] Agente de suporte (9 agentes: Router, SDR, Sales, Support, Diagnostic, Resolution, CaseClassifier, Escalation, Supervisor)
- [x] Escalação para humano
- [x] Separação Vendas × Suporte na UI
- [x] Portal de Suporte do cliente
- [~] Web chat embutido no TMS (ADR 027) — UI existe (ChatWidget + LiaChatWindow via polling 4s), Socket.IO real-time + SourceChannel.web_chat pendentes
- [ ] KB pendente: reindexação completa com HNSW após 1.000+ itens

**Em produção.**

---

## Fase 6 — Monitor Proativo TMS ✅ (concluído)
- [x] Motor de alertas automáticos (`apps/backend/src/application/monitor/`)
- [x] Consome eventos do módulo `proactivity` do TMS
- [x] Consolida por severidade (CRITICAL → OVERDUE → DUE_SOON → INFO)
- [x] Envia via WhatsApp (WAHA) — `WahaNotificationChannel`
- [x] Feature flag `MONITOR_ENABLED`
- [x] Frontend: `MonitorConfigPage` em `/settings/monitor`
- [ ] Monitor Frota (km, CNH, CRLV) — ADR-030, docs em `docs/monitor/squad-tms-frota.md`

**Em produção.**

---

## Fase 7 — IA Autônoma (agentes — ADRs 003/004/007)
- [ ] Router/Supervisor (valida entrada/saída)
- [ ] SDR Agent · Sales Agent · Onboarding Agent · Billing Agent
- [ ] Event Bus completo (DLQ, circuit breaker)
- [ ] Feature Flags por tenant (rollout faseado de autonomia)
- [ ] `AiQualityAudit` (Supervisora) + `AiCustomerHealth`
- [ ] Migração incremental do workflow Inbound (n8n) → agentes (Flowise)

**Entregável:** atendimento multiagente com governança.

---

## Fase 8 — Multi-tenant (virar SaaS)
Antes da escala. Schema já é multi-tenant-ready; aqui ativa-se isolamento e fluxos.
- [ ] Tenant isolation (toda query filtra tenant)
- [ ] Roles · Permissions (CASL)
- [ ] Tenant configuration
- [ ] Tenant branding

**Entregável:** múltiplos clientes isolados.

---

## Fase 9 — Escala
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

## Ordem resumida

```
0   — MVP ✅ em produção
1   — Hardening ✅ em produção
1.5 — Fundação de dados ✅ em produção
2   — Backend NestJS ✅ em produção
3   — Conector TMS ✅ em produção
4   — Frontend ✅ em produção
5   — Suporte TMS ✅ em produção (HNSW pendente)
6   — Monitor Proativo ✅ em produção (Monitor Frota pendente — ADR-030)
7   — IA Autônoma (Router/SDR/Sales/Onboarding)
8   — Multi-tenant completo
9   — Escala (Redis adapter, pool, API Meta)
```

> Sistema em produção desde 2026. Próximo foco: Monitor Frota (ADR-030) + Cotação WhatsApp (ADR-031).
