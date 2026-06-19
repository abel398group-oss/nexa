# ERD — Entity Relationship Diagram

> Gerado a partir de `apps/backend/prisma/schema.prisma` em junho/2026.
> Atualizar sempre que houver migration.

## Diagrama

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AUTENTICAÇÃO / ACESSO                          │
├──────────────────┐   1:N  ┌───────────────────┐                        │
│ User             │───────▶│ Session            │                        │
│──────────────────│        │───────────────────│                        │
│ id (PK)          │        │ id (PK)           │                        │
│ tenantId (null=  │        │ userId (FK)       │                        │
│  platform admin) │        │ refreshTokenHash  │                        │
│ email (unique)   │        │ userAgent, ip     │                        │
│ passwordHash     │        │ revokedAt         │                        │
│ name, role       │        │ expiresAt         │                        │
│ sellerId         │        └───────────────────┘                        │
│ permissions[]    │                                                      │
│ isActive         │                                                      │
└──────────────────┘                                                      │
                                                                          │
┌──────────────────┐                                                      │
│ AuditLog         │   (standalone — registra ações de usuários/IA)      │
│──────────────────│                                                      │
│ tenantId, userId │                                                      │
│ action, resource │                                                      │
│ metadata         │                                                      │
└──────────────────┘                                                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                       MULTI-TENANT / PLATAFORMA                         │
├──────────────────┐        ┌───────────────────────────────────────┐    │
│ Tenant           │        │ Product                               │    │
│──────────────────│        │───────────────────────────────────────│    │
│ id (PK)          │        │ id (PK)                               │    │
│ name, slug       │   1:N  │ code (unique) — ex: "hipertms"        │    │
│ status           │  ┌────▶│ name, connector, status               │    │
│ productId        │  │     └───────────────────────────────────────┘    │
└──────────────────┘  │                  │ 1:N                           │
                       │                 ▼                                │
                       │  ┌──────────────────────────────────────────┐   │
                       │  │ ProductConnectorCredential               │   │
                       │  │──────────────────────────────────────────│   │
                       └──│ tenantId, productId (FK)                 │   │
                          │ credentialType, encryptedSecret          │   │
                          └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    NÚCLEO DE CONVERSAS (CORE)                           │
│                                                                         │
│  Contact ──1:N──▶ AiConversation ──1:N──▶ AiMessage                    │
│                         │                                               │
│                         ├──1:N──▶ AiAction                             │
│                         ├──1:N──▶ ConversationStageHistory             │
│                         └──N:1──▶ Seller                               │
│                                                                         │
│  Contact ──1:1──▶ AiCustomerProfile                                    │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────┐
│ Contact                              │
│──────────────────────────────────────│
│ id (PK)                              │
│ tenantId                             │
│ phone (UNIQUE com tenantId)          │
│ email (UNIQUE com tenantId, null OK) │
│ name, nameSource                     │
│ company, source (consent_source)     │
│ status: active | opted_out           │
│ leadStatus: new | cold | warm | hot  │
│ interestScore (0-100)                │
│ externalContactId (ref TMS)          │
│ tags[], notes                        │
│ optOutAt                             │
└───────────────┬──────────────────────┘
                │ 1:1
                ▼
┌──────────────────────────────────────┐
│ AiCustomerProfile                    │
│──────────────────────────────────────│
│ contactId (unique FK)                │
│ industry, segment, fleetSize         │
│ satisfactionScore, preferredTone     │
│ notes (Json)                         │
└──────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ AiConversation                                                   │
│──────────────────────────────────────────────────────────────────│
│ id (PK)                                                          │
│ tenantId, contactId (FK), phone                                  │
│ sourceChannel: whatsapp|email|portal|web_chat|...                │
│ agentType: router|sdr|sales|support|onboarding|...               │
│ customerStage: lead|cliente_novo|cliente_ativo                   │
│ status: open|waiting_customer|waiting_internal|escalated|closed  │
│ assignedSellerId (FK → Seller)                                   │
│ outcome: won|lost|no_response|opt_out|resolved                   │
│ ticketCategory, ticketPriority, rootCause                        │
│ resolvedAt, autoCloseAt, lastActivityAt                          │
│ externalId (ref cliente TMS — portal)                            │
└──────────┬──────────────────┬───────────────────┬───────────────┘
           │ 1:N              │ 1:N               │ 1:N
           ▼                  ▼                   ▼
┌─────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐
│ AiMessage       │  │ AiAction         │  │ ConversationStageHistory   │
│─────────────────│  │──────────────────│  │────────────────────────────│
│ tenantId        │  │ actionType:      │  │ fromStatus → toStatus      │
│ direction:      │  │  create_payment  │  │ fromOutcome → toOutcome    │
│  inbound|       │  │  get_payment_    │  │ reason: inatividade_7d |   │
│  outbound       │  │  status          │  │  won | lost | reaberta...  │
│ content         │  │  consult_plan    │  │ changedAt                  │
│ intent          │  │  escalate        │  └────────────────────────────┘
│ tokensIn/Out    │  │  update_context  │
│ estimatedCost   │  │  cancel_payment  │
│ ack: 0-3        │  │  refund | ...    │
│ externalId      │  │ status: requested│
│ metadata (Json) │  │  validated |     │
└─────────────────┘  │  executed |      │
                     │  blocked|failed  │
                     │ idempotencyKey   │
                     │ payload, result  │
                     └──────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    VENDAS / HANDOFF / FOLLOW-UP                         │
│                                                                         │
│  Seller ──1:N──▶ AiConversation (assignedSellerId)                     │
│  Seller ──1:N──▶ SellerNotification                                    │
│  Opportunity ──1:N──▶ OpportunityStageHistory                          │
│  FollowUp ──1:1──▶ AiConversation (conversationId unique)              │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐    ┌───────────────────────────────────┐
│ Seller                       │    │ SellerNotification                │
│──────────────────────────────│    │───────────────────────────────────│
│ tenantId, name, phone        │1:N▶│ sellerId (FK)                     │
│ active, assignedCount        │    │ conversationId (unique)           │
└──────────────────────────────┘    │ contactPhone                      │
                                    └───────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ Opportunity                                  │
│──────────────────────────────────────────────│
│ tenantId, contactId, conversationId          │
│ stage: new|qualified|proposal|won|lost       │
│ interestScore, intent, summary               │
│ value (decimal), assignedTo                  │
└───────────────────────┬──────────────────────┘
                        │ 1:N
                        ▼
               ┌─────────────────────────────┐
               │ OpportunityStageHistory     │
               │─────────────────────────────│
               │ fromStage → toStage         │
               │ reason, changedAt           │
               └─────────────────────────────┘

┌──────────────────────────────────────────────┐
│ FollowUp                                     │
│──────────────────────────────────────────────│
│ tenantId, conversationId (unique)            │
│ phone, name                                  │
│ stage: 0|1|2 (cadência 24h/72h)             │
│ status: pending|done|stopped                 │
│ nextRunAt                                    │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ HandoffToken                                 │
│──────────────────────────────────────────────│
│ token (unique, nanoid), tenantId             │
│ externalId (cliente TMS), name, page         │
│ errorCode, usedAt, expiresAt (TTL 5min)      │
└──────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    CAMPANHAS / DISPARO                                  │
│                                                                         │
│  Campaign ──1:N──▶ CampaignTarget                                      │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Campaign                                         │
│──────────────────────────────────────────────────│
│ tenantId, name                                   │
│ channel: whatsapp | email                        │
│ template (texto com {{nome}}, {{saudacao}})      │
│ subject (e-mail), mediaUrl, mediaName            │
│ type: message | status (WhatsApp Status)         │
│ status: draft|running|paused|done                │
│ scheduledAt, archivedAt, sendLimit               │
└─────────────────────────┬────────────────────────┘
                          │ 1:N
                          ▼
┌──────────────────────────────────────────────────┐
│ CampaignTarget                                   │
│──────────────────────────────────────────────────│
│ campaignId (FK), tenantId                        │
│ phone, email, name                               │
│ status: queued|sent|failed|skipped|sending       │
│ sentAt, error                                    │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ SenderNumber                                     │
│──────────────────────────────────────────────────│
│ tenantId, phone, sessionName                     │
│ dailyLimit (30), sentToday, dayStamp             │
│ hourlyLimit (8), sentThisHour, hourStamp         │
│ warmupStage (anti-ban)                           │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ SenderSettings                                   │
│──────────────────────────────────────────────────│
│ tenantId (unique)                                │
│ waStartHour/waEndHour (7-19)                     │
│ emailStartHour/emailEndHour (8-18)               │
└──────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                CONHECIMENTO / IA / EVENTOS                              │
│                                                                         │
│  AiKnowledgeBase ──1:N──▶ AiKnowledgeVersion                          │
│  DomainEvent, EventDlq — standalone por tenant                         │
│  AutonomySetting — singleton global (id="global")                      │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ AiKnowledgeBase                                  │
│──────────────────────────────────────────────────│
│ tenantId, productCode                            │
│ topic, category, title, content                  │
│ tags[], embeddingModel                           │
│ embedding: vector(384) — pgvector, via SQL bruto │
└────────────────────────┬─────────────────────────┘
                         │ 1:N
                         ▼
┌──────────────────────────────────────────────────┐
│ AiKnowledgeVersion                               │
│──────────────────────────────────────────────────│
│ knowledgeId (FK), version (int)                  │
│ content, approved (bool)                         │
│ author, reviewer, approvedAt, validUntil         │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ DomainEvent                                      │
│──────────────────────────────────────────────────│
│ tenantId, correlationId                          │
│ eventType, producer, priority: alta|media|baixa  │
│ status: created|queued|processing|processed|failed│
│ idempotencyKey (unique), payload (Json)          │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ EventDlq                                         │
│──────────────────────────────────────────────────│
│ tenantId, originalEventId, eventType             │
│ payload, error, retryCount                       │
│ status: pending|reprocessed|discarded            │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ AutonomySetting (singleton id="global")          │
│──────────────────────────────────────────────────│
│ master: bool (botão de pânico)                   │
│ whatsapp: bool                                   │
│ email: bool                                      │
│ Efetivo = master AND canal                       │
└──────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                 CANAL E-MAIL / OPT-OUT                                  │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ EmailChannel (1 por tenant)                      │
│──────────────────────────────────────────────────│
│ tenantId (unique)                                │
│ fromEmail, fromName, replyTo                     │
│ smtpHost/Port/User/Pass/Secure                   │
│ imapHost/Port/User/Pass/Mailbox                  │
│ isActive, lastPollAt                             │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ EmailOptOutToken                                 │
│──────────────────────────────────────────────────│
│ token (unique), tenantId, contactId, email       │
│ usedAt (null = não confirmado)                   │
│ expiresAt (TTL 30 dias)                          │
└──────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                 SUPORTE / NOTIFICAÇÕES / MISC                           │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐
│ SalesPlaybook    │  │ Complaint        │  │ Notification           │
│──────────────────│  │──────────────────│  │────────────────────────│
│ tenantId (unique)│  │ tenantId         │  │ tenantId               │
│ persona (vendas) │  │ conversationId   │  │ type: hot_lead |       │
│ supportPersona   │  │ phone            │  │  complaint | opt_out   │
│ objections (Json)│  │ topic, excerpt   │  │ title, body, link      │
│ cta Cold/Warm/Hot│  └──────────────────┘  │ read (bool)            │
│ signupUrl        │                        └────────────────────────┘
└──────────────────┘

┌──────────────────────────────────────────────────┐
│ ProcessedMessage                                 │
│──────────────────────────────────────────────────│
│ messageId (unique) — dedup WAHA reentrega        │
└──────────────────────────────────────────────────┘

## Resumo de Tabelas por Domínio

| Domínio | Tabelas |
|---|---|
| Auth | users, sessions, audit_logs |
| Multi-tenant | tenants, products, product_connector_credentials |
| Contatos | contacts, ai_customer_profile |
| Conversas | ai_conversations, ai_messages, ai_actions, conversation_stage_history |
| Conhecimento | ai_knowledge_base, ai_knowledge_versions |
| Vendas | sellers, seller_notifications, opportunities, opportunity_stage_history |
| Campanhas | campaigns, campaign_targets, sender_numbers, sender_settings |
| Follow-up | follow_ups |
| Handoff | handoff_tokens |
| E-mail | email_channels, email_optout_tokens |
| Suporte | sales_playbook, complaints, notifications |
| Eventos | domain_events, event_dlq |
| Controle IA | autonomy_setting, processed_messages |

**Total: 28 tabelas**

## Índices Críticos para Performance

```sql
-- Busca de conversas abertas (inbox)
INDEX ai_conversations(tenant_id, status, last_activity_at)

-- Contato por telefone (mensagem entrante)
UNIQUE contacts(tenant_id, phone)

-- Mensagens de uma conversa
INDEX ai_messages(conversation_id)

-- Campanha: targets por status (processamento)
INDEX campaign_targets(campaign_id), campaign_targets(status)

-- Busca semântica (pgvector)
-- ⚠️ PENDENTE IMPLEMENTAÇÃO: criar índice HNSW para escala
-- CREATE INDEX ON ai_knowledge_base USING hnsw (embedding vector_cosine_ops);
```

> **⚠️ Para equipe:** O índice HNSW do pgvector (`CREATE INDEX USING hnsw`) não existe ainda.
> Com poucos registros a busca `<=>` funciona por varredura sequencial (lento em escala).
> Criar em migration antes de atingir ~1.000 itens na knowledge base.
