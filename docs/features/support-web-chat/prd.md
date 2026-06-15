---
tags:
  - prd
  - feature
  - support
status: draft
---

# PRD — Web Chat de Suporte embutido (Lia no HiperTMS)

| Campo | Valor |
|------|-------|
| **Status** | Rascunho |
| **Data** | 2026-06 |
| **Dono** | (a definir) |
| **Domínio** | suporte / web_chat |
| **Decisão** | ADR 027 (evolui ADR 022 — Modalidade C) |

## Problema

O cliente do HiperTMS com dúvida hoje precisa **sair do sistema** e abrir o
WhatsApp para falar com a Lia. Perde contexto e fricção alta. Queremos que ele
converse com o suporte (a Lia) **dentro do TMS**, em tempo real, **ao lado** do
chat interno que já existe — sem novo login e sem misturar os dados.

## Objetivo & métricas de sucesso

- **Objetivo:** abrir um chat embutido com a Lia a partir do botão "Falar com a Lia".
- **Sucesso:** % de atendimentos de suporte iniciados pelo widget (vs. WhatsApp);
  tempo até a 1ª resposta; taxa de resolução sem humano; queda de "cliente perdido"
  por fricção. Zero incidente de vazamento entre tenants / entre chat interno e Lia.

## Personas

- **Cliente do HiperTMS (usuário logado):** quer resolver uma dúvida operacional
  (fiscal, CT-e, frete, financeiro) sem sair da tela em que está.
- **Atendente humano (Nexa):** recebe o que a Lia escala, responde pelo **Inbox**
  do Nexa; o caso aparece na **`SupportPage`**.
- **Operador interno da transportadora:** continua usando o **chat interno** do TMS
  (entre pessoas) — não muda nada para ele.

## Escopo

### Dentro do escopo
- Opção **"Lia (Suporte)"** dentro do widget de chat do TMS (`components/chat/`),
  ao lado de **"Equipe"** (chat interno).
- Conversa em tempo real com a Lia via WebSocket do Nexa (`sourceChannel=web_chat`).
- Identidade automática do usuário logado (via token server-to-server, ADR 027 D3).
- Escalonamento para humano (mesma esteira do WhatsApp) e fallback de WhatsApp.

### Fora do escopo
- Mudar o **chat interno** do TMS (continua igual, dados no TMS).
- Ações de escrita no TMS pela Lia (qualquer ação real vai pela API do TMS — ADR 012).
- Web chat para **prospect** (é pós-venda; sem `externalId` válido não há sessão — ADR 026).

## Fluxo de UX (no widget)

1. Usuário abre o widget de chat no TMS e clica em **"Nova Conversa"**.
2. Escolhe o destino:
   - **Equipe** → chat interno (TMS, como hoje).
   - **Lia / Suporte** → abre o chat embutido com a Lia (Nexa).
3. Ao escolher Lia: o TMS obtém o token de sessão (server-side) e o widget **conecta
   no WebSocket do Nexa**; mostra estado **"conectando…"**.
4. Conectado: o usuário conversa com a Lia em tempo real. A Lia diagnostica e
   resolve; se não resolver, **abre ticket / escala** e avisa que um humano vai
   responder (o caso entra no Inbox/`SupportPage` do Nexa).
5. O histórico fica vinculado ao cliente (mesma esteira; reaparece também no Portal).

> **Diferença clara na UI:** rotular bem "Equipe" (pessoas da transportadora) vs.
> "Lia / Suporte" (assistente do produto), para o usuário nunca confundir os canais.

## Estados do widget (Lia)

| Estado | Quando | O que mostra |
|---|---|---|
| Conectando | abrindo o WS | spinner "conectando ao suporte…" |
| Conectado | handshake ok | chat ativo com a Lia |
| Digitando | Lia processando | indicador "Lia está digitando…" |
| Reconectando | queda transitória do WS | aviso discreto + tentativa automática |
| Erro / indisponível | Nexa/WS fora, token inválido | **fallback**: botão "Falar pelo WhatsApp" |
| Escalado | Lia abriu ticket p/ humano | "Encaminhei para um especialista, já te respondem" |

## Modelo de dados / API

- Conversa = `AiConversation` (`sourceChannel=web_chat`, `customerStage=cliente_ativo`),
  escopada por `tenantId` + identidade (`externalId`).
- Token de sessão: reusa/estende `HandoffService` (`POST /api/handoff/token`,
  server-to-server). Transporte: Socket.IO `/ws` (estende `ConversationsGateway`).
- Detalhes técnicos e segurança: **ADR 027**.

## IA / Autonomia

Mesmo pipeline da Lia (router → support → diagnostic/resolution/escalation →
supervisor). Respeita kill switch de autonomia e a Supervisora. Tema
fiscal/financeiro incerto → escala humano (ADR 015 D6). Leitura de dado do TMS é
read-only via Connector; **nunca** escreve no TMS.

## Critérios de aceite

- [ ] No widget do TMS, "Lia (Suporte)" abre um chat **embutido** (não o WhatsApp).
- [ ] A conversa é em **tempo real** (Socket.IO) e identificada (sem login manual).
- [ ] Conversa da Lia grava em `AiConversation` com `sourceChannel=web_chat`; **não**
      se mistura com o chat interno do TMS.
- [ ] O que a Lia não resolve **vira ticket/escala** e aparece no Inbox/`SupportPage` do Nexa.
- [ ] **Fallback**: com Nexa/WS fora ou token inválido, o widget oferece o WhatsApp.
- [ ] Identidade vem do token server-to-server; segredo **nunca** no browser.
- [ ] Origin allowlist no WS; isolamento por tenant; rate limit; sem PII sensível no cliente.
- [ ] Estados de UX (conectando/erro/reconectando) implementados e claros.
- [ ] O chat interno do TMS **continua funcionando igual** (nada quebrado).

## Riscos & dependências

- **Dependências:** Modalidade B (handoff com nome) como base de auth; reconhecimento
  de cliente (telefone via `TMS_DB_URL` agora, API `/nexa/*` depois — já encaminhado);
  os 3 endpoints read-only `/nexa/*` no TMS (implementados, aguardando CI/deploy).
- **Riscos:** endurecer CORS do gateway sem quebrar o Inbox atual; coordenar a
  entrega TMS↔Nexa (token + widget) com o Uelder; reconexão de WS sob rede instável.

## Referências

- ADR 027 — Web Chat embutido · ADR 022 — Botão Lia/handoff · ADR 015 — Suporte
- `docs/features/support-portal/` · `docs/ai/ai-agents.md` · `docs/ai/ai-guardrails.md`
