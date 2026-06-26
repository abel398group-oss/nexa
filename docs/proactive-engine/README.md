# Motor Proativo Nativo — Nexa

> Módulo: `apps/backend/src/application/proactive-engine/`
> Documentado em: 2026-06-26

---

## O que é

O **proactive-engine** é o motor de eventos proativos **nativo do Nexa** — detecta situações anômalas nas conversas, campanhas e tickets do próprio Nexa e gera eventos para ação.

É diferente do `monitor/` (Monitor Proativo TMS):

| Módulo | Monitora | Fonte de dados |
|---|---|---|
| `proactive-engine/` | Conversas, campanhas e tickets **do Nexa** | Banco Nexa (Prisma) |
| `monitor/` | Eventos de logística, financeiro e frota **do TMS** | API TMS (`/nexa/proactivity`) |

---

## Arquivos

```
proactive-engine/
├── proactive-detector.service.ts     — detecta violações de regras
├── proactive-executor.service.ts     — executa ações para eventos detectados
├── proactive-engine.cron.ts          — agendadores (cron 15min + digest diário)
├── proactive-rule-config.service.ts  — lê configuração de regras por tenant
├── proactive-engine.module.ts        — módulo NestJS
├── proactive-detector.service.spec.ts
└── proactive-executor.service.spec.ts
```

---

## Regras implementadas

### Ciclo de 15 minutos (`*/15 * * * *`)

| Regra | Quando dispara | Severidade |
|---|---|---|
| `conversation.stale_open` | Conversa OPEN sem atividade > threshold | OVERDUE / CRITICAL (2×) |
| `conversation.lead_no_reply` | Lead respondeu mas operador ficou em silêncio > threshold | OVERDUE |
| `conversation.sla_breach` | Ticket escalado sem resposta humana > threshold | CRITICAL |
| `campaign.followup_due` | Target da campanha enviado mas sem resposta > threshold | DUE_SOON |
| `ticket.auto_close` | Ticket resolvido mas sem nova mensagem > threshold | INFO |

### Digest diário (`0 21 * * *` = 18h BRT)

| Regra | Quando dispara | Severidade |
|---|---|---|
| `conversation.digest` | Uma vez por dia, por tenant | INFO |

---

## Deduplicação

Eventos são persistidos em `pending_conversation_events` com `dedupeKey`:

```
{tenantId}:{ruleId}:{subjectId}:{bucket}
```

- Ciclo 15min: bucket = `YYYY-MM-DDTHH` (horário) — não dispara duas vezes na mesma hora
- Digest: bucket = `YYYY-MM-DD` (diário) — não dispara duas vezes no mesmo dia

Se o evento já existe com status `DISMISSED` ou `RESOLVED`, não é sobrescrito.

---

## Distributed lock (Redis)

O cron usa Redis para garantir que apenas uma instância execute por vez:

```
LOCK_KEY    = proactive-engine:cron-lock   TTL = 13min
DIGEST_LOCK = proactive-engine:digest-lock  TTL = 23h
```

Sem Redis (`REDIS_URL` ausente): executa em modo single-instance (sem lock).

---

## Configuração de regras por tenant

`ProactiveRuleConfigService` lê a configuração por tenant do banco. Cada regra tem:

```ts
interface EffectiveRuleConfig {
  enabled: boolean;
  thresholdMin: number;  // minutos de inatividade para disparar
  level: string;         // L1, L2, L3 — determina quem recebe
}
```

Regras têm defaults globais que podem ser sobrescritos por tenant.

---

## Fluxo completo

```
cron (15min)
  └─ ProactiveDetectorService.evaluateAll()
       └─ para cada tenant ativo:
            detectStaleOpen()  ──┐
            detectLeadNoReply() ─┤── upsertEvents() → pending_conversation_events
            detectSlaBreach()  ──┤
            detectCampaignFollowup() ─┤
            detectAutoClose()  ──┘
  └─ ProactiveExecutorService.executeAll()
       └─ busca eventos OPEN → executa ação (notificação, tag, etc.)

cron diário (18h BRT)
  └─ ProactiveDetectorService.evaluateDigest()
       └─ cria evento conversation.digest para cada tenant
  └─ ProactiveExecutorService.executeAll()
```

---

## Relação com o Monitor TMS

O `monitor/` consome eventos **externos** do TMS (logística, financeiro, frota) via polling na API `GET /nexa/proactivity`.

O `proactive-engine/` detecta eventos **internos** do Nexa (conversas paradas, SLA, campanhas).

Ambos podem notificar pelo mesmo canal (WhatsApp via WAHA), mas são módulos independentes com tabelas diferentes.

---

## Env vars relevantes

| Var | Descrição | Default |
|---|---|---|
| `REDIS_URL` | Lock distribuído. Sem isso: single-instance mode | — |
| `PROACTIVE_ENGINE_ENABLED` | Feature flag (se ausente, cron registra mas não executa) | `true` |

---

## Próximos passos planejados

- Exposição de métricas do engine no `/api/health` (`lastRunAt`, `lastDigestAt` já disponíveis via `ProactiveEngineCron.getStats()`)
- Configuração de regras por tenant via UI (hoje é só banco direto)
- Integração com `notification-channel.interface.ts` do `monitor/` para reutilizar canal WAHA
