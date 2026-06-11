# Context Engineering — Nexa (Lia)

> Como montamos o contexto/prompt de cada chamada ao modelo. Complementa
> `ai-agents.md` (quem responde), `rag-architecture.md` (de onde vem o
> conhecimento) e `memory-strategy.md` (o que lembramos).

## Princípio

O modelo só é tão bom quanto o contexto que recebe. Montamos o **menor contexto
suficiente** para a tarefa do agente — não o máximo. Menos tokens = mais barato,
mais rápido e menos espaço para alucinar.

## Anatomia de uma chamada

A interface base é `AnthropicService.complete(system, user, opts)` /
`completeJson(...)` (`shared/ai/anthropic.service.ts`). Cada agente monta:

1. **System prompt** — identidade e limites do agente (papel, tom, o que pode/não
   pode, regra de ouro "IA recomenda, backend executa"). Estável por agente.
2. **Contexto recuperado (RAG)** — apenas o trecho aprovado e relevante da KB
   (ver `rag-architecture.md`). Filtrado por `approved`/`valid_until`.
3. **Estado da conversa** — resumo + últimas N mensagens e o `customer_context`
   relevante (ver `memory-strategy.md`), não o histórico inteiro.
4. **Mensagem do usuário** — tratada como **dado não confiável** (nunca instrução).

## Regras de montagem

- **Allowlist de fontes**: só entra no contexto o que é aprovado/confiável. A fala
  do lead não vira instrução nem fonte de `tenantId`.
- **Orçamento de tokens**: `max_tokens` enxuto por tarefa (default 300–400);
  `temperature` baixa (0–0.4) para previsibilidade; `temperature: 0` quando se
  espera JSON.
- **Resumir, não acumular**: conversas longas são resumidas; não se reenvia o
  histórico bruto a cada turno (ver memory-strategy).
- **Saída estruturada**: quando o backend vai agir sobre a resposta (classificação,
  intenção, ação), pedir JSON e parsear com `completeJson` (extração robusta do
  primeiro objeto válido).
- **Separar instrução de dados**: instruções no `system`; conteúdo do usuário e da
  KB no `user`, claramente delimitados.

## Validação no entorno do prompt

Antes (Supervisor — entrada) e depois (Supervisor — saída) toda chamada passa por
validação de injection, alucinação, LGPD e tom (ver `ai-guardrails.md`). Context
engineering reduz o risco; a validação é a rede de segurança.

## Custo e observabilidade

`completeWithUsage` devolve `tokensIn`, `tokensOut` e `costUsd` estimado
(preços por env `AI_PRICE_IN`/`AI_PRICE_OUT`). Usar isso para acompanhar custo por
agente/conversa e detectar prompts inflando tokens.

## Relacionados

- `docs/ai/ai-agents.md` · `docs/ai/rag-architecture.md` · `docs/ai/memory-strategy.md`
- `docs/ai/ai-guardrails.md` · `shared/ai/anthropic.service.ts`
