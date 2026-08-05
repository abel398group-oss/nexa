# ADR 027 — Modalidade C: Web Chat de Suporte embutido (widget no HiperTMS)

**Status:** Aceito (implementado) · **Data:** 2026-06 · **Verificado:** 2026-08-05
> Implementado em `application/agents/web-chat.service.ts + presentation/ws/conversations.gateway.ts`. Status corrigido na auditoria do suporte
> (`docs/reviews/2026-08-05-auditoria-suporte.md`) — estava "Proposto" com o
> código em produção havia semanas.
**Evolui:** ADR 022 (Botão "Falar com a Lia" — Modalidade C)

> Implementa a **Modalidade C** prevista na ADR 022: um chat de suporte
> **embutido** no HiperTMS, ao lado do chat interno já existente. O cliente clica
> em "Falar com a Lia" e conversa com o suporte (a Lia, que vive no Nexa) **em
> tempo real, sem sair do sistema** — em vez de ser jogado pro WhatsApp.

## Contexto

Hoje o botão "Falar com a Lia (Suporte)" no HiperTMS abre o WhatsApp (Modalidade A
da ADR 022). O cliente sai do sistema e perde contexto. O HiperTMS já tem um
**widget de chat interno** (`apps/web/src/components/chat/`: `ChatWidget`,
`ChatList`, `UserSelectorModal`) para conversas entre pessoas da transportadora.

Queremos reusar esse widget para também falar com a Lia — **mesma interface, dados
separados**: o chat interno continua no TMS; o chat com a Lia fala com o Nexa.

Reaproveita (não reescrever): pipeline de suporte da Lia (ADR 003/015 —
`ConversationAgent` → classifica → diagnostica → resolve → escala + Supervisora),
o gateway Socket.IO (`presentation/ws/conversations.gateway.ts`), o modelo
`AiConversation` (`sourceChannel`) e o **handoff token** (ADR 022 Modalidade B) como
base de identidade.

> **Relação com o Portal de Suporte** (`docs/features/support-portal/`,
> `sourceChannel=portal`): são **canais irmãos** voltados ao cliente, ambos com
> identidade por handoff e pipeline da Lia. O **portal** é uma *página* autônoma
> (lista de chamados + chat); o **web_chat** é um *widget embutido* no TMS, ao
> lado do chat interno. Compartilham identidade e esteira; diferem no canal e na UI.

## Decisão

### D1 — Novo canal `web_chat`
Adicionar `web_chat` ao enum `SourceChannel` (hoje: `whatsapp`, `telegram`, `site`,
`instagram`, `facebook`, `email`, `portal`). Toda conversa do widget embutido nasce
com `sourceChannel = web_chat` (e `customerStage = cliente_ativo`). Migration Prisma
aditiva (Fase 2).

### D2 — Transporte em tempo real via Socket.IO (estende o gateway existente)
O widget conecta no WebSocket do Nexa (`/ws`, Socket.IO), **reusando o
`ConversationsGateway`**:

- Mantém o modelo de salas `conv:<conversationId>` e os eventos já existentes
  (`message` em `message.created`; `message:ack` em `message.updated`).
- **Estende** com um handler de **entrada de mensagem do cliente** (ex.:
  `SubscribeMessage('web_chat:send')`) que autentica o socket, garante a
  `AiConversation` da sessão e **roteia a mensagem pelo `ConversationAgent`** (a
  Lia). As respostas voltam pela sala via `message.created` (sem caminho novo).
- A autonomia respeita o **kill switch** e a **Supervisora** (igual ao WhatsApp).

### D3 — Autenticação do widget (sem segredo no browser)
- O TMS, **server-to-server**, obtém um **token de sessão curto** reusando/estendendo
  o `HandoffService` (`POST /api/handoff/token`, `Bearer TMS_SERVICE_TOKEN`),
  carregando a identidade do **usuário logado no TMS** (`externalId`, `name`,
  `tenantId`).
- O widget recebe **só o token** (opaco, TTL curto) e o envia no **handshake** do
  Socket.IO (`socket.handshake.auth.token`) — **nunca** o `TMS_SERVICE_TOKEN`.
- No `handleConnection`, o gateway **valida o token** (via `HandoffService`/sessão),
  resolve a identidade e **vincula o socket** a `{ externalId, tenantId, name }`
  pela duração da conexão. Token inválido/expirado → desconecta.
- **Identidade vem do token**, nunca do que o cliente digita (LGPD / anti-fraude;
  precedência do `externalId`, igual ADR 022 D5).

### D4 — Separação de dados (regra de ouro)
- **Chat interno** (pessoas da transportadora) → **TMS** (dados do TMS).
- **Chat com a Lia** → **Nexa** (`AiConversation`, `sourceChannel=web_chat`).
- Mesma interface (widget), **backends e dados separados**. Nenhuma mistura.

### D5 — Ciclo de atendimento idêntico ao WhatsApp
Lia resolve → se não resolve, **abre ticket / escala** → humano responde pelo
**Inbox do Nexa** e o atendimento aparece na **`SupportPage`**. Mesma esteira,
mesmos estados de `AiConversation` (ADR 015 D5: `resolved`, `autoCloseAt`, Janitor 48h).

### D6 — Fallback obrigatório (nunca deixar o cliente sem saída)
Se o Nexa/WS estiver indisponível (timeout de conexão, erro de handshake, queda),
o widget **oferece o caminho do WhatsApp** (o botão atual, Modalidade A). O cliente
nunca fica preso num widget quebrado.

### D7 — Segurança
- **Origin allowlist** no gateway: trocar o atual `cors.origin: true` por uma lista
  explícita (domínio(s) do TMS), via env (ex.: `WEBCHAT_ALLOWED_ORIGINS` ou reusar
  `CORS_ORIGINS`). Recusar handshake de origem não permitida.
- **Token de curta duração**, uso único para abrir a sessão; segredo só server-to-server.
- **Rate limit** de conexões/mensagens por socket/identidade.
- **Isolamento por tenant** em toda query (`tenantId` da identidade, nunca do payload).
- **Sem dados sensíveis no cliente** (nem `TMS_SERVICE_TOKEN`, nem segredos, nem PII de terceiros).

## Alternativas consideradas

- **A1 — Continuar só no WhatsApp (Modalidade A):** rejeitada como solução única —
  tira o cliente do contexto; mantida apenas como **fallback** (D6).
- **A2 — Polling HTTP em vez de WebSocket:** rejeitada — pior latência/custo; já
  temos Socket.IO pronto.
- **A3 — Novo gateway dedicado ao web_chat:** preterida — reusar o
  `ConversationsGateway` evita duplicar salas/eventos; a autenticação do widget
  entra como handshake/handler adicional.
- **A4 — Reusar o handoff token de 5 min direto como sessão:** insuficiente para
  uma conversa contínua; o handoff abre a sessão, mas a identidade fica vinculada
  ao socket pela duração da conexão (sessão de chat).

## Consequências

**Positivas**
- Cliente fala com a Lia sem sair do TMS; mesma esteira do WhatsApp (zero pipeline novo).
- Reusa widget (TMS), gateway, pipeline e handoff — pouco código novo, baixo risco.
- Fallback de WhatsApp garante continuidade.

**Custos / atenção**
- Migration do enum + endurecer CORS do gateway (hoje `origin: true`).
- Autenticação no handshake do Socket.IO (novo) + rate limit no WS.
- Coordenação com o TMS (Uelder) para o widget e o endpoint server-side do token.

## Referências

- ADR 022 — Botão "Falar com a Lia" / handoff (Modalidade C agora em implementação)
- ADR 003/015 — Pipeline da Lia / Suporte · ADR 012 — Action Policy · ADR 005 — Segurança
- `docs/features/support-web-chat/prd.md` · `docs/features/support-portal/implementation.md`
- Código: `presentation/ws/conversations.gateway.ts` · `application/handoff/*` ·
  `prisma/schema.prisma` (`SourceChannel`, `AiConversation`)

## Histórico de revisões

| Versão | Data | Alteração | Autor |
|--------|------|-----------|-------|
| 1.0 | 2026-06 | Criação — Modalidade C (web chat embutido) | — |
