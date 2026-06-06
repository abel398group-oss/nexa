# ADR 007 — Event Catalog (contrato dos eventos)

**Status:** Aprovado · **Data:** 2026-06

## Contexto
A ADR 004 define a arquitetura orientada a eventos, mas não o **contrato**. Sem um
formato padrão, cada produtor emite de um jeito e os consumidores quebram.

## Decisão
Todos os eventos seguem o **mesmo envelope padrão** (consistente com ADR 004):
```json
{
  "eventId": "uuid",
  "eventType": "payment_confirmed",
  "tenantId": "123",
  "correlationId": "abc123",
  "producer": "billing",
  "priority": "alta",
  "occurredAt": "2026-06-05T10:00:00Z",
  "version": 1,
  "payload": { }
}
```

> **`correlationId`** liga toda a jornada (conversa → cobrança → pagamento → tenant →
> onboarding) com um único identificador. Essencial para auditoria e rastreio de fluxo
> ponta a ponta. Ver seção "Correlation ID" no data-model-ia.

### Regras
- `eventId` único (idempotência)
- `eventType` em snake_case, no passado (algo que **aconteceu**)
- `tenantId` sempre presente (multitenant)
- `correlationId` sempre presente (rastreio ponta a ponta)
- `producer` identifica quem emitiu (backend/billing/n8n/...)
- `priority` (alta/média/baixa) — ver ADR 004
- `occurredAt` em ISO 8601 UTC
- `version` para evolução do schema do payload
- `payload` **enxuto**: só IDs e dados mínimos; detalhe fica no banco (ADR 004)

### Catálogo inicial de eventos

| eventType | Prioridade | Produtor | Quando ocorre | Payload (só IDs/mínimo) |
|---|---|---|---|---|
| `lead_created` | média | n8n/backend | Novo lead capturado | contactId, sourceChannel |
| `lead_qualified` | média | backend | Score >= limite | contactId, score, intent |
| `payment_link_created` | alta | backend | Link de pagamento gerado | billingRequestId, planId |
| `payment_confirmed` | alta | TMS (webhook Asaas) | Pagamento confirmado | paymentId, tenantId |
| `tenant_created` | alta | TMS | Acesso liberado | tenantId, planId |
| `first_login` | baixa | TMS | Primeiro acesso | tenantId, userId |
| `cte_emitted` | baixa | TMS | CT-e emitido | tenantId, cteId |
| `ticket_opened` | média | backend | Suporte aberto | tenantId, ticketId |
| `health_score_changed` | baixa | backend | Mudou cor | tenantId, oldColor, newColor, score |
| `churn_risk_detected` | alta | backend | Inatividade detectada | tenantId, daysInactive |
| `escalation_created` | média | backend | IA escalou p/ humano | conversationId, reason |
| `connector_unavailable` | alta | backend | Conector/produto fora do ar | productCode, connector |

### Consumer Ownership (quem consome cada evento)

| Evento | Consumidor principal |
|---|---|
| `lead_created` | SDR |
| `lead_qualified` | Sales |
| `payment_link_created` | Billing |
| `payment_confirmed` | Billing → Onboarding |
| `tenant_created` | Onboarding |
| `first_login` | Onboarding |
| `cte_emitted` | Analytics |
| `ticket_opened` | Support |
| `health_score_changed` | Retention (proatividade) |
| `churn_risk_detected` | Retention |
| `escalation_created` | Humano / Supervisor |

### Versionamento de eventos
- Mudança compatível (campo novo opcional) → mesma `version`
- Mudança incompatível (renomear/remover campo) → incrementar `version`
- Consumidores devem tolerar campos extras (forward-compatible)
- Eventos descontinuados marcados como `deprecated` no catálogo antes de remover

### Governança do catálogo
- Todo evento novo entra **primeiro neste catálogo** (eventType, prioridade, produtor, payload)
- Depois é implementado. Evita "evento fantasma" que ninguém sabe de onde vem.

### Event Registry (futuro — não implementar agora)
Este catálogo é documental hoje. No futuro pode ser refletido numa tabela para validação
automática em runtime (rejeitar evento fora do catálogo):
```
event_registry: event_type, version, producer, priority, status (active/deprecated)
```
Só registrado como evolução — não implementar no MVP.

## Consequências
- (+) Produtores e consumidores têm contrato claro
- (+) Versionável, auditável, idempotente por design
- (+) Novos eventos seguem o mesmo molde (escala)
- (−) Exige disciplina: todo evento novo entra no catálogo antes de ser usado

## Relação
- Sustentado por `domain_events` (data-model-ia)
- Arquitetura/resiliência (DLQ, retry, circuit breaker) na ADR 004
- `payment_confirmed` se origina do webhook Asaas processado pelo TMS (ADR 008)

---

## Notas para a IA revisora (GPT)

- **Catálogo é vivo e faseado:** na Fase 1 (ADR 004) só alguns eventos existem de fato
  (ex: `lead_created`). Os demais entram conforme as features são construídas. O catálogo
  lista o ALVO, não tudo implementado hoje.
- **Eventos do TMS:** `payment_confirmed`, `tenant_created`, `cte_emitted`, `first_login`
  vêm do TMS. Se formos módulo, podem já existir como eventos do TMS (ADR 024) — não duplicar.
- **payment_confirmed:** é gerado a partir do webhook Asaas validado pelo TMS (ADR 008),
  não inventado pela IA.
- **Naming:** payload em camelCase no JSON (contrato de API); colunas do banco em snake_case
  (Prisma/Postgres). São camadas diferentes, ok divergir.
