# API Contract (inicial) — Plataforma de Leads

> Contrato de API para alinhar frontend, backend, Flowise e conectores antes do Sprint 2.
> Vira `openapi.yaml` formal na implementação. Evita que cada camada espere um payload diferente.

**Status:** Proposto · **Data:** 2026-06 · **Base URL:** `/api`

---

## Convenções
- Auth: JWT em cookie HttpOnly (mesmo padrão TMS)
- Multi-tenant: tenant do contexto autenticado (nunca no body)
- Paginação: `?limit=50&offset=0&search=`
- Resposta de lista: `{ items: [], total: n }`
- Erros: `{ statusCode, message, errors?: [{field, message}] }`
- camelCase no JSON; correlationId em headers de operações de fluxo

---

## Contacts
```
GET    /contacts            (lista, filtros)
GET    /contacts/:id
POST   /contacts            (cria)
PATCH  /contacts/:id
POST   /contacts/import     (CSV/Excel)
GET    /contacts/:id/messages
```

## Conversations / Messages
```
GET    /conversations             (inbox)
GET    /conversations/:id
GET    /conversations/:id/messages
POST   /conversations/:id/messages   (envio manual pelo vendedor)
WS     /ws/conversations            (mensagens em tempo real)
```

## Actions (IA solicita → backend executa)
```
POST   /actions                  { type, payload, idempotencyKey, correlationId }
GET    /actions/:id
```
> `type` ∈ Action Policy (ADR 012). Ações "exige humano" não executam direto.

## Billing (via Connector — ADR 008/010)
```
GET    /plans                    (proxy getPlans do produto)
POST   /billing/payment-request  { contactId, planId, productCode }
GET    /billing/:id/status
POST   /webhooks/asaas           (recebe confirmação; valida assinatura)
```

## Campaigns
```
GET    /campaigns
POST   /campaigns
GET    /campaigns/:id/metrics
POST   /campaigns/:id/dispatch
```

## Knowledge
```
GET    /knowledge?productCode=&tags=
POST   /knowledge                (cria — exige aprovação)
POST   /knowledge/:id/approve
```

## Products / Connectors (ADR 010)
```
GET    /products
GET    /products/:code/health    (healthCheck do connector)
```

## Dashboard
```
GET    /dashboard/summary        (cards: enviados/lidos/respostas/oportunidades)
```

---

## Pendências (ao virar openapi.yaml)
- Schemas detalhados de request/response por endpoint
- Códigos de erro por operação (400/401/403/404/409/422)
- Rate limit headers
- Versionamento da API (`/api/v1`)
