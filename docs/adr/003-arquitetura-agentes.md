# ADR 003 — Arquitetura de Agentes

**Status:** Aprovado conceitualmente (execução faseada) · **Data:** 2026-06

## Contexto
A IA precisa vender, fazer onboarding, suporte, billing e analytics. Um único prompt
gigante vira inmanutenível e perigoso. Precisamos de uma arquitetura que escale e isole
responsabilidades.

## Decisão
Adotar **múltiplos agentes especializados** coordenados por um Router/Supervisor.
A arquitetura multiagente é o **ALVO**; a execução será **faseada** (ver abaixo).

### Plano de migração faseado

```
Fase 0 — Estado atual
- Um workflow Inbound no n8n faz classificação, resposta e envio.
- Sem Flowise multiagente. Sem backend NestJS dedicado.

Fase 1 — Router/Supervisor lógico no n8n
- Separar o prompt atual em blocos: router, sales, support (ainda no n8n).
- Sem mudar canal nem billing.

Fase 2 — Flowise com Router + Sales + Support
- Migrar orquestração LLM para Flowise.
- n8n continua executando integrações. Backend ainda pode ser mínimo.

Fase 3 — Backend NestJS validando ações
- Endpoints de ação: create_payment_request, escalate, update_context.
- Agentes não escrevem direto.

Fase 4 — Agentes completos
- Adicionar Onboarding, Billing, Knowledge Service e Analytics.
```
> Protege contra over-engineering: não implantar os 8 agentes de uma vez.

### Stack de execução
```
Flowise (Router + subagents)  →  n8n (execução/integrações)  →  Backend (validação/ação)
```

### Detalhamento dos agentes

Cada agente declara: responsabilidade, gatilho, ferramentas (read/solicita), autonomia,
quando escala e tabelas que usa.

#### Router/Supervisor (orquestrador)
- **Responsabilidade:** classificar intenção, rotear para o agente certo, validar entrada
  (prompt injection/risco) e saída (alucinação/LGPD/tom) — ver ia-autonoma 11.1
- **Gatilho:** toda mensagem entra e sai por ele
- **Ferramentas:** nenhuma ação externa; só decide e valida
- **Escala:** palavras de risco (processo/advogado/procon) → humano
- **Tabelas:** lê `ai_conversations`, grava `ai_escalations`, dispara `ai_quality_audits`

#### SDR Agent
- **Responsabilidade:** qualificar lead (entender porte, dor, fit)
- **Autonomia:** 100%
- **Ferramentas:** read `ai_customer_profile`, `ai_knowledge_base`
- **Escala:** lead quer falar com humano
- **Tabelas:** lê profile/KB; grava intent/score em `ai_messages`/`ai_classifications`

#### Sales Agent
- **Responsabilidade:** vender, tratar objeções, recomendar plano, **solicitar** link de pagamento
- **Autonomia:** 95% (financeiro = 20%: gera link, backend executa)
- **Ferramentas:** read `GET /plans` (TMS); solicita ação `create_payment` (via backend)
- **Escala:** negociação de desconto/condição especial → humano
- **Tabelas:** `ai_billing_requests` (solicita), `ai_actions`; consulta planos do TMS

#### Onboarding Agent
- **Responsabilidade:** guiar primeiros usos pós-venda
- **Autonomia:** 95%
- **Ferramentas:** read `ai_customer_context` (last_onboarding_step), KB técnica
- **Tabelas:** lê/atualiza `ai_customer_context`

#### Support Agent
- **Responsabilidade:** resolver dúvidas técnicas de uso do TMS
- **Autonomia:** 90% (anti-alucinação: se não sabe, escala)
- **Ferramentas:** Knowledge Service (KB aprovada)
- **Escala:** bug grave / fora do escopo → humano
- **Tabelas:** lê `ai_knowledge_base`/`ai_knowledge_versions`

#### Billing Agent
- **Responsabilidade:** informar status financeiro (read-only)
- **Autonomia:** 20% (nunca executa; só informa o que o backend/TMS determinou)
- **Ferramentas:** read status via API do TMS
- **Escala:** disputa/estorno → humano
- **Tabelas:** lê `ai_billing_requests`/`billing_events` (não escreve)

#### Knowledge Service (NÃO é agente conversacional)
- **Responsabilidade:** apenas recuperar o trecho certo na KB aprovada (e válida)
- **Natureza:** serviço de recuperação (retrieval), consumido pelos agentes — não conversa
- **Ferramentas:** busca por `tags`/categoria; futuro RAG (embeddings)
- **Regra:** só `approved=true AND valid_until válido`; se nada → "não encontrei"
- **Tabelas:** `ai_knowledge_base`, `ai_knowledge_versions`

#### Analytics Agent (futuro)
- **Responsabilidade:** responder métricas do cliente ("quantos CT-e emiti?", "faturamento?")
- **Ferramentas:** read API de relatórios do TMS
- **Autonomia:** 100% (read-only)

### Tabela-resumo (autonomia × papel)

| Agente | Autonomia | Escreve? | Escala quando |
|---|---|---|---|
| Router/Supervisor | — | escalations/audits | risco/segurança |
| SDR | 100% | mensagens | pede humano |
| Sales | 95% | solicita billing | desconto/condição |
| Onboarding | 95% | customer_context | trava no uso |
| Support | 90% | — | bug/fora escopo |
| Billing | 20% | — (read-only) | disputa/estorno |
| Knowledge Service | n/a (retrieval) | — (read-only) | — |
| Analytics | 100% | — (read-only) | — |

### Princípios
- Cada agente é pequeno, focado, testável isoladamente
- Autonomia por módulo (ver ia-autonoma 9.22) mapeia 1:1 com agentes
- Nenhum agente executa ação crítica direto — sempre via backend
- Supervisor valida segurança/tom/compliance/alucinação antes de responder (fases iniciais)

## Consequências
- (+) Manutenção e evolução isoladas; menos risco de "monstro de prompt"
- (+) Alinha com ecossistema atual (Flowise + n8n)
- (−) Mais peças para orquestrar; exige disciplina de contratos entre agentes

### Contrato entre agentes (como conversam)

Para evitar acoplamento, os agentes não se chamam diretamente. O Router orquestra e a
comunicação segue um **envelope padrão** (alinhado ao ADR 007 Event Catalog):
```json
{
  "correlationId": "abc123",
  "tenantId": "123",
  "fromAgent": "router",
  "toAgent": "sales",
  "intent": "pricing_question",
  "confidence": 0.92,
  "context": { "customer_stage": "lead", "history_ref": "conversation_id" },
  "payload": { }
}
```
- **Handoff:** Router decide o próximo agente; estado compartilhado via `correlationId`
- **Sem chamada direta agente→agente:** tudo passa pelo Router (ou por evento)
- **Ações externas:** nenhum agente chama TMS/Asaas direto — sempre via Backend (ADR 008)
- **Confidence:** `confidence < 0.60` → Router pede esclarecimento ou escala (não chuta)

### Mapa de decisão do Router

```
mensagem → Supervisor (valida entrada)
  → é cliente ativo? ─sim→ Support/Billing/Onboarding (por intenção)
                     └não→ SDR (qualifica) ──volta ao Router──→ Sales (vende)
  → resposta → Supervisor (valida saída) → envia
  → confidence < 0.60 → pedir esclarecimento ou escalar
  → risco/dúvida sem KB → Escalação humana
```
> Todo handoff passa pelo Router (regra: agente não chama agente). Ex: SDR → Router → Sales.

### Timeout e fallback (MVP — evita WhatsApp sem resposta)

```
Se um agente não responder em X segundos:
  → gerar resposta fallback ("Só um instante, já te respondo / vou verificar")
  → abrir escalation/failover (humano)
  → registrar erro (ai_actions.error + event_dlq se aplicável)
```

### Capability Matrix (segurança por agente)

| Agente | Pode ler | Pode solicitar | NÃO pode |
|---|---|---|---|
| Router/Supervisor | histórico | escalation / audit | executar ação |
| SDR | profile, KB | — | alterar dados |
| Sales | plans (TMS), KB | create_payment_request | dar desconto / alterar plano |
| Onboarding | customer_context, KB | update_context | alterar dados financeiros |
| Support | KB | escalation | alterar dados |
| Billing | billing status (TMS) | escalation | estorno / alterar cobrança |
| Knowledge Service | KB aprovada | — | escrever/alterar |
| Analytics | relatórios (TMS) | — | qualquer escrita |

## Risco principal
Acoplamento entre agentes. Mitigação: comunicação via Router + envelope padrão +
eventos (ADR 004); nenhum agente chama outro diretamente; ações externas só via backend.

---

## Notas para a IA revisora (GPT)

- **Realidade atual:** hoje há 1 agente único no n8n (workflow Inbound) funcionando.
  Esta arquitetura de múltiplos agentes é o **alvo** (com Flowise), não o estado atual.
  Migração será incremental — começar separando Router + Sales + Support, não os 8 de uma vez.
- **Flowise vs n8n:** Flowise para orquestração de agentes/LLM; n8n para execução/integrações
  (WAHA, TMS, banco). Não duplicar responsabilidades entre os dois.
- **Ações externas (TMS/Asaas):** sempre via Backend (ADR 008), nunca o agente direto.
- **Não duplicar o que o TMS tem:** Billing/Analytics agents consomem APIs do TMS (read-only).
- **Autonomia por módulo** (ia-autonoma 9.22) é a fonte de verdade dos % por agente.
