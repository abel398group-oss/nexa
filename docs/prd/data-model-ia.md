# PRD — Modelo de Dados da IA (fundação para autonomia)

> O banco determina se a IA consegue evoluir para 80-90% de autonomia com segurança.
> Modela conversas, ações, memória do cliente, saúde, playbooks, conhecimento e auditoria.

**Status:** Proposto (a validar) · **Data:** 2026-06

---

## Princípios do modelo

1. **Multi-tenant desde já**: toda tabela sensível tem `tenant_id` (mesmo single-tenant hoje)
2. **Versionamento**: conhecimento e playbooks são versionados e aprovados
3. **Auditabilidade**: toda conversa, mensagem e ação fica registrada
4. **Idempotência**: eventos financeiros/externos com chave única
5. **Separação**: a IA lê; o backend escreve em tabelas críticas
6. **Correlation ID**: um identificador único atravessa toda a jornada
7. **Convenção de IDs**: `id` = UUID local; `external_id` (ou `external_*_id`) = referência
   a entidade do TMS/sistema externo. Sempre distinguir os dois para não confundir chave
   local com chave do TMS. Ex: `plan_id` referencia o plano do TMS (externo), não local.

## Correlation ID (rastreio ponta a ponta)

Um `correlation_id` único liga toda a jornada de um lead/cliente:
```
lead conversa → gera cobrança → pagamento aprovado → tenant criado → onboarding
                  todos com correlation_id = abc123
```
Presente em: `ai_conversations`, `ai_actions`, `ai_billing_requests`, `billing_events`,
`domain_events`, `event_dlq`. Facilita absurdamente auditoria e depuração de fluxo.

---

## Tabelas

### 1. ai_conversations
Uma conversa (sessão) com um lead/cliente.
```
id, tenant_id, correlation_id, contact_id, phone, source_channel (whatsapp/telegram/site/...),
agent_type (sdr/sales/onboarding/support/billing), customer_stage,
status (open/escalated/closed), started_at, ended_at, created_at
```

### 2. ai_messages
Cada mensagem trocada (in/out), com rastreabilidade de prompt e KB usados.
`metadata` cobre diferenças por canal (anexos, tipo, source_message_id).
```
id, conversation_id, tenant_id, correlation_id, direction (inbound/outbound),
content text, metadata jsonb (attachments/message_type/source_message_id),
intent, prompt_version, kb_version, tokens_in, tokens_out,
estimated_cost_usd, actual_cost_usd, latency_ms, created_at
```

### 3. ai_actions
Toda ação SOLICITADA pela IA (executada pelo backend).
```
id, conversation_id, tenant_id, correlation_id, action_type (create_payment/consult_plan/...),
status (requested/validated/executed/blocked/failed),
requested_by_ai (bool), executed_by_backend (bool),
idempotency_key (unique), payload jsonb, result jsonb,
error jsonb (code/message, ex: PAYMENT_BLOCKED/plan mismatch), created_at, executed_at
```

### 4a. ai_customer_profile (memória COMERCIAL)
Perfil comercial/relacional do cliente (ver seção 12 do ia-autonoma).
```
id, tenant_id, contact_id, external_contact_id (ref TMS), industry,
segment (transportadora/distribuidor/...), fleet_size, satisfaction_score,
preferred_tone, notes jsonb, updated_at
```

### 3b. ai_agent_sessions
Sessão de um agente dentro de uma conversa — permite medir consumo e CUSTO por agente
(quanto o SDR/Sales/Support consumiu).
```
id, conversation_id, tenant_id, correlation_id, agent_type, agent_version,
started_at, ended_at, tokens_in, tokens_out,
estimated_cost_usd, actual_cost_usd
```

### 4b. ai_customer_context (memória OPERACIONAL)
Contexto de uso do sistema — separado do comercial, escala melhor.
```
id, tenant_id, contact_id, last_cte_issue, last_login,
last_onboarding_step, active_features jsonb, updated_at
```

### 5. ai_customer_health
Health score para proatividade/retenção (ver seção 13).
**Fonte de verdade = os INPUTS.** O score/cor é cache recalculável (se a fórmula mudar,
recalcula — não fica inconsistente). Guardar `formula_version` no cache.
```
-- inputs (fonte de verdade)
id, tenant_id, contact_id, last_login_at, last_emission_at,
open_tickets, complaints_count, days_inactive, updated_at
-- cache recalculável
cached_score (0-100), cached_color (verde/amarelo/vermelho),
formula_version, computed_at
```

### 6. ai_playbooks
Catálogo versionado de playbooks (ver seção 15.2). `status` porque playbooks envelhecem.
```
id, tenant_id, code (PLAYBOOK_VENDA/PLAYBOOK_CHURN/PLAYBOOK_CTE/...),
segment, version, content, status (draft/review/approved/deprecated),
is_active, created_at
```

### 7. ai_knowledge_base
Base de conhecimento (evolui a tabela atual). Preparada para RAG (pgvector) futuro.
`tags` facilita busca/RAG.
```
id, tenant_id, topic, category (comercial/tecnico/suporte),
title, content, tags text[] (ex: CTE/MDFE/TABELA_PRECOS/CADASTRO_CLIENTE),
embedding (vector, futuro pgvector), embedding_model, created_at
```

### 8. ai_knowledge_versions
Versionamento e aprovação do conhecimento (ver 9.2 e 15.5).
```
id, knowledge_id, version, content, approved (bool), author,
valid_until (date), created_at
```
→ A IA só usa `approved = true AND (valid_until IS NULL OR valid_until >= today)`

### 9. ai_escalations
Registro de toda escalação para humano.
```
id, conversation_id, tenant_id, correlation_id, reason (human_request/critical/risk_word/failover/...),
risk_level (normal/critical), trigger (palavra/intenção/falha),
assigned_to, status (open/handled), created_at, handled_at
```

### 10. ai_quality_audits (já existe — evoluir)
Auditoria da Supervisora.
```
id, conversation_id, tenant_id, correlation_id, phone, quality_score, has_repetition,
lead_confused, hallucination_detected, security_ok, problems,
suggestion, prompt_version, kb_version, audited_at
```

---

## Tabelas de suporte (governança)

### ai_usage_limits (controle de custo — 9.18)
Janela explícita para reset correto de limites por minuto/hora/dia/mês.
```
id, tenant_id, contact_id, window_type (minute/hour/day/month), window_start,
tokens_used, queries_used, messages_used, limit_reached (bool), updated_at
```

### ai_prompt_versions (versionamento de prompt)
Saber qual versão de prompt gerou cada resposta (rastreio de regressão).
```
id, agent_type, version, content, approved (bool), is_active (bool),
created_by, created_at
```

### ai_agent_versions (versionamento de agente)
Controla quando mudou modelo/provider/prompt/config de cada agente.
```
id, agent_type, model_provider (anthropic/...), model_name, prompt_version,
config jsonb (temperature/max_tokens/...), is_active (bool), created_at
```

### ai_improvements (aprendizado contínuo — seção 14)
```
id, conversation_id, source (supervisor/human), problem, proposed_rule,
status (proposed/approved/applied), created_at
```

### ai_test_suites (testes automatizados dos agentes)
Cenários que rodam ANTES de publicar nova versão de prompt/agente (regressão).
```
id, agent_type, scenario (prompt_injection/lead_agressivo/lead_tecnico/cancelamento/fraude),
input, expected_behavior, last_result (pass/fail), last_run_at
```
Garante que uma mudança de prompt não quebre comportamentos críticos (ex: resistir a
prompt injection, escalar cancelamento, não revelar preço interno).

### plans (regras comerciais — 9.1) — ⚠️ USAR O MÓDULO DO TMS, NÃO RECRIAR
> O HiperTMS **já tem** catálogo de planos completo (`GET /plans`, CRUD admin, limites,
> enforcement). NÃO criar tabela própria. A IA consulta `GET /plans` (read-only) como
> fonte de verdade de preço/limites. Ver `adr/008-integracao-billing-tms.md`.

Estrutura do plano no TMS (referência, não recriar): `code, name, price, max_users,
limites (ex: embarques/mês), features/metadata, is_active`.

### domain_events (Event-Driven — seção 17)
Fila de eventos do domínio (outbox pattern).
```
id, tenant_id, correlation_id, event_type (lead_created/payment_confirmed/cte_emitted/...),
subject_id, payload jsonb, status (pending/processed/failed),
idempotency_key (unique), created_at, processed_at
```

### audit_retention (política de retenção — 9.25)
Configuração de prazo de retenção por tipo de dado.
```
id, data_type (messages/audit/financial), retention_months, action (anonymize/purge)
```

### products (registry de produtos conectados — ADR 009/010)
A IA precisa saber qual produto está vendendo. Cada produto tem um Connector.
```
id, code (hipertms/crm/...), name, connector (HiperTmsConnector/...), status
```
- `tenant_id` (nas tabelas) = tenant da PLATAFORMA de leads
- `external_tenant_id` = tenant no PRODUTO conectado (ex: tms_123)
- `product_code` em ai_conversations / ai_knowledge_base / ai_billing_requests

### product_connector_credentials (credenciais por produto — ADR 010)
Credenciais de API por produto/tenant — SEMPRE criptografadas, nunca texto puro.
```
id, tenant_id, product_id, credential_type (api_key/oauth/service_account),
encrypted_secret, status (active/revoked), created_at
```

### feature_flags (autonomia por tenant — 15.6)
Liga/desliga recursos por cliente (rollout gradual).
```
id, tenant_id, flag (auto_sales/auto_onboarding/auto_support/...),
enabled (bool), updated_at
```

### event_dlq (Dead Letter Queue — ADR 004)
Eventos que falharam após N tentativas (nunca perder evento). Rastreável por cliente/fluxo.
```
id, tenant_id, correlation_id, original_event_id, event_type, payload jsonb, error,
retry_count, status (pending/reprocessed/discarded), created_at
```

### ai_billing_requests (rastreabilidade de cobrança — 9.26)
Registra toda cobrança que a IA solicitou (a IA pede; o TMS executa).
```
id, conversation_id, correlation_id, lead_id, tenant_id, plan_id, requested_amount,
idempotency_key (unique),
status (requested/processing/link_sent/pending_payment/confirmed/failed/expired/cancelled),
payment_link,
external_subscription_id, external_invoice_id, external_payment_id (refs TMS/Asaas),
created_at, confirmed_at
-- IDs externos correlacionam: pedido local IA → assinatura/fatura/pagamento no TMS/Asaas
-- (não depender só do payload)
```

### payment_status_sync (reconciliação — 9.26)
Não depender só do webhook: rotina periódica reconcilia com o Asaas.
```
id, ai_billing_request_id, asaas_payment_id, expected_status,
actual_status, divergence (bool), checked_at
```
Rotina (1x/hora): consulta pendentes no Asaas → compara com banco → corrige divergências.
(Alinha com a reconciliação opt-in do TMS: `ASAAS_RECONCILE_CRON`.)

### billing_events (trilha de eventos de cobrança — 9.26)
Histórico imutável de cada evento de billing recebido/processado (auditoria financeira).
```
id, ai_billing_request_id, tenant_id, correlation_id, asaas_payment_id,
event_type (created/paid/failed/refunded/...), raw_payload jsonb,
signature_valid (bool), processed (bool), idempotency_key (unique), created_at
```

---

## Relacionamentos (alto nível)

```
contact ──1:N── ai_conversations ──1:N── ai_messages
                       │
                       ├──1:N── ai_actions ──(backend valida/executa)
                       ├──1:N── ai_escalations
                       └──1:N── ai_quality_audits

contact ──1:1── ai_customer_profile
contact ──1:1── ai_customer_health
contact ──1:1── ai_usage_limits

ai_knowledge_base ──1:N── ai_knowledge_versions
tenant ──1:N── ai_playbooks
plans → consumido do TMS via GET /plans (não é tabela local)

ai_billing_requests ──1:N── billing_events
ai_billing_requests ──1:1── payment_status_sync
(correlation_id atravessa: ai_conversations → ai_actions → ai_billing_requests
 → billing_events → domain_events)
```

---

## Como isso habilita a autonomia

| Capacidade da IA | Tabela que sustenta |
|---|---|
| Personalizar atendimento | ai_customer_profile |
| Ser proativa / reter | ai_customer_health |
| Não inventar preço | TMS `GET /plans` (consulta, não tabela local) |
| Rastrear versão de prompt/agente | ai_prompt_versions + ai_agent_versions |
| Testar antes de publicar | ai_test_suites |
| Não alucinar | ai_knowledge_versions (approved + valid_until) |
| Vender por segmento | ai_playbooks |
| Não estourar custo | ai_usage_limits |
| Rastrear tudo | ai_conversations / messages / actions |
| Escalar com segurança | ai_escalations |
| Melhorar continuamente | ai_improvements + ai_quality_audits |

---

## Migração a partir do estado atual

Hoje já temos: `ai_classifications`, `ai_quality_audits`, `ai_knowledge_base`,
`contacts`, `contact_interactions`.

Evolução sugerida:
1. `contact_interactions` → origem de `ai_conversations` + `ai_messages`
2. `ai_classifications` → alimenta `ai_messages` (intent, tokens)
3. `ai_knowledge_base` → adicionar `ai_knowledge_versions`
4. Criar novas: `ai_actions`, `ai_customer_profile`, `ai_customer_context`,
   `ai_customer_health`, `ai_playbooks`, `ai_escalations`, `ai_usage_limits`,
   `ai_improvements`, `ai_prompt_versions`, `ai_agent_versions`, `ai_test_suites`,
   `domain_events`, `event_dlq`, `feature_flags`, `ai_billing_requests`,
   `payment_status_sync`, `billing_events`
5. **NÃO criar `plans`** — consumir o catálogo do TMS via `GET /plans` (ADR 008)

⚠️ Implementação só quando construirmos o backend (NestJS + Prisma) — o schema acima
vira o `schema.prisma`. Não mexer nos workflows atuais até lá.

---

## Notas para a IA revisora (GPT) — contexto e pontos de atenção

> Esta seção comunica contexto que a IA revisora pode não ter. Quem mantém este projeto
> conhece o TMS (hipertms_v12) por dentro; alguns conselhos genéricos de "SaaS enterprise"
> precisam ser ponderados contra a realidade atual.

**1. Estado real do projeto (não é greenfield enterprise):**
- Hoje existe um MVP **funcional em n8n** (não NestJS ainda): Inbound IA, Sender, Follow-up,
  Supervisor. Single-tenant. 1 número WhatsApp, 30 leads/dia. PostgreSQL compartilhado com n8n.
- Este modelo de dados é o ALVO (backend NestJS futuro), não o estado atual.
- Risco a evitar: **over-engineering antes de validar**. Construir incrementalmente.

**2. Dependência da decisão "módulo vs serviço" (ainda aberta):**
- Não foi decidido se o sistema de leads será um **módulo dentro do hipertms_v12** ou um
  **serviço separado** que consome a API do TMS. Isso afeta diretamente:
  - `tenant_id` (se módulo, é o tenant do TMS; se serviço, é referência externa)
  - se reusamos as tabelas/auth/CASL do TMS ou criamos próprias
- Sugestões que assumem um dos caminhos devem ser marcadas como condicionais.

**3. O que o TMS JÁ resolve (não duplicar):**
- **Billing/pagamento completo** (Asaas, webhook idempotente `AsaasWebhookEvent`,
  `SubscriptionsService`, planos, faturas, enforcement de limites) — ADR 008.
- **Auth + multi-tenant + CASL** já existem no TMS (NestJS). Se formos módulo, reusar.
- **Plans** vêm do TMS via `GET /plans` — NÃO criar tabela local.
- Antes de sugerir nova infra, verificar se o TMS já fornece.

**4. Ordem de implementação acordada (faseada):**
Primeiro subset de tabelas (conforme sugerido): `ai_conversations, ai_messages, ai_actions,
ai_customer_profile, ai_knowledge_base, ai_knowledge_versions, domain_events, event_dlq`.
O resto entra em migrações seguintes. Não criar tudo de uma vez.

**5. Pendências de execução (fora deste doc):** decisão módulo/serviço; validar checklist
billing no TMS real; contrato da API; prompts reais dos agentes; schema.prisma; PRD por tela
do front; extrair conteúdo da KB do TMS.
