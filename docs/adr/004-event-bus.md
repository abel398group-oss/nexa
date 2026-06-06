# ADR 004 — Event Bus (Arquitetura Orientada a Eventos)

**Status:** Aprovado (execução faseada) · **Data:** 2026-06

## Contexto
O sistema cresce em clientes e integrações. Fluxos acoplados (A chama B chama C) quebram
em escala. Tudo no domínio é, na essência, um evento. Já temos **Redis** (modo fila do n8n).

## Decisão
Adotar **arquitetura orientada a eventos** usando o Redis (já presente) como fila.
É o **ALVO**; a adoção é **faseada** (não criar bus completo agora).

### Plano de migração faseado

```
Fase 0 — Estado atual
- n8n já roda em modo fila (Redis). Workflows reagem a webhook, não a eventos de domínio.

Fase 1 — Outbox mínimo
- Criar tabela domain_events. Produtores gravam evento na mesma transação.
- Um worker n8n lê e dispara o workflow certo. Sem DLQ ainda (log de erro).

Fase 2 — DLQ + retry/backoff
- Falha após N tentativas → event_dlq. Reprocessamento manual.

Fase 3 — Circuit breaker + reconciliação
- Proteção contra queda de Claude/WAHA/Asaas. Reconciliação periódica.

Fase 4 — Bus completo
- Múltiplos consumidores por evento, ordenação, métricas de fila.
```

### Eventos do domínio (catálogo em ADR 007)
```
lead_created · payment_confirmed · tenant_created · first_login ·
cte_emitted · ticket_opened · health_score_changed · churn_risk_detected
```

### Fluxo (outbox)
```
Produtor → grava em domain_events (mesma transação)
         → worker despacha p/ Redis → consumidor (n8n/worker) → ação (backend)
```
> No outbox, o produtor **primeiro grava no banco**; um worker depois despacha para a fila.
> Garante que o evento não se perde mesmo se a fila estiver indisponível no momento.

### Envelope mínimo do evento (contrato completo no ADR 007)
```json
{
  "eventId": "uuid",
  "correlationId": "uuid",
  "tenantId": "uuid",
  "eventType": "payment_confirmed",
  "occurredAt": "2026-06-05T10:00:00Z",
  "producer": "billing",
  "payload": { }
}
```

### Quem publica (produtores)
- Backend (NestJS) — principal
- Webhook Asaas processado pelo TMS (gera `payment_confirmed`)
- n8n (na fase inicial)
- Workers internos
> **Regra:** agente NÃO publica evento direto. Agente **solicita**; o **backend publica**.

### Quem consome (consumidores)
- Workflows n8n
- Workers NestJS (futuro)
- Supervisor / Auditoria
- Rotinas de reconciliação

### Prioridade de eventos
Nem todo evento é igual (importa quando a fila enche):
```
alta   → payment_confirmed, tenant_created, churn_risk_detected
média  → lead_created, ticket_opened
baixa  → health_score_changed
```

### Payload enxuto (regra importante)
O evento carrega **IDs e dados mínimos**; o detalhe completo fica no banco.
```
RUIM:  payload: { full_conversation: "...", all_customer_data: "..." }
BOM:   payload: { conversationId: "abc", billingRequestId: "xyz" }
```
Evita fila pesada e vazamento de dado em trânsito.

### Ciclo de vida do evento
```
created → queued → processing → processed
                              └→ failed → retry (backoff) → DLQ (após N) → reprocessed/discarded
```
Estados refletidos em `domain_events.status` e `event_dlq`.

### Padrões obrigatórios
- **Outbox pattern**: evento gravado na mesma transação da mudança de estado
- **Idempotência**: `idempotency_key`/`event_id` únicos (consumir 1x mesmo se entregar 2x)
- **At-least-once delivery** com retry/backoff
- **Correlation ID** em todo evento (rastreio ponta a ponta — ver data-model)
- Tabela `domain_events` (ver data-model-ia)

### Política de retry
```
tentativa 1 → falha → espera 2s
tentativa 2 → falha → espera 8s
tentativa 3 → falha → espera 30s
após 3 → DLQ + alerta
```
(Valores ajustáveis; backoff exponencial.)

### Ordenação e concorrência
- Eventos do MESMO `correlationId`/agregado processados em ordem (evita corrida)
- Eventos de agregados diferentes podem ser paralelos (workers)
- Consumidor idempotente: reprocessar não causa efeito duplicado

### Auditoria
- `domain_events` = trilha de tudo que aconteceu (com payload e status)
- `event_dlq` = falhas (com erro, tenant_id, correlation_id)
- `billing_events` = trilha específica financeira (imutável)
- Permite responder: "o que aconteceu com o lead X?" via `correlation_id`

### Resiliência (obrigatória)

**Dead Letter Queue (DLQ):** evento que falha N vezes vai para uma fila morta para
reprocessamento manual/automático — nunca é perdido silenciosamente.
```
Fila → consumidor → erro (retry x3) → DLQ → reprocessamento/alerta
```

**Reprocessamento seguro:** reprocessar um evento da DLQ **nunca** pode duplicar cobrança,
mensagem ou tenant. Logo, **todo consumidor é idempotente** (checa `eventId`/`idempotency_key`
antes de agir). Reprocessar = seguro por design.

**Circuit Breaker:** se um serviço externo cai (ex: Claude), abre o circuito e usa fallback
em vez de falhar em cascata:
```
Claude → timeout → Circuit Breaker abre → modelo backup → se falhar → humano
```
Aplicar a: Claude, WAHA, Asaas. Liga com o "modo desastre" (ia-autonoma 9.21).

## Consequências
- (+) Desacopla produtores/consumidores; escala horizontal (workers)
- (+) Auditável e reprocessável; nenhum evento perdido (DLQ)
- (+) Resiliente a queda de serviço externo (circuit breaker)
- (+) Alinha com ADR 024 do HiperTMS (mesmo padrão)
- (−) Complexidade inicial maior; exige disciplina de idempotência

## Alternativa considerada
Chamadas diretas síncronas — simples no início, insustentável em escala.

## Relação com outros documentos
- Envelope/contrato do evento: ADR 007 (Event Catalog)
- Tabelas: `domain_events`, `event_dlq`, `billing_events` (data-model-ia)
- Circuit breaker liga com "modo desastre" (ia-autonoma 9.21)
- Alinha com ADR 024 do HiperTMS (outbox + ações idempotentes)

---

## Notas para a IA revisora (GPT)

- **Realidade atual:** o n8n JÁ usa Redis (modo fila), mas reage a **webhook**, não a
  eventos de domínio. O event bus de domínio é o **alvo**, adoção faseada (Fase 1 = só
  outbox + domain_events). Não criar bus completo/Kafka agora.
- **Não trocar Redis por Kafka/RabbitMQ no MVP:** Redis já atende o volume atual
  (1 número, 30 leads/dia). Reavaliar só quando o volume justificar.
- **TMS já tem outbox (ADR 024):** se formos módulo do TMS, reusar a infra de eventos dele
  em vez de criar paralela. Decisão módulo-vs-serviço ainda aberta.
- **Webhook Asaas:** não confundir com event bus interno — o webhook do TMS confirma
  pagamento (ADR 008); o evento `payment_confirmed` é gerado a partir dele.
