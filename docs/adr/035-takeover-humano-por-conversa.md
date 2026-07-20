---
tags:
  - adr
status: accepted
---

# ADR 035 — Takeover humano por conversa (Lia em modo rascunho)

| Campo | Valor |
|------|-------|
| **Status** | Aceito |
| **Data** | 2026-07-20 |
| **Autores** | Abel + squad Nexa |
| **Versão** | 1.0 |
| **Escopo** | `apps/backend` (agents, conversations, portal) + `apps/frontend` (inbox) |
| **Dependências** | ADR 034 (canal único); gate de números internos |

## Contexto

Hoje a Lia nunca fica em silêncio por conversa — é decisão explícita no código
("com a autonomia LIGADA, a Lia NUNCA fica em silêncio",
`conversation-agent.service.ts:147-151`). O status `escalated` existe mas não
bloqueia o auto-envio, nem no WhatsApp nem no portal
(`portal-tickets.service.ts:201`). Resultado: humano responde o chamado, o
cliente replica, e a Lia responde por cima do humano. O único mudo existente é
o kill switch global — ferramenta de emergência, não de atendimento.

## Decisão

- **D1 — Modo rascunho (não silêncio total):** com takeover ativo, a Lia não
  envia nada ao cliente, mas continua gerando sugestão de resposta interna
  para o humano (reaproveita o mecanismo existente de rascunho com
  `autoSent=false`). O cliente só recebe o que o humano mandar.
- **D2 — Gatilho automático:** a primeira mensagem outbound enviada por um
  humano na conversa ativa o takeover sozinha (sem botão). Chamados de suporte
  abertos pelo cliente já nascem escalados e portanto já nascem em takeover.
- **D3 — Devolução por duas portas:** botão "Devolver pra Lia" no inbox
  (explícito) OU fechamento da conversa (fechou → próxima interação do cliente
  recomeça com a Lia normal). Sem timeout automático.
- **D4 — Regra única:** o mesmo mecanismo vale para vendas (vendedor) e
  suporte (atendente). Sem casos especiais por área.

## Alternativas consideradas

- **A1 — Silêncio total da Lia no takeover** (rejeitada): perde a velocidade da
  sugestão pronta; o modo rascunho custa quase o mesmo e ajuda o humano.
- **A2 — Botão manual como único gatilho** (rejeitada): atendente esquece botão;
  mensagem dupla continuaria acontecendo até alguém lembrar de apertar.
- **A3 — Timeout devolvendo pra Lia sozinho** (rejeitada): humano demorar não
  significa que a IA deva retomar no meio de uma tratativa.

## Consequências / próximos passos

1. Flag de takeover por conversa (ex.: `humanTakeoverAt` no `AiConversation`) —
   migration aditiva.
2. `conversation-agent.handle()` passa a checar o flag: takeover ativo → gera
   rascunho, nunca auto-envia.
3. Envio de mensagem humana pelo inbox seta o flag; botão "Devolver pra Lia" e
   fechamento limpam.
4. Ordem geral acordada: (1) gate de números internos → (2) takeover →
   (3) deep link + botão "Estou fora" (ADR 034).
