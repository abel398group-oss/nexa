# Arquitetura de Agentes de IA — Nexa (Lia)

> Documento transversal da camada de IA. A decisão de arquitetura está no
> **ADR 003** (`docs/adr/003-arquitetura-agentes.md`); aqui descrevemos como a
> implementação atual em `apps/backend/src/application/agents/` opera.

## Objetivo

A **Lia** vende, faz onboarding, dá suporte, informa billing e responde métricas
via WhatsApp e e-mail. Um único "prompt gigante" é inmanutenível e perigoso. Por
isso adotamos **múltiplos agentes especializados** coordenados por um
**Router/Supervisor**.

Princípio inviolável: **a IA conversa e recomenda; o backend decide e executa.**
Nenhum agente chama outro diretamente, e nenhum agente executa ação externa
(TMS/cobrança) direto — sempre via backend (ADR 008/010/012).

## Agentes implementados

Em `apps/backend/src/application/agents/`:

| Serviço | Papel | Autonomia | Escreve? | Escala quando |
|---|---|---|---|---|
| `router-agent.service` | Classifica intenção e roteia | — | escalations/audits | risco/segurança |
| `conversation-agent.service` | Conduz o diálogo geral | alta | mensagens | pede humano |
| `sales-agent.service` | Vende, trata objeções, **solicita** link de pagamento | 95% (financeiro 20%) | solicita billing | desconto/condição especial |
| `support-agent.service` | Resolve dúvidas de uso do produto | 90% | — | bug/fora do escopo |
| `diagnostic-agent.service` | Diagnóstico guiado de chamados (playbooks) | média | — | sem resolução |
| `resolution-agent.service` | Propõe/aplica solução conhecida | média | — | falha na solução |
| `case-classifier-agent.service` | Classifica o chamado de suporte | read-only | classificação | — |
| `escalation-agent.service` | Decide e formaliza a escalada para humano | — | escalations | — |
| `supervisor-agent.service` | Valida entrada (injection/risco) e saída (alucinação/LGPD/tom) | — | audits | risco na saída |
| `web-chat.service` | Ponte do widget TMS (ADR 027): escuta `web_chat.inbound` e delega ao pipeline com `portalIdentity` | — | via conversation | — |
| `ticket-intelligence.service` | Análise pós-ticket (ADR 019): recorrência, bugs, sugestões de KB | read-only | notificações | — |

> Agentes de **Onboarding**, **Billing** e **Analytics** são alvo do ADR 003 e
> ainda não têm serviço dedicado (consumidos hoje por conversation/support) —
> status: backlog, sem previsão.
>
> **Contrato do web chat (ADR 027, atualizado 2026-07-03):** o widget TMS envia
> `web_chat:send { body }` e escuta `web_chat:message { id, body, isAgent, createdAt }`;
> o gateway aceita `body|message` e emite `message` (inbox Nexa) + `web_chat:message`
> (widget, apenas outbound).

## Como os agentes conversam (envelope padrão)

Para evitar acoplamento, agentes **não se chamam diretamente**. O Router orquestra
e o estado é compartilhado por `correlationId` (alinhado ao ADR 007 — Event Catalog):

```json
{
  "correlationId": "abc123",
  "tenantId": "123",
  "fromAgent": "router",
  "toAgent": "sales",
  "intent": "pricing_question",
  "confidence": 0.92,
  "context": { "customer_stage": "lead", "history_ref": "conversation_id" },
  "payload": {}
}
```

- **Handoff**: o Router decide o próximo agente; nunca agente→agente direto.
- **Confiança**: `confidence < 0.60` → o Router pede esclarecimento ou escala
  (não chuta). ✅ Implementado — o `router-agent.service` retorna `confidence` (0-1)
  e `needsClarification`; no 1º contato ambíguo o `conversation-agent` envia uma
  pergunta de direcionamento em vez de assumir a intenção. Limiar via
  `ROUTER_CONF_THRESHOLD` (default 0.6).
- **Risco jurídico/comercial**: ✅ Implementado — `LEGAL_RISK_RE` no `router-agent.service`
  detecta advogado/procon/processo/ação judicial/indenização/reclame aqui →
  `agent: 'human'` imediato (não passa pela IA), registra como reclamação e
  notifica o vendedor.
- **Anti-loop**: ✅ Implementado — após `MAX_AI_QUESTIONS` (default 3) turnos seguidos
  da Lia terminando em pergunta sem o lead esquentar, o `conversation-agent` para de
  reperguntar e escala para humano.
- **Ações externas**: nenhum agente chama TMS/cobrança direto — sempre via backend.

## Mapa de decisão do Router

```
mensagem → Supervisor (valida saída) ← (validação de ENTRADA: ver guardrails, ainda pendente)
  → opt-out (regex) → descadastra
  → risco jurídico (regex: advogado/procon/processo) → Escalação humana   ✅
  → é cliente ativo? ─sim→ Support / Billing / Onboarding (por intenção)
                     └não→ SDR/Conversation (qualifica) ──volta ao Router──→ Sales (vende)
  → confidence < 0.60 + intenção indefinida → pedir esclarecimento          ✅
  → Lia reperguntou ≥3x sem avanço (anti-loop) → Escalação humana           ✅
  → resposta → Supervisor (valida saída) → envia
  → risco / dúvida sem KB → Escalação humana
```

## Capability matrix (segurança por agente)

| Agente | Pode ler | Pode solicitar | NÃO pode |
|---|---|---|---|
| Router/Supervisor | histórico | escalation / audit | executar ação |
| Sales | planos (TMS), KB | `create_payment` | dar desconto / alterar plano |
| Support | KB aprovada | escalation | alterar dados |
| Diagnostic/Resolution | KB, status (TMS) | escalation | escrita irreversível |
| Billing (alvo) | status financeiro (TMS) | escalation | estorno / alterar cobrança |
| Knowledge (retrieval) | KB aprovada | — | escrever / alterar |

## Timeout e fallback (evita WhatsApp sem resposta)

```
Se um agente não responder em X segundos:
  → resposta fallback ("Só um instante, já verifico")
  → abrir escalation/failover (humano)
  → registrar erro (ai_actions.error + DLQ se aplicável)
```

## Modelo e custo

O cliente Anthropic (`shared/ai/anthropic.service.ts`) usa o modelo definido em
`AI_MODEL` (default `claude-haiku-4-5-20251001`), `temperature` baixa (0–0.4) e
rastreia tokens/custo por chamada (`completeWithUsage`). Respostas que exigem JSON
usam `completeJson` com extração robusta do objeto.

## Relacionados

- ADR 003 — Arquitetura de Agentes · ADR 004 — Event Bus · ADR 007 — Event Catalog
- ADR 015 — Arquitetura do Módulo de Suporte · ADR 016 — Classificação de Chamados
- `docs/ai/ai-guardrails.md` · `docs/ai/context-engineering.md`
- `docs/prd/ia-autonoma.md`
