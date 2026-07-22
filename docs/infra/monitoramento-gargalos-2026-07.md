# Termômetro de gargalos — Nexa (2026-07-21)

> Enxergar quando o volume se aproxima dos limites, pra puxar os itens 2 e 3 do
> plano de escala NA HORA CERTA — não antes (código dormente), não tarde (no
> incêndio). Só leitura + 1 aviso: não toca em regra de negócio.

## O que mede (3 gargalos do plano de escala)

| Métrica | Como | Fonte |
|---|---|---|
| Conexões do banco | `SELECT count(*) FROM pg_stat_activity` vs `max_connections` | pg (teto ~25 no DO) |
| Fila de alertas | profundidade da fila de dispatch | `MonitorDispatchService.pending` |
| Alertas na última hora | `notificationLog` count (1h) | banco |

## Como você é avisado

1. **Ativo (WhatsApp):** um verificador roda de hora em hora
   (`SCALE_WATCH_ENABLED`, default on). Quando uma métrica cruza o **AMARELO**
   (aviso, bem antes do vermelho), manda **1 WhatsApp** pro `ALERT_ADMIN_PHONE`
   — no máximo **1x por dia por métrica** (dedup em memória), pra nunca virar
   spam. Ex.: *"⚠️ Nexa: conexões do banco 18/25 (72%). Avaliar o pool —
   docs/infra/item1."*
2. **Sob demanda (JSON):** `GET /api/health/scale` devolve os números na hora
   — conexões, fila, alertas/hora, e o veredito (green/yellow) de cada um.

O amarelo vem MUITO antes do limite: o objetivo é te dar folga pra agir com
calma (ativar o pool, ligar o item 2), não te avisar quando já caiu.

## Limiares (env, com defaults conservadores)

| Env | Default | Significado |
|---|---|---|
| `SCALE_DB_WARN_PCT` | 70 | conexões ≥ 70% do `max_connections` → amarelo |
| `SCALE_QUEUE_WARN` | 50 | fila de dispatch ≥ 50 jobs sustentado → amarelo |
| `SCALE_ALERTS_HOUR_WARN` | (auto) | ≥ 70% de `DISPATCH_MAX_PER_MINUTE`×60 → amarelo |
| `SCALE_WATCH_ENABLED` | `true` | liga o verificador horário |
| `ALERT_ADMIN_PHONE` | — | destino do aviso (já usado por outros alertas admin) |

## O que cada amarelo significa (ação)

- **Conexões amarelo** → ativar o **item 1** (pool DO) se ainda não ativou.
- **Fila / alertas-hora amarelo** → avaliar o **item 2** (fila BullMQ) e/ou a 2ª
  réplica; nesse caso item 3 (Socket.io adapter) entra junto.

## Reverter / desligar

`SCALE_WATCH_ENABLED=false` — para de medir e avisar. O endpoint `/health/scale`
continua respondendo sob demanda (é só leitura, inofensivo).

## Não é

- Não é APM completo (Sentry/Datadog) — é um sinal barato e específico dos 3
  gargalos conhecidos. Se um dia crescer, migrar pra observabilidade dedicada
  (está no roadmap da Fase 2).
