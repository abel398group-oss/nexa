# ADR 008 — Integração com o Billing do HiperTMS (não reinventar pagamento)

**Status:** Aprovado · **Data:** 2026-06

## Contexto
Nosso sistema de leads precisa que a IA venda e o cliente pague/seja liberado. O
**HiperTMS já tem um módulo de Billing & Payments completo e implementado** (ADR 007 do TMS),
com Asaas, webhooks idempotentes, planos, assinaturas, faturas e enforcement de limites.

## Decisão
**NÃO recriar pagamento.** O sistema de leads **integra** com o módulo de billing do TMS.
A IA consulta e solicita; o **TMS executa** toda a parte financeira e libera o acesso.

### O que o TMS já fornece (reusar)
| Recurso | Endpoint |
|---|---|
| Catálogo de planos (fonte de verdade de preço/limites) | `GET /plans` |
| Assinatura do tenant | `GET /subscriptions/current`, `POST /subscriptions/upgrade\|downgrade\|cancel` |
| Webhook de pagamento (idempotente) | `POST /api/webhooks/asaas` (`AsaasWebhookEvent`) |
| Faturas / transações | `GET /invoices`, `GET /transactions` |
| Métodos de pagamento | `/payment-methods` |
| Enforcement de limites de plano | `plan-limits.service.ts` |
| Estado de assinatura/trial | `SubscriptionsService` |

### Papéis
- **IA (leads):** consulta `GET /plans` (read-only), recomenda plano, solicita criação de
  assinatura. Nunca cria cobrança, nunca confirma pagamento, nunca libera acesso.
- **TMS (billing):** cria cobrança no Asaas, processa webhook com idempotência, atualiza
  assinatura, aplica limites e **libera o tenant**.
- **Asaas:** gateway. Confirma pagamento via webhook.

### Fluxo de fechamento (self-checkout)
```
Lead decide comprar
  → IA consulta GET /plans (preço/limites = verdade do TMS)
  → IA solicita assinatura via API do TMS
  → TMS cria cobrança no Asaas → envia link ao lead
  → Lead paga
  → Asaas → POST /api/webhooks/asaas → TMS (idempotente)
  → TMS confirma assinatura e LIBERA o tenant
  → IA apenas informa "pagamento confirmado, acesso liberado"
```

### Fluxo integrado com eventos (ADR 004/007)
```
Sales Agent → solicita create_payment_request (via backend)
  → backend grava ai_billing_requests (status=requested, idempotency_key)
  → backend chama TMS (cria assinatura/cobrança Asaas)
  → evento payment_link_created → IA envia link ao lead
Lead paga
  → Asaas → webhook → TMS valida (assinatura/tenant/valor/status/idempotência)
  → TMS libera tenant
  → evento payment_confirmed → backend atualiza ai_billing_requests (status=confirmed)
  → evento tenant_created → Onboarding Agent assume
```
Tudo amarrado pelo mesmo `correlationId`.

### Máquina de estados do ai_billing_requests
```
requested → processing → link_sent → pending_payment → confirmed
    │            │            │              │               └→ tenant_created → onboarding
    │            │            │              └→ failed (recusado) / expired (link venceu)
    │            │            └→ (link gerado, aguardando pagamento)
    │            └→ failed (TMS indisponível ao criar cobrança)
    └→ cancelled (lead desistiu antes de processar)
```
- `requested` → pedido registrado (a IA solicitou)
- `processing` → backend chamando o TMS (cria cobrança); cobre TMS indisponível
- `link_sent` → link de pagamento gerado e enviado ao lead
- `pending_payment` → lead recebeu, ainda não pagou (pode ficar dias)
- `confirmed` → pagamento confirmado pelo webhook → dispara `tenant_created`
- `failed` / `expired` / `cancelled` → caminhos de exceção

Transições só pelo backend (a IA nunca muda status financeiro).

### Cenários de borda (tratamento obrigatório)
| Cenário | Tratamento |
|---|---|
| Webhook não chega | Reconciliação `payment_status_sync` corrige |
| Webhook duplicado | Idempotência (`AsaasWebhookEvent` + `idempotency_key`) ignora |
| Valor divergente do plano | `BLOCK_PAYMENT` — não libera (9.15) |
| Webhook sem assinatura válida | Rejeitar (9.26) |
| Pagamento recusado | status=failed → IA informa e oferece nova tentativa |
| Link expira | status=expired → IA pode gerar novo (novo idempotency_key) |
| Lead some após link | Follow-up; sem pagamento, sem liberação |

### Alinhamento com a governança (ia-autonoma seção 9)
- 9.1 (não inventar preço) → preço vem de `GET /plans` do TMS
- 9.6 (proteção financeira) → confirmação só pelo webhook Asaas do TMS
- 9.7 (idempotência) → já garantida pelo `AsaasWebhookEvent` do TMS
- 9.15 (limite financeiro) → preço == catálogo do TMS, 0% divergência
- 9.26 (segurança billing) → validar webhook + tenant/valor/status antes de liberar

## Consequências
- (+) Zero retrabalho de pagamento; reusa módulo testado e seguro
- (+) Uma única fonte de verdade financeira (evita divergência leads vs TMS)
- (+) Separação SaaS billing vs finance operacional já resolvida pelo TMS
- (−) Cria dependência da API do TMS (precisa de credencial de serviço + contrato estável)

## Checklist técnico — VALIDADO no código do TMS (hipertms_v12)

Confirmado lendo `apps/api/prisma/schema.prisma`:
- [x] **Planos** → model `SystemAdminPlan` (`system_admin_plan`): slug, name, tier,
      monthlyPrice, yearlyPrice, trialDays, maxUsers, maxCompanies, maxShipmentsPerMonth,
      isActive. Esta é a fonte de verdade de preço/limites (consumir via API).
- [x] **Assinatura** → model `TenantAdminSubscription` (`tenant_admin_subscription`):
      tenantId, planId, status (TRIAL/ACTIVE/CANCELLED/PAST_DUE/EXPIRED), billingCycle
      (MONTHLY/YEARLY), amount, discount, trialEndsAt, `asaasSubscriptionId` (`sub_*`).
- [x] **Webhook idempotência** → model `AsaasWebhookEvent` (`asaas_webhook_event`):
      id (`evt_*`), event, paymentId. Confirma D2 do ADR 007 do TMS.
- [x] **Faturas** → `TenantSubscriptionInvoice`: invoiceNumber, status, total,
      gatewayInvoiceId, paidAt, dueDate.
- [x] **Transações** → `TenantSubscriptionTransaction`: gatewayTransactionId, gateway,
      status (PENDING/PROCESSING/SUCCESS/FAILED/CANCELLED), errorCode.
- [x] Métodos de pagamento: `TenantSubscriptionPaymentMethod` (PIX/BOLETO/CREDIT_CARD/...).

Endpoints (do PRD billing-payments do TMS, a confirmar em runtime): `GET /plans`,
`GET /subscriptions/current`, `POST /subscriptions/upgrade|downgrade|cancel`,
`POST /webhooks/asaas`, `GET /invoices`, `GET /transactions`, `/payment-methods`.

### Mapeamento dos IDs externos (ai_billing_requests → TMS)
| Campo nosso | Referencia no TMS |
|---|---|
| `external_subscription_id` | `TenantAdminSubscription.asaasSubscriptionId` (`sub_*`) ou `.id` |
| `external_invoice_id` | `TenantSubscriptionInvoice.id` / `gatewayInvoiceId` |
| `external_payment_id` | `AsaasWebhookEvent.paymentId` / `gatewayTransactionId` |

### Pendente confirmar em runtime (não dá pra ver só no schema)
- [ ] Validação de assinatura/token no webhook Asaas (rejeitar não assinado)
- [ ] Liberação automática do tenant após confirmação
- [ ] `ASAAS_RECONCILE_CRON` (reconciliação) habilitável

## Segurança do billing (ver ia-autonoma 9.26)
- Validar assinatura/token de TODO webhook Asaas (sem validação → rejeitar)
- Antes de liberar tenant, validar: tenant correto, valor == plano, status pago,
  plano ativo, evento não processado (idempotência)
- Reconciliação periódica (não depender só do webhook)
- Registrar toda solicitação da IA em `ai_billing_requests`

## Pendências
- Definir credencial de serviço (service account) para a IA/leads chamar a API do TMS
- Mapear os endpoints exatos e payloads ao implementar o backend de leads
- Decidir: sistema de leads é módulo do TMS ou serviço separado que consome a API dele

---

## Notas para a IA revisora (GPT)

- **Ponto crítico do sistema:** este é o fluxo financeiro. A IA NUNCA confirma pagamento,
  cria cobrança, define preço ou libera acesso — tudo isso é do TMS/backend.
- **Não recriar billing:** o TMS já tem Asaas + webhook idempotente + SubscriptionsService +
  planos + enforcement de limites. A IA só consulta (`GET /plans`) e solicita (via backend).
- **Dependência da decisão módulo-vs-serviço (ainda aberta):**
  - Se **módulo do TMS**: a IA usa diretamente os serviços internos (SubscriptionsService),
    sem credencial de serviço externa. `tenant_id` é o do TMS.
  - Se **serviço separado**: precisa de service account + chamadas HTTP à API do TMS +
    `external_tenant_id`. Esta decisão muda a implementação — marcar como condicional.
- **Não sugerir gateway próprio** (Stripe/PagSeguro/etc.): o TMS já usa Asaas. Mudar gateway
  é decisão do TMS, fora do escopo dos leads.
- **`ai_billing_requests` é rastreabilidade local da IA** (o que ela pediu), NÃO substitui as
  tabelas de billing do TMS (`TenantPaymentInvoice` etc.). São camadas diferentes.
