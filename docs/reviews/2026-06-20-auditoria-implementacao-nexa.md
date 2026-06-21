# Auditoria de Implementação — Nexa

> **Data:** 2026-06-20  
> **Realizada por:** Orquestra Nexa  
> **Status:** ✅ Todos os itens implementados e entregues

---

## Resultado final

| # | Item | Status | Arquivo |
|---|------|--------|---------|
| NEXA-01 | Socket.io Redis Adapter | ✅ Implementado | `src/presentation/ws/conversations.gateway.ts` |
| NEXA-02 | Criptografia senhas SMTP/IMAP | ✅ Implementado | `src/shared/email-crypto/` (novo) |
| NEXA-03 | Supervisor: sanitização de input | ✅ Implementado | `src/application/agents/supervisor-agent.service.ts` |
| NEXA-04 | Exportação CSV contatos (LGPD) | ✅ Implementado | `src/presentation/http/contacts/contacts.controller.ts` |
| NEXA-05 | Anonimização por retenção (LGPD) | ✅ Implementado | `src/application/conversations/conversation-janitor.service.ts` |
| NEXA-06 | Webhooks outbound | ✅ Implementado | `src/application/webhooks/` (novo módulo) |
| NEXA-07 | PlanQuotaGuard | ✅ Implementado | `src/shared/guards/plan-quota.guard.ts` (novo) |
| NEXA-08 | Slow query logging Prisma | ✅ Implementado | `src/infra/prisma/prisma.service.ts` |
| MONITOR | Monitor Proativo TMS | ✅ Implementado | `src/application/monitor/` (novo módulo) |

---

## Detalhes de implementação

### NEXA-01 — Redis Adapter
`afterInit()` em `conversations.gateway.ts` configura `@socket.io/redis-adapter` via `REDIS_URL`.
Fail-open: sem a env, roda single-instance sem adapter.
Deps: `@socket.io/redis-adapter ^8.3.0` + `ioredis ^5.4.0`.

### NEXA-02 — Criptografia SMTP/IMAP
Novo `EmailCryptoService` em `src/shared/email-crypto/`. AES-256-GCM.
Chave: `EMAIL_ENCRYPTION_KEY` (hex 64 chars).
Formato: `ENC:<iv>:<tag>:<cipher>`. Migration-safe: aceita plaintext legado.
Integrado em: `email-channel.service.ts`, `email-imap.service.ts`, `email-reply.service.ts`, `waha-health.service.ts`.

### NEXA-03 — Sanitização de input
`customerMessage` truncado em 4.000 chars + padrões de injection substituídos por `[mensagem não pôde ser processada]`.
Padrões cobertos: "ignore previous instructions", ChatML, Llama tags, template injection, markdown header injection.

### NEXA-04 — Exportação LGPD
`GET /api/contacts/:id/export` → CSV com id, nome, telefone, email, empresa, leadStatus, status, tags, criadoEm, atualizadoEm.
Header `Content-Disposition: attachment`.

### NEXA-05 — Anonimização LGPD
Novo `@Interval(24h)` `anonymizeExpiredData()` no `ConversationJanitorService`.
Critério: `status = opted_out` + `updatedAt < now - DATA_RETENTION_DAYS` (padrão 730 dias).
Campos: name → "Anonimizado", phone → hash, email/company → null, tags → []. Lote: 500/ciclo.

### NEXA-06 — Webhooks Outbound
Novo módulo `src/application/webhooks/`. Tabelas: `webhook_subscriptions` + `webhook_deliveries`.
HMAC-SHA256 via `X-Nexa-Signature`. Retry backoff: 10s → 30s → 2min → 10min → 30min (5 tentativas).
Secret criptografado via `EmailCryptoService`.
Endpoints: `GET/POST /webhooks`, `PUT/DELETE /webhooks/:id`, `GET /webhooks/:id/deliveries`. Perm: `webhooks:manage`.

### NEXA-07 — PlanQuotaGuard
Tabela `plan_limits` (ausência = sem limite). HTTP 402 ao atingir cota.
Decorator: `@UsePlanQuota('contacts' | 'campaigns' | 'messages_month')`.
`messages_month` conta `AiMessage` desde início do mês corrente.

### NEXA-08 — Slow Query Logging
`$on('query')` em `PrismaService`. Loga queries acima de `PRISMA_SLOW_QUERY_MS` ms (padrão 500ms).

### Monitor Proativo
Feature flag: `MONITOR_ENABLED=true`. Módulo completo em `src/application/monitor/`:
- **MonitorService** `@Interval(30min)` → chama `GET /api/nexa/proactivity/events` no TMS via `HiperTmsConnector`, upsert `AlertState`, resolve stale.
- **ConsolidationService** `@Interval(15min)` → digest no `sendHour` (padrão 7h). Ordem: CRITICAL → OVERDUE → DUE_SOON → INFO. Arquiva com `notifyCount >= 2` sem resolução em 48h.
- **MonitorNotificationService** → orquestra canais, persiste `NotificationLog`.
- **WahaNotificationChannel** → Fase 1. Fase 2: Z-API/Twilio.
- Endpoints (perm `admin`): `GET/PUT /monitor/config`, `GET /monitor/alerts`, `POST /monitor/alerts/:id/snooze|resolve`, `POST /monitor/sync`.
- Frontend: `MonitorConfigPage.tsx` em `/settings/monitor`.
- Tabelas: `tenant_notification_configs`, `alert_states`, `notification_logs`.
