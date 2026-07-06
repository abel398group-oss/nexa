# Schema Prisma — Sistema de Leads / IA Autônoma

> ⚠️ **DESATUALIZADO — REFERÊNCIA HISTÓRICA APENAS**
>
> Este arquivo é um artefato de design da fase de planejamento (2025). O schema real
> do banco está em **`apps/backend/prisma/schema.prisma`** — essa é a fonte de verdade.
> Modelos listados aqui (ex.: `AiAgentSession`, `BillingEvent`, `FeatureFlag`,
> `AiBillingRequest`) nunca foram implementados e não existem no banco.
> Consulte sempre o schema Prisma real antes de escrever código ou migrações.

> *Artefato de design original (2025):* derivado de `prd/data-model-ia.md` + ADRs 003/004/007/008.

## Convenções aplicadas
- `id String @id @default(uuid())` em todas as tabelas
- `idempotency_key` = **UNIQUE** (evita duplicação)
- `correlation_id` = **INDEXADO, nunca unique** (1 jornada = N registros compartilham o mesmo)
- `id` (uuid local) + `external_*_id` (referência ao TMS/Asaas)
- `tenantId` em toda tabela sensível (multi-tenant desde já)
  - nullable só na fase de **lead**; após `tenant_created` deve existir (garantir no backend)
- snake_case no banco (`@@map`/`@map`), camelCase no código
- **Billing/plans NÃO recriados** — consumidos do TMS (ADR 008)
- Enums tipados para status/tipos (ActionType, EventStatus, DlqStatus...) — evita strings soltas

## Ordem de implementação (faseada)

**Fase 1 (core — implementar primeiro):**
`AiConversation · AiMessage · AiAction · AiCustomerProfile · AiKnowledgeBase ·
AiKnowledgeVersion · DomainEvent · EventDlq`

**Fase 2+ (migrações seguintes):**
`AiAgentSession · AiCustomerContext · AiCustomerHealth · AiPlaybook · AiEscalation ·
AiQualityAudit · AiPromptVersion · AiAgentVersion · AiTestSuite · AiUsageLimit ·
AiImprovement · FeatureFlag · AuditRetention`

**Billing (rastreio local — TMS executa):**
`AiBillingRequest · BillingEvent · PaymentStatusSync`

## Integração com o TMS (validada no código real)

O billing NÃO é recriado. Os IDs externos referenciam o TMS:

| Campo nosso | Tabela/campo real no TMS |
|---|---|
| `planId` | `SystemAdminPlan` (system_admin_plan) |
| `externalSubscriptionId` | `TenantAdminSubscription.asaasSubscriptionId` (`sub_*`) |
| `externalInvoiceId` | `TenantSubscriptionInvoice.id` / `gatewayInvoiceId` |
| `externalPaymentId` | `AsaasWebhookEvent.paymentId` / `gatewayTransactionId` |

## Disciplina de migrations
Ver [`migrations.md`](migrations.md) — regras do Prisma (migrate dev/deploy, nunca manual).

## Notas técnicas
- `embedding Unsupported("vector")?` — requer extensão **pgvector** (RAG futuro). Remover
  se não usar pgvector no início.
- `AiCustomerHealth` guarda **inputs como fonte de verdade** + cache recalculável
  (`cachedScore`/`cachedColor`/`formulaVersion`).
- Decisão **módulo vs serviço** ainda aberta: se módulo do TMS, `tenantId` é o do TMS e
  pode-se reusar auth/CASL; se serviço separado, usar `external_tenant_id` + service account.

## Pendências antes de rodar `prisma migrate`
- Decidir módulo vs serviço (afeta tenantId/auth)
- Co