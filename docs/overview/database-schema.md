# Database Schema — Hipervias Leads

> Modelo de dados do sistema de automação de leads. Todas as tabelas vivem no PostgreSQL,
> separadas das tabelas internas do n8n. Documento gerado a partir do schema real.

**Banco:** PostgreSQL 16 · **Última atualização:** 2026-06

---

## Visão geral das tabelas

| Tabela | Domínio | Função |
|---|---|---|
| `contacts` | CRM | Cadastro de leads (chave: phone) |
| `contact_interactions` | CRM | Histórico de todas as interações (in/out) |
| `campaigns` | Campanhas | Campanhas de prospecção |
| `campaign_messages` | Campanhas | Mensagens-modelo de cada campanha |
| `message_logs` | Campanhas | Log de cada envio (status, read, reply, follow-up) |
| `follow_up_messages` | Campanhas | Mensagens de recontato (24h/72h) |
| `opt_outs` | Compliance | Registro de descadastros |
| `ai_classifications` | IA | Log de cada classificação da IA |
| `ai_knowledge_base` | IA | Base de conhecimento injetada no prompt |
| `ai_quality_audits` | IA | Auditorias da IA Supervisora |
| `opportunities` | Comercial | Oportunidades de venda (score >= 70) |
| `opportunity_stage_history` | Comercial | Histórico de mudança de estágio |
| `sellers` | Comercial | Vendedores |
| `round_robin_state` | Comercial | Controle do round robin de distribuição |
| `seller_notifications` | Comercial | Dedup de notificações ao vendedor |
| `number_pool` | Operação | Saúde e limites dos números de envio |

---

## Tabelas principais

### contacts (leads)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| phone | varchar | Telefone (chave única de negócio) |
| name | varchar | Nome do lead |
| company | varchar | Empresa |
| email | varchar | Email |
| source | varchar | Origem do lead |
| status | varchar | active / opted_out |
| consent_status | varchar | unknown / opted_out |
| lead_status | varchar | new / cold_lead / warm_lead / hot_lead / opted_out |
| interest_score | integer | Score de interesse 0-100 |
| assigned_to | varchar | Vendedor atribuído |
| last_intent | varchar | Última intenção classificada |
| city / state / cnpj / position / department | varchar | Dados de enriquecimento |
| tags / notes | text | Segmentação e anotações |
| is_test | boolean | Marca contatos de teste |
| metadata | jsonb | Dados extras |
| created_at / updated_at / last_contact_at | timestamptz | Datas |

### contact_interactions (histórico)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| contact_id | uuid | FK contacts |
| phone | varchar | Telefone |
| channel | varchar | whatsapp |
| direction | varchar | inbound / outbound / internal |
| interaction_type | varchar | message_reply / auto_reply / campaign_message / seller_notification / opt_out |
| message_text | text | Conteúdo |
| raw_payload | jsonb | Payload bruto |
| created_at | timestamptz | Data |

### ai_classifications (log da IA)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| contact_id / phone | uuid / varchar | Lead |
| intent | varchar | opt_out / interested / pricing_question / meeting_request / not_now / wrong_person / human_needed / unknown |
| interest_score | integer | Score 0-100 |
| needs_human | boolean | Escalar para humano |
| is_complaint | boolean | É reclamação (monitoramento interno) |
| complaint_topic | varchar | Tema: lentidao / bug / preco / atendimento / fiscal / outro |
| summary | text | Resumo da conversa |
| suggested_reply | text | Resposta gerada |
| message_text | text | Mensagem do lead |
| model | varchar | Modelo Claude usado |
| raw_response | jsonb | Resposta bruta |
| created_at | timestamptz | Data |

### opportunities (comercial)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| contact_id / phone | uuid / varchar | Lead |
| name / company | varchar | Dados do lead |
| stage | varchar | Estágio (new, ...) |
| interest_score | integer | Score |
| intent | varchar | Intenção |
| summary | text | Resumo |
| assigned_to | varchar | Vendedor |
| created_at / updated_at | timestamptz | Datas |

### sellers (vendedores)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| name | varchar | Nome |
| whatsapp | varchar | chatId WhatsApp (ex: 5511...@c.us) |
| phone | varchar | Telefone |
| is_active | boolean | Ativo no rodízio |
| created_at | timestamptz | Data |

### round_robin_state (distribuição)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| last_seller_id | uuid | Último vendedor que recebeu |
| updated_at | timestamptz | Data |

### number_pool (saúde dos números de envio)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| phone_number | varchar | Número de envio (chip) |
| session_name | varchar | Sessão WAHA |
| display_name | varchar | Apelido |
| daily_limit / hourly_limit | integer | Limites de envio |
| sent_today / sent_this_hour | integer | Contadores |
| warmup_stage | integer | Fase de aquecimento |
| health_status | varchar | aquecendo / ativo / bloqueado |
| is_active | boolean | Em uso |
| last_sent_at | timestamptz | Último envio |
| last_reset_day | date | Dia do último reset |
| blocked_at | timestamptz | Quando bloqueou |
| notes | text | Observações |

### message_logs (envios de campanha)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| campaign_id / contact_id / phone | — | Referências |
| status | varchar | pending / sent / opted_out |
| message_text | text | Mensagem enviada |
| provider_message_id / provider_response | — | Retorno do WAHA |
| sent_at / read_at / replied_at | timestamptz | Eventos |
| follow_up_count | integer | Follow-ups enviados |
| follow_up_sent_at | timestamptz | Último follow-up |

### follow_up_messages

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| campaign_id | uuid | Campanha |
| follow_up_number | integer | 1 ou 2 |
| hours_after / minutes_after | integer | Tempo de espera (minutes_after usado nos testes) |
| message_text | text | Mensagem |
| is_active | boolean | Ativa |

### ai_quality_audits (supervisor)

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| phone | varchar | Lead auditado |
| quality_score | integer | Nota 0-100 |
| has_repetition | boolean | IA repetiu |
| lead_confused | boolean | Lead confuso |
| problems | text | Problemas detectados |
| suggestion | text | Sugestão de melhoria |
| conversation_summary | text | Resumo |
| messages_count | integer | Qtde mensagens |
| audited_at | timestamptz | Data |

### ai_knowledge_base

Base de conhecimento do produto, injetada no prompt da IA a cada mensagem.
Editável (futuramente via frontend) sem precisar mexer no workflow.

### opt_outs (compliance)

| Coluna | Tipo | Descrição |
|---|---|---|
| phone | varchar | Telefone (único) |
| keyword | varchar | Palavra que disparou |
| reason | text | Motivo |
| source | varchar | Origem |
| created_at | timestamptz | Data (não sobrescrever em conflito) |

---

## Convenções

- **Chave de negócio:** `phone` identifica o lead em quase todas as tabelas
- **Multi-tenant:** ainda NÃO implementado (single-tenant hoje). Ver ADR de evolução para SaaS
- **Timestamps:** sempre `timestamptz` (timezone-aware)
- **IDs:** uuid v4 (`gen_random_uuid()`)
- **Nomenclatura:** snake_case (padrão PostgreSQL/Prisma)
