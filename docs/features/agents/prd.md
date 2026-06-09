# PRD — Agentes de IA (Lia)

## Visão geral

Os agentes de IA são o núcleo da Nexa. A Lia opera como uma assistente conversacional via WhatsApp com dois modos: vendas (prospect) e suporte (cliente TMS). O pipeline completo: roteador classifica → agente especializado responde → supervisora audita → orquestrador decide enviar ou escalar.

## Personas

- Lead (prospect): quer saber sobre o HiperTMS — Lia age como vendedora.
- Cliente TMS: já usa o HiperTMS — Lia age como suporte técnico.
- Vendedor humano: recebe handoff de leads quentes via notificação WhatsApp.

## Agentes

### RouterAgentService
Classifica a mensagem em: `sales | support | optout | human | unknown`.
Retorna: `{ agent, intent, leadScore, isComplaint, complaintTopic }`.

### SalesAgentService
Responde prospects com RAG na knowledge base do produto.
Retorna rascunho + `suggestedAction` (none | handoff_human | schedule_demo).

### SupportAgentService
Responde clientes TMS com RAG. Quando `tmsCustomer` está presente, muda o system prompt para modo suporte prioritário (não vende, resolve).

### SupervisorAgentService
Audita o rascunho antes do envio. Aprova ou reprova com lista de issues e nível de risco.

### ConversationAgentService (Orquestrador)
Coordena todos os agentes. Responsável pelo auto-envio (kill switch), handoff para vendedor e detecção de reclamações.

## Fluxo de roteamento TMS

1. Mensagem entra → RouterAgent classifica como `sales`
2. ConversationAgent busca telefone da conversa → consulta TMS (batchLookup)
3. Se cliente TMS encontrado: rota muda para `support` + tmsCustomer preenchido
4. SupportAgent recebe contexto do cliente → responde como suporte prioritário

## Lead Score

| Score | Classificação | Ação |
|---|---|---|
| >= 70 | Hot | Cria oportunidade + notifica vendedor |
| >= 40 | Warm | Follow-up automático |
| > 0 | Cold | Acompanha |
| 0 | Opt-out | Bloqueado (LGPD) |

## Kill switch (autonomia)

- `AI_AUTONOMY_ENABLED=true` no boot → auto-envio ligado por padrão
- Botão no painel desliga em runtime sem reiniciar
- Quando desligado: rascunho gerado mas não enviado (aguarda humano)

## Requisitos não funcionais

- Nunca inventa: só responde com base nas fontes (knowledge base)
- Humanização: delay 3-6s antes de enviar (parecer humano)
- Fallback: se Claude indisponível → resposta determinística baseada no top-1 KB
- Custo por mensagem: registrado em `estimatedCostUsd` na mensagem

## Referências

- ADR: `docs/architecture/decisions/001-agents.md`
- TMS Knowledge: `apps/backend/src/application/connectors/hipertms.connector.ts` → `getKnowledge()`
