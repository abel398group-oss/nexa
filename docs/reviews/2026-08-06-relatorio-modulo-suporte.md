# Relatório Consolidado — Módulo de Suporte (Nexa)

**Data:** 2026-08-06 · **Escopo:** widget de suporte no HiperTMS → Lia → ticket
→ time humano → retroalimentação da base de conhecimento.
**Base:** auditoria de 2026-08-05 (`docs/reviews/2026-08-05-auditoria-suporte.md`)
+ Passos 1-3 desta rodada (commits `349e170`, `b981b27`, `adc17cf`).

> Todo dado técnico abaixo foi conferido direto no código (`arquivo:linha`),
> não é descrição de intenção. Onde uma afirmação inicial estava errada, o
> texto já vem corrigido — ver nota de correção na seção 1.

---

## Parte 1 — Visão Técnica e Arquitetural (Squad de Engenharia)

### 1.1 Cadeia de agentes

```
Widget HiperTMS
  → ConversationsGateway (WebSocket)
  → WebChatService.handleInbound()
  → ConversationAgentService.handle()
      → CaseClassifierAgentService.classify()   (categoria + prioridade)
      → DiagnosticAgentService.diagnose()        (causa-raiz, leitura TMS read-only)
      → ResolutionAgentService.resolve()         (texto que o cliente lê)
      → EscalationAgentService.decide()          (matriz determinística, sem IA)
  → SupportAgentService (orquestra os 4 acima + N2/CSAT/ticket number)
```

- **Router** decide `sales` vs `support` antes de chegar aqui — não faz parte
  da cadeia de suporte em si, mas é quem roteia pra ela quando não há token
  de handoff nem `[via-painel-tms]`.
- Nenhum agente chama outro agente diretamente: tudo passa pelo
  `SupportAgentService` como orquestrador
  (`apps/backend/src/application/agents/support-agent.service.ts`).
- `EscalationAgentService.decide()` é **matriz de regras, não IA** — decisão
  de escalar precisa ser auditável e determinística (ADR 015 D6).

### 1.2 Protocolo de tokens — correção de premissa

Uma descrição inicial deste fluxo presumia um **modelo de 3 camadas** (JWT do
usuário → Handoff Token → "Nexa Session Token" de 15 min). **Isso não existe
no código.** O que existe de fato, conferido em
`apps/backend/src/application/handoff/handoff.service.ts` e
`apps/backend/src/presentation/ws/conversations.gateway.ts`, é um modelo de
**2 hops**:

1. **TMS → Nexa (server-to-server)**: o TMS chama o Nexa autenticado por um
   secret estático, `TMS_SERVICE_TOKEN` (`handoff.service.ts:22-43`, fail-closed
   em produção) — não é o JWT do usuário logado no TMS. `HandoffService.create()`
   (`handoff.service.ts:73-104`) gera o **Handoff Token** (8 chars,
   base64url, `handoff.service.ts:6-9`), TTL de **5 min por padrão**
   (`TOKEN_TTL_MS_DEFAULT`, linha 11) ou **15 min para o widget** de web chat
   (`TOKEN_TTL_MS_WEBCHAT`, linha 12, usado em `portal.controller.ts:155`).
2. **Browser → Nexa (handshake WebSocket)**: o widget conecta em `/ws` com o
   Handoff Token em `socket.handshake.auth.token`.
   `ConversationsGateway.handleConnection` (`conversations.gateway.ts:116-172`)
   chama `HandoffService.consume(token)` (`handoff.service.ts:107-134`) —
   **uso único**: marca `usedAt`, rejeita replay e token expirado. O
   `HandoffContext` resultante fica preso a `socket.data` pelo tempo de vida
   do socket (`conversations.gateway.ts:154-160`). **Não existe** um terceiro
   token emitido depois disso.

Separadamente, o **inbox do operador Nexa** (não o widget do cliente) usa um
JWT convencional em cookie (`access_token`), verificado inline em
`conversations.gateway.ts:117-134` — é a sessão do atendente humano, sem
relação com o fluxo do widget.

**Resumo:** 2 tokens (secret de serviço → Handoff Token de uso único), mais
um JWT de operador que é um sistema à parte. Nenhum "Nexa Session Token"
existe no código — busca por `session.?token` em todo `apps/backend/src`
não retorna nada.

### 1.3 Injeção de contexto real — `page` na saudação (Passo 1, `349e170`)

O token de handoff já carregava `page` (tela do TMS de origem) desde antes
desta rodada, mas o dado morria na camada de WebSocket — nenhum agente
recebia. Cadeia de propagação implementada:

```
HandoffContext.page (handoff.service.ts:57-64)
  → WebChatSocketData.page (conversations.gateway.ts)
  → WebChatInboundEvent.page (web-chat.service.ts)
  → portalIdentity.page (conversation-agent.service.ts, linhas 168/419/600)
  → tmsCustomer.page (conversation-agent.service.ts + support-agent.service.ts)
      ├→ DiagnosticAgentService.diagnose() — customerCtx inclui "na tela: X"
      └→ ResolutionAgentService.resolve() — system prompt ganha pageCtx,
         instrui a Lia a contextualizar a saudação sem inventar relação
         com o problema quando não fizer sentido
```

Zero mudança de contrato do lado do TMS — o campo já existia no token, só
não era lido. Testes: 82 → 89 nos specs afetados.

### 1.4 Mecanismo de escalonamento e resumo executivo (Passo 3, `adc17cf`)

`EscalationAgentService.decide()` ganhou um campo `summary: string | null`
na interface `EscalationDecision`, construído por `buildSummary()` — método
privado, **sem chamada à IA** (a decisão de escalar já é matriz de regras;
resumir o que os agentes anteriores já produziram não precisa de outra
chamada ao modelo):

```
[Problema Relatado]     — input.message, truncado em 200 chars
[Ações Tentadas]         — diagnostic.rootCause + suggestedAction,
                            e/ou resolution.draft quando resolved=false
[Causa do Transbordo]    — rótulo legível do reason code (REASON_LABELS)
```

`summary` é `null` quando `escalate=false` — não faz sentido resumir um caso
que a IA resolveu sozinha.

**Persistência:** nova coluna `AiConversation.escalationSummary`
(`prisma/schema.prisma:268`, migration `20260806100000_escalation_summary`,
aditiva/nullable). Gravada em `support-agent.service.ts:184-185`, só no
momento da escalação, sem depender da notificação ter sido lida/descartada.

**Consumo:**
- Corpo da notificação de escalonamento (`support-agent.service.ts:172-178`)
  — usa `summary` quando existe, cai no formato antigo
  (categoria/prioridade/motivo) quando `null`.
- Banner no card do Inbox — ver seção 2.2.

Testes: 25 no `escalation-agent.service.spec.ts` (4 novos casos cobrindo
summary), suíte completa 1055 → 1061.

### 1.5 Contratos pendentes com o TMS (Passo 2, `b981b27`)

Documento completo em
`docs/features/tms-native-support/especificacao-contexto-cliente-e-reenvio-fatura.md`.
Resumo dos 2 pedidos, independentes entre si:

1. **`companyName` e `cnpj` no token de handoff** — hoje o token só carrega
   `externalId/tenantId/name/page/errorCode/isManager`
   (`handoff.service.ts:57-64`, zero ocorrências de `companyName`/`cnpj` em
   todo o código — confirmado por grep, corrige uma presunção anterior de
   que esses campos já existiam e eram descartados).
2. **`POST /nexa/invoices/resend`** — primeira ação de autosserviço da Lia.
   Escolhida sobre reprocessamento de CT-e/MDF-e por ser **idempotente e sem
   risco fiscal/SEFAZ**. Explicitamente **não** é reaproveitamento de
   `createPaymentRequest` (`hipertms.connector.ts:1177-1193`) — aquele stub
   cria cobrança nova (onboarding), ação categoricamente diferente de
   reenviar uma fatura já existente. Auth proposta: `Bearer TMS_SERVICE_TOKEN`
   (mesmo padrão das leituras existentes — `getContractStatus`, etc. — não o
   HMAC usado por `syncTicket`, que é webhook assíncrono em sentido oposto).

### 1.6 Job de inteligência — `TicketIntelligenceService`

`apps/backend/src/application/agents/ticket-intelligence.service.ts:74` —
`@Interval(30 * 60 * 1000)` em `runIntelligence()`, com lock via Redis
(mesmo padrão de outros crons do repo) para não rodar em duplicidade entre
réplicas. Janela de leitura: últimas 2h de tickets fechados
(`LOOK_BACK_HOURS`, comentário na linha 10).

Dois caminhos distintos, não confundir:

- **`generateKbDraft()`** (linhas 311-402) — dispara quando o ticket foi
  **escalado E fechado E tem rootCause** (`wasEscalated && status ===
  'closed' && rootCause`, linhas 164-171). Monta prompt a partir da
  transcrição, chama `KnowledgeService.create()` com o artigo **não
  aprovado** — curadoria humana obrigatória antes de ir ao ar (linhas
  373-374). É o mecanismo real de "aprender com o humano que resolveu".
- **`suggestKbArticle()`** (linhas 404-431) — caso a IA tenha resolvido
  sozinha (sem escalar), só cria uma **notificação sugerindo** artigo, não
  gera o draft automaticamente.

---

## Parte 2 — Visão Funcional e UX

### 2.1 Para o cliente/usuário no HiperTMS

**Abrir o widget:** o botão de suporte dentro do TMS abre um drawer que
carrega o chat via WebSocket, autenticado pelo Handoff Token (seção 1.2) —
o cliente nunca vê nem digita nenhum token, é tudo server-to-server.

**Saudação contextual:** com o Passo 1 em produção, se o cliente abriu o
widget a partir de, por exemplo, `/fiscal/cte`, a Lia recebe essa informação
no prompt e pode mencionar a tela quando fizer sentido ("vi que você está na
emissão de CT-e") — sem inventar relação com o problema quando o contexto
não ajuda (regra explícita no prompt do `ResolutionAgent`).

**Por que não parece URA engessada:**
- A Lia nunca pede identificação (nome, CNPJ, CPF, e-mail) — a regra de
  LGPD/antifraude é explícita no prompt de diagnóstico e no de resolução
  (achado S-05 da auditoria de 05/08, já fechado): quem fala já veio
  autenticado do sistema.
- Playbooks determinísticos (ADR 017) guiam o diagnóstico por categoria sem
  travar a conversa em um script fixo — a Lia usa os passos do playbook mas
  redige a resposta.
- Instabilidade do TMS é comunicada como tal ("sistema instável, tente em
  minutos"), nunca como "seu contrato não existe" (achado S-03).

**Confirmação e encerramento:**
- Quando a IA resolve, agenda `autoCloseAt` (+48h) e troca o draft por "Isso
  resolveu? Responda sim/não" — fechamento real só com confirmação do
  cliente ou pelo janitor por silêncio.
- CSAT (1-5) é coletado no fechamento, inclusive via resposta direta no
  WhatsApp quando o ticket já está fechado aguardando nota
  (`support-agent.service.ts`, fluxo C1).
- Horário: a Lia responde 24/7; o SLA e as mensagens de "em breve" só
  contam horário comercial real (S-06, `support-hours.ts`), sem prometer
  retorno humano fora do expediente.

### 2.2 Para o analista de suporte no Inbox do Nexa

**Correção de path:** o Inbox não fica em `apps/web/src/features/support`
(esse diretório não existe no repo). O arquivo real é
[`apps/frontend/src/pages/InboxPage.tsx`](../../apps/frontend/src/pages/InboxPage.tsx).

**Identificação da empresa no card da lista** — confirmado, já existe
(`InboxPage.tsx:669-674`):

```tsx
{c.contact?.company && (
  <div className="flex items-center gap-1 truncate text-[11px] text-base-content/60 font-medium">
    <Icon name="building" className="h-3 w-3 shrink-0 text-base-content/40" />
    {c.contact.company}
  </div>
)}
```

Ícone de prédio + nome da transportadora direto na lista de conversas —
o atendente não precisa abrir o chamado para saber de qual empresa é.

**Banner de resumo executivo** (novo, Passo 3) —
`InboxPage.tsx:930-940`, renderizado no topo do painel de detalhe quando
`scope === 'support' && active.status === 'escalated' &&
active.escalationSummary` existe:

```tsx
{scope === 'support' && active.status === 'escalated' && active.escalationSummary && (
  <div className="border-b border-base-200 bg-amber-50 px-4 py-2.5">
    <div className="flex items-start gap-2">
      <Icon name="knowledge" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
      <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-amber-900">
        {active.escalationSummary}
      </pre>
    </div>
  </div>
)}
```

O atendente vê as 3 linhas ([Problema] / [Ações Tentadas] / [Causa do
Transbordo]) assim que abre o chamado escalado — sem precisar rolar o chat
inteiro para reconstruir o que já foi tentado.

**Transição de status:**

```
open ⇄ waiting_customer / waiting_internal
  → escalated  (regra do EscalationAgent, ou IA não resolveu, ou humano reabre)
  → closed     (confirmação do cliente, auto-close 48h, ou fechamento manual)
```

Não é uma state machine centralizada — cada transição é setada pelo serviço
dono daquele momento do fluxo:

| Transição | Onde |
|---|---|
| `→ escalated` | `conversation-agent.service.ts:832`, `support-agent.service.ts:392`, `conversation-janitor.service.ts:145`, `portal-tickets.service.ts:142` |
| `→ closed` | `support-agent.service.ts:369` (IA resolveu + confirmado), `conversation-janitor.service.ts:341/395/452` (auto-close/sem resposta), `conversations.service.ts:228/252/269` (fechamento manual) |

**Retroalimentação:** todo ticket escalado e fechado com `rootCause`
preenchido vira candidato a rascunho de KB automaticamente, 30 em 30
minutos (`TicketIntelligenceService`, seção 1.6) — mas sempre como rascunho
não aprovado, nunca publicado sem revisão humana.

---

## Relacionados

- `docs/reviews/2026-08-05-auditoria-suporte.md` — auditoria que originou
  os achados S-01 a S-06 e o Passo 1/3 desta rodada.
- `docs/features/tms-native-support/especificacao-sync-ticket-tms.md` —
  contrato já implementado dos dois lados (histórico de ticket → TMS).
- `docs/features/tms-native-support/especificacao-contexto-cliente-e-reenvio-fatura.md`
  — os 2 contratos pendentes descritos na seção 1.5.
- Commits desta rodada: `349e170` (Passo 1), `b981b27` (Passo 2, doc),
  `adc17cf` (Passo 3).
