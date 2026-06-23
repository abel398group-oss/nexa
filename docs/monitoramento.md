# Nexa — Plano de Monitoramento

**Criado:** 2026-06-22  
**Contexto:** Pré-lançamento comercial TMS  
**Repo:** `apps/backend/src/application/monitor/`

---

## O que já está monitorado hoje

| Serviço | Como | Frequência | Canais de alerta |
|---|---|---|---|
| **WhatsApp (WAHA)** | `WahaHealthService` — poll + webhook | 3 min | Painel + e-mail + WhatsApp admin |
| **Alertas TMS** | `MonitorService` — sinc proatividade | 30 min | WhatsApp/e-mail no horário configurado |
| **Database** | `GET /health/ready` → `SELECT 1` | On-demand | Nenhum (só responde 503) |
| **AI Kill switch** | `GET /health` → `aiAutonomyEnabled` | On-demand | Nenhum |


---

## Gaps identificados — o que falta monitorar

### 🔴 MON-001 — Redis sem monitoramento
**Impacto:** Anti-ban para de funcionar (número pode ser bloqueado pelo WhatsApp).  
Proactive engine dispara em paralelo em todas as instâncias.  
**Arquivo a alterar:** `HealthController` + novo `RedisHealthService`  
**Esforço:** ~1h

```typescript
// RedisHealthService — onModuleInit verifica, alerta se Redis down
private async redisOk(): Promise<boolean> {
  try { await this.redis.ping(); return true; }
  catch { return false; }
}
```

---

### 🔴 MON-002 — API Anthropic (Lia) sem monitoramento
**Impacto:** Lia para de responder silenciosamente. Cliente manda mensagem, nada acontece.  
**Arquivo a alterar:** `ConversationAgentService` — contador de falhas consecutivas  
**Esforço:** ~3h

```typescript
// Se 3 falhas em 5min → alerta + cooldown
private anthropicFailCount = 0;
private anthropicLastFailAt = 0;
```


---

### 🔴 MON-003 — Env vars críticas sem validação no startup
**Impacto:**
- `PORTAL_JWT_SECRET` ausente → usa fallback dev → brecha de segurança no portal
- `NEXA_DEFAULT_TENANT_ID` ausente → tickets do portal vão para tenant errado
- `MONITOR_ENABLED` ausente → todo o módulo de alertas TMS fica desativado sem aviso

**Arquivo a alterar:** Novo `StartupValidationService` chamado no `AppModule.onModuleInit()`  
**Esforço:** ~1h

```typescript
const required = ['PORTAL_JWT_SECRET', 'NEXA_DEFAULT_TENANT_ID', 'TMS_BASE_URL', 'TMS_SERVICE_TOKEN'];
for (const key of required) {
  if (!process.env[key]) this.logger.error(`ENV VAR OBRIGATÓRIA AUSENTE: ${key}`);
}
```

---

### 🟠 MON-004 — Canal de e-mail sem monitoramento
**Impacto:** Emails de clientes param de ser processados silenciosamente se SMTP/Mailgun quebrar.  
**Arquivo a alterar:** Novo `EmailHealthService` com `@Interval(60min)` e `transporter.verify()`  
**Esforço:** ~2h

---

### 🟠 MON-005 — TMS Connector offline sem alerta
**Impacto:** `DiagnosticAgent` faz diagnóstico sem dados reais do TMS. Lia opera "no escuro".  
**Arquivo a alterar:** `HiperTmsConnector.onModuleInit()` — log de erro se `!this.configured`  
**Esforço:** ~1h


---

### 🟠 MON-006 — Tickets escalados sem resposta humana (SLA)
**Impacto:** Ticket pode ficar `escalated` por dias sem nenhum humano pegar. Zero visibilidade.  
**Arquivo a alterar:** `ConversationJanitorService` — nova regra `alertUnattendedEscalations()`  
**Esforço:** ~3h

```typescript
// Alerta se ticket escalado há mais de X horas sem interação do lado humano
const SLA_HOURS = Number(process.env.ESCALATION_SLA_HOURS ?? 4);
// → notifications.create(..., type: 'escalation', link: '/support/:id')
```

---

### 🟡 MON-007 — Janitor e TicketIntelligence sem observabilidade
**Impacto:** Se pararem, tickets nunca fecham automaticamente e o loop de KB/bugs some.  
**Arquivo a alterar:** Ambos os services — `lastRunAt` em memória + alerta se silenciosos > 2× o intervalo  
**Esforço:** ~2h

---

### 🟡 MON-008 — Proactive Engine silencia quando Redis está down
**Impacto:** `acquireLock` retorna `false` silenciosamente. Cron pula sem avisar.  
**Arquivo a alterar:** `ProactiveEngineCron` — contador de ciclos pulados → alerta após 3  
**Esforço:** ~1h

---

### 🟡 MON-009 — Sem métricas de latência da API
**Impacto:** Degradação de performance (API lenta, DB com queries lentas) não é detectada.  
**Arquivo a alterar:** Interceptor NestJS global ou integração Sentry Performance  
**Esforço:** ~4h


---

## Quando implementar cada item

```
AGORA (antes de ir ao ar) ──────────────────────────────────────────
  MON-003 → Env vars no startup           ~1h  ← só log, zero risco
  MON-005 → TMS Connector offline         ~1h  ← só log no onModuleInit
  MON-001 → Redis health no /health/ready ~1h  ← sem breaking change

SEMANA 1 (primeiros clientes reais) ───────────────────────────────
  MON-002 → API Anthropic (contador falhas)  ~3h
  MON-006 → SLA tickets escalados           ~3h  ← precisa de ESCALATION_SLA_HOURS no .env

SEMANA 2-3 (estabilização) ────────────────────────────────────────
  MON-004 → Email SMTP health              ~2h
  MON-007 → Janitor/TicketIntelligence     ~2h
  MON-008 → Proactive Engine Redis         ~1h

BACKLOG (quando tiver tempo) ───────────────────────────────────────
  MON-009 → Latência API / Sentry Perf    ~4h
```

---

## Por que essa ordem

**Antes de ir ao ar:** os 3 primeiros são validação de configuração — corrigem problemas que
já existem hoje (PORTAL_JWT_SECRET, TMS_BASE_URL, Redis). Não adicionam lógica nova, só
visibilidade do que está configurado ou não. Risco zero de quebrar algo.

**Semana 1:** com clientes reais usando, a Lia precisa de visibilidade se a API Anthropic
falhar (MON-002) e o suporte humano precisa saber de tickets sem resposta (MON-006).

**Semana 2-3:** e-mail e janitor são importantes mas falham de forma menos catastrófica —
dá para perceber pelo volume de atendimento.

**Backlog:** latência é refinamento, não urgência operacional.


---

## Infraestrutura de alerta (já existe — reutilizar)

Todos os novos monitors devem usar os canais já prontos em `WahaHealthService`:

```
WahaHealthService.alert(title, body)
  → notifyPanel()     — sininho no Nexa  (NotificationsService)
  → notifyEmail()     — e-mail via SMTP configurado
  → notifyWhatsapp()  — WhatsApp do admin (ALERT_ADMIN_PHONE)
```

Para reutilizar, **refatorar `notifyPanel/Email/Whatsapp` para `protected`** ou criar um
`AlertService` compartilhado que todos os health services injetam.

---

## Env vars necessárias (checklist completo)

```env
# Já usadas (conferir se estão setadas em produção)
WAHA_API_URL=
WAHA_API_KEY=
WAHA_SESSION=default
ALERT_ADMIN_PHONE=5511999999999
ALERT_ADMIN_EMAIL=abel@empresa.com
ALERT_TENANT_ID=          # opcional — se vazio, notifica todos os tenants
MONITOR_ENABLED=true

# Críticas para o portal (MON-003)
PORTAL_JWT_SECRET=        # OBRIGATÓRIO — sem isso usa fallback dev inseguro
NEXA_DEFAULT_TENANT_ID=   # OBRIGATÓRIO — sem isso tickets vão para tenant errado

# Nova (MON-006)
ESCALATION_SLA_HOURS=4    # horas antes de alertar ticket escalado sem resposta humana
```

---

## Resumo de arquivos a tocar

| MON | Arquivo | Mudança |
|---|---|---|
| 001 | `HealthController` + novo `RedisHealthService` | Redis ping no `/health/ready` |
| 002 | `ConversationAgentService` | Contador falhas Anthropic → alerta |
| 003 | Novo `StartupValidationService` | Log de error se env vars ausentes |
| 004 | Novo `EmailHealthService` | `transporter.verify()` a cada 60min |
| 005 | `HiperTmsConnector` | Log de error no `onModuleInit` se não configurado |
| 006 | `ConversationJanitorService` | Nova regra SLA de escalação |
| 007 | `ConversationJanitorService` + `TicketIntelligenceService` | `lastRunAt` em memória |
| 008 | `ProactiveEngineCron` | Contador de ciclos pulados |
| 009 | Interceptor global NestJS | Latência por rota |
