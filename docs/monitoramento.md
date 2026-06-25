# Nexa — Plano de Monitoramento

**Criado:** 2026-06-22 | **Atualizado:** 2026-06-24
**Contexto:** Pré-lançamento comercial TMS
**Repo:** `apps/backend/src/application/monitor/`

---

## O que está monitorado hoje

| Serviço | Como | Frequência | Canais de alerta |
|---|---|---|---|
| **WhatsApp (WAHA)** | `WahaHealthService` — poll + webhook | 3 min | Painel + e-mail + WhatsApp admin |
| **Alertas TMS** | `MonitorService` — sinc proatividade | 30 min | WhatsApp/e-mail no horário configurado |
| **Database** | `GET /health/ready` → `SELECT 1` | On-demand | — (retorna 503) |
| **Redis** | `GET /health/ready` → `redis.ping()` | On-demand | — (retorna 503) |
| **AI Kill switch** | `GET /health` → `aiAutonomyEnabled` | On-demand | — |
| **API Anthropic** | `AnthropicService.getStats()` → `GET /health` | On-demand | — (contador de falhas) |
| **Startup config** | `validateEnv()` em `main.ts` | No boot | Trava o processo se faltar |
| **TMS Connector** | `HiperTmsConnector.onModuleInit()` | No boot | Log de erro se TMS não responder |


---

## Gaps — status atual

### ✅ MON-001 — Redis no /health/ready — IMPLEMENTADO
`health.controller.ts` — `redisOk()` checa Redis em `GET /health` e `GET /health/ready`.
Retorna 503 se Redis estiver down. Exposto também no `GET /health` geral.

---

### ✅ MON-002 — API Anthropic — IMPLEMENTADO
`AnthropicService` — `failureCount`, `_lastFailAt`, `recordFailure()`, `getStats()`.
Exposto em `GET /health` → campo `ai: { failureCount, lastFailAt }`.

---

### ✅ MON-003 — Env vars críticas no startup — IMPLEMENTADO
`apps/backend/src/shared/config/validate-env.ts` — `validateEnv()` chamada em `main.ts`.
Bloqueia boot em produção se variável obrigatória estiver ausente, curta ou com valor placeholder.
Inclui testes em `validate-env.spec.ts`.

---

### ✅ MON-005 — TMS Connector offline — IMPLEMENTADO
`HiperTmsConnector.onModuleInit()` — pinga o TMS no boot.
Loga sucesso ou erro. Fallback seguro: retorna `null` sem quebrar o fluxo.

---

### ✅ MON-004 — Canal de e-mail — IMPLEMENTADO (checagem passiva)
`health.controller.ts` — `smtpConfigured()` verifica se existe `emailChannel` ativo no banco.
Exposto em `GET /health` → campo `smtp: 'configured' | 'not_configured'`.
*(Nota: verificação ativa com `transporter.verify()` a cada 60min fica para Fase 2.)*

---

### ✅ MON-006 — Tickets escalados sem resposta humana (SLA) — IMPLEMENTADO
`conversation-janitor.service.ts` — `alertSlaEscalated()` roda no ciclo horário.
Agrupa conversas `escalated` sem atividade humana há mais de `SLA_ESCALATION_HOURS` (padrão 4h).
Envia uma notificação consolidada por tenant via `NotificationsService`.
**Env var:** `SLA_ESCALATION_HOURS=4` (configurável).

---

### ✅ MON-007 — Janitor e Proactive Engine sem observabilidade — IMPLEMENTADO
`ConversationJanitorService.lastRunAt` (static) — atualizado a cada ciclo do janitor.
`ProactiveEngineCron.lastRunAt` e `ProactiveEngineCron.lastDigestAt` (static) — atualizados a cada ciclo.
Todos expostos em `GET /health` → campo `jobs: { janitor, proactiveEngine, proactiveDigest }`.

---

### ✅ MON-008 — Proactive Engine Redis — IMPLEMENTADO
`ProactiveEngineCron` — `static lastRunAt` e `static lastDigestAt` em memória.
Exposto em `GET /health`. Ciclos pulados ficam visíveis por ausência de atualização no `lastRunAt`.

---

### ✅ MON-009 — Latência da Lia — IMPLEMENTADO
`ConversationAgentService` — `static latency: RollingStats` coleta as últimas 100 durações de `handle()`.
Calcula p50/p95 sob demanda. Exposto em `GET /health` → `ai.latency: { p50Ms, p95Ms, samples }`.
Log `warn` se p95 ultrapassar `LIA_LATENCY_WARN_MS` (padrão 15s).
`shared/utils/rolling-stats.ts` — buffer circular sem dependências externas.


---

## Roadmap atualizado

```
FEITO ✅ ──────────────────────────────────────────────────────────
  MON-001 → Redis health no /health/ready
  MON-002 → API Anthropic (contador falhas em AnthropicService)
  MON-003 → Env vars no startup (validate-env.ts + main.ts)
  MON-004 → SMTP health (checagem passiva em /health)
  MON-005 → TMS Connector offline (onModuleInit)
  MON-006 → SLA tickets escalados (alertSlaEscalated no Janitor)
  MON-007 → lastRunAt Janitor + ProactiveEngine → /health
  MON-008 → ProactiveEngine ciclos visíveis via lastRunAt
  MON-009 → Latência Lia p50/p95 via RollingStats → /health
```

---

## Infraestrutura de alerta (já existe — reutilizar)

Todos os novos monitors devem usar os canais já prontos:

```
WahaHealthService.alert(title, body)
  → notifyPanel()     — sininho no Nexa  (NotificationsService)
  → notifyEmail()     — e-mail via SMTP configurado
  → notifyWhatsapp()  — WhatsApp do admin (ALERT_ADMIN_PHONE)
```

Para reutilizar, refatorar `notifyPanel/Email/Whatsapp` para `protected` ou criar um
`AlertService` compartilhado que todos os health services injetam.

---

## Env vars — checklist produção

```env
# Monitoramento WhatsApp/TMS (já configuradas)
WAHA_API_URL=
WAHA_API_KEY=
WAHA_SESSION=default
ALERT_ADMIN_PHONE=5511999999999
ALERT_ADMIN_EMAIL=abel@empresa.com
MONITOR_ENABLED=true

# Portal (MON-003 valida no boot)
PORTAL_JWT_SECRET=        # OBRIGATÓRIO
NEXA_DEFAULT_TENANT_ID=   # OBRIGATÓRIO

# MON-006 (quando implementar)
ESCALATION_SLA_HOURS=4
```

---

## Resumo de arquivos

| MON | Status | Arquivo | Mudança |
|---|---|---|---|
| 001 | ✅ | `health.controller.ts` | Redis ping em `/health/ready` |
| 002 | ✅ | `shared/ai/anthropic.service.ts` | `failureCount` + `getStats()` |
| 003 | ✅ | `shared/config/validate-env.ts` | `validateEnv()` no boot |
| 004 | ✅ | `health.controller.ts` | `smtpConfigured()` → `/health` campo smtp |
| 005 | ✅ | `connectors/hipertms.connector.ts` | `onModuleInit` ping TMS |
| 006 | ✅ | `conversation-janitor.service.ts` | `alertSlaEscalated()` + `SLA_ESCALATION_HOURS` |
| 007 | ✅ | `conversation-janitor.service.ts` + `proactive-engine.cron.ts` | `static lastRunAt` → `/health` |
| 008 | ✅ | `proactive-engine.cron.ts` | `static lastRunAt` exposto em `/health` |
| 009 | ✅ | `conversation-agent.service.ts` + `shared/utils/rolling-stats.ts` | p50/p95 → `/health` campo `ai.latency` |
