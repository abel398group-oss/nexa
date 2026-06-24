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

### ❌ MON-004 — Canal de e-mail sem monitoramento
**Impacto:** Emails de clientes param de ser processados silenciosamente se SMTP quebrar.
**O que falta:** `EmailHealthService` com `@Interval(60min)` e `transporter.verify()`
**Esforço:** ~2h | **Prioridade:** Semana 2-3

---

### ❌ MON-006 — Tickets escalados sem resposta humana (SLA)
**Impacto:** Ticket pode ficar `escalated` por dias sem nenhum humano pegar.
**O que falta:** Nova regra `alertUnattendedEscalations()` no `ConversationJanitorService`
**Esforço:** ~3h | **Prioridade:** Semana 1
**Env var necessária:** `ESCALATION_SLA_HOURS=4`

```typescript
// Alerta se ticket escalado há mais de X horas sem interação humana
const SLA_HOURS = Number(process.env.ESCALATION_SLA_HOURS ?? 4);
// → notifications.create(..., type: 'escalation', link: '/support/:id')
```

---

### ❌ MON-007 — Janitor e TicketIntelligence sem observabilidade
**Impacto:** Se pararem, tickets nunca fecham automaticamente e o loop de KB/bugs some.
**O que falta:** `lastRunAt` em memória + alerta se silenciosos > 2× o intervalo
**Esforço:** ~2h | **Prioridade:** Semana 2-3

---

### ❌ MON-008 — Proactive Engine silencia quando Redis está down
**Impacto:** `acquireLock` retorna `false` silenciosamente. Cron pula sem avisar.
**O que falta:** Contador de ciclos pulados no `ProactiveEngineCron` → alerta após 3
**Esforço:** ~1h | **Prioridade:** Semana 2-3

---

### ❌ MON-009 — Sem métricas de latência da API
**Impacto:** Degradação de performance não é detectada.
**O que falta:** Interceptor NestJS global ou integração Sentry Performance
**Esforço:** ~4h | **Prioridade:** Backlog


---

## Roadmap atualizado

```
FEITO ✅ ──────────────────────────────────────────────────────────
  MON-001 → Redis health no /health/ready
  MON-002 → API Anthropic (contador falhas em AnthropicService)
  MON-003 → Env vars no startup (validate-env.ts + main.ts)
  MON-005 → TMS Connector offline (onModuleInit)

SEMANA 1 (primeiros clientes reais) ───────────────────────────────
  MON-006 → SLA tickets escalados         ~3h  ← precisa ESCALATION_SLA_HOURS no .env

SEMANA 2-3 (estabilização) ────────────────────────────────────────
  MON-004 → Email SMTP health             ~2h
  MON-007 → Janitor/TicketIntelligence    ~2h
  MON-008 → Proactive Engine Redis        ~1h

BACKLOG ────────────────────────────────────────────────────────────
  MON-009 → Latência API / Sentry Perf   ~4h
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
| 004 | ❌ | Novo `EmailHealthService` | `transporter.verify()` a cada 60min |
| 005 | ✅ | `connectors/hipertms.connector.ts` | `onModuleInit` ping TMS |
| 006 | ❌ | `conversation-janitor.service.ts` | Nova regra SLA escalação |
| 007 | ❌ | Janitor + TicketIntelligenceService | `lastRunAt` em memória |
| 008 | ❌ | `ProactiveEngineCron` | Contador de ciclos pulados |
| 009 | ❌ | Interceptor global NestJS | Latência por rota |
