# ADR-030 — Monitor de Frota via WhatsApp

**Data:** 2026-06-25  
**Status:** Aceito  
**Decisores:** Squad TMS, Squad Nexa  
**Referências:** ADR-028 (Monitor Proativo TMS), ADR-022 (Motor de Proatividade TMS)

---

## Princípio norteador

> O sistema deve ser **proativo**: avisar antes do problema acontecer, com tempo de sobra
> para o usuário agir. Não é um log de falhas — é um sistema de prevenção.
> Ver: `docs/principles/proatividade.md`

---

## Contexto

O HiperTMS acumula dados críticos de frota — validades de CNH, CRLV, seguros, inspeções e
intervalos de manutenção por km — mas nenhum desses dados gera notificações ativas.
O operador só descobre o problema quando algo já está vencido ou o caminhão para na estrada.

O Nexa Monitor Proativo (ADR-028) já resolve esse problema para os domínios `logistic` e
`finance`. A decisão aqui é estender o mesmo mecanismo para `fleet`.

---

## Decisão

Estender o motor de proatividade do TMS com o domínio `fleet`, cobrindo:

| Regra | Gatilho | Severidade |
|---|---|---|
| `fleet.cnh_expired` | CNH vencida | CRITICAL |
| `fleet.cnh_expiring` | CNH vence em ≤ 30 dias | OVERDUE (≤7d) / DUE_SOON (≤30d) |
| `fleet.maintenance_date_overdue` | `nextMaintenanceDate` no passado | OVERDUE |
| `fleet.maintenance_date_due` | `nextMaintenanceDate` em ≤ 7 dias | DUE_SOON |
| `fleet.maintenance_km_overdue` | odômetro > `nextRevisionOdometer` | OVERDUE |
| `fleet.maintenance_km_due` | faltam ≤ 500 km para o próximo intervalo | DUE_SOON |
| `fleet.document_expired` | CRLV/seguro/inspeção vencidos | CRITICAL (CRLV) / OVERDUE |
| `fleet.document_expiring` | CRLV/seguro/inspeção vencem em ≤ 30 dias | DUE_SOON |

O Nexa lê esses eventos via `GET /api/nexa/proactivity/events` (endpoint unificado existente)
e os consolida no digest diário enviado por WhatsApp — **uma mensagem por dia por tenant**,
ao responsável cadastrado em `TenantNotificationConfig`.

---

## Alternativas rejeitadas

**A — Notificações diretas no TMS (e-mail nativo)**  
O TMS enviaria e-mail ao vencer um documento. Rejeitado: o TMS não tem integração de envio
por canal (WhatsApp), e o objetivo é manter o TMS como sistema de registro, sem lógica de
comunicação embutida.

**B — Polling independente no Nexa (sem motor de proatividade)**  
O Nexa consultaria as tabelas de frota diretamente. Rejeitado: duplicaria as regras de
detecção, criando dois lugares para manter os thresholds.

**C — Alertas em tempo real por evento (webhook)**  
Disparar WhatsApp imediatamente ao detectar um problema. Rejeitado na fase 1: gera ruído
excessivo. O digest diário (padrão 7h) é suficiente para frota.

---

## Consequências

- O `pending-event-rules.ts` do TMS cresce com ~150 linhas de regras de frota.
- O `proactivity.service.ts` adiciona duas queries (veículos + motoristas por tenant).
- O Nexa `ConsolidationService` reconhece a seção `fleet` na mensagem.
- Nenhuma tabela nova em nenhum dos dois sistemas — reutiliza `TenantProactivityPendingEvent`.
- A escalabilidade para múltiplos destinatários por tenant já está prevista em `TenantNotificationConfig` (fase 2).
