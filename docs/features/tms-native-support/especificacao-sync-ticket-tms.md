# Especificação — Sincronizar histórico de ticket com o TMS

**Data:** 2026-08-05 · **Status:** Implementado dos dois lados — Nexa (este
doc) e TMS (endpoint receptor, ver seção "Do lado do TMS" abaixo).
**Decisão de produto (Abel, 2026-08-05):** o suporte é atendido **dentro do Nexa**
— o time humano não muda de ferramenta. O TMS recebe só o **histórico** do
ticket, para o cliente conseguir consultar dentro do próprio TMS.

> Este documento é o pedido do lado Nexa. A implementação do lado TMS
> (endpoint que recebe) é responsabilidade do time do TMS — aqui vai a forma,
> o conteúdo e a frequência do que o Nexa vai mandar.
>
> **Não confundir com `implementation.md`** (mesma pasta): aquele é sobre a
> TELA de suporte dentro do TMS consumindo a API do Nexa (cliente → Nexa, via
> TMS). Este é o caminho inverso: Nexa → TMS, o resumo do ticket voltando pro
> histórico do cliente depois de resolvido.

## Por que este documento existe

A auditoria de suporte (`docs/reviews/2026-08-05-auditoria-suporte.md`)
confirmou: **hoje nada é enviado ao TMS.** O ticket existe só no banco do Nexa
— `HiperTmsConnector` só *lê* do TMS, nunca escreve
(`apps/backend/src/application/connectors/hipertms.connector.ts`). Não existe
`createTicket` nem qualquer chamada de escrita.

## O que muda, e o que não muda

- **Não muda:** onde o suporte é atendido. Continua 100% no Nexa — Lia
  responde, humano assume no inbox do Nexa quando escala.
- **Muda:** ao final de cada ticket (ou em pontos-chave do ciclo), o Nexa
  **envia** um resumo pro TMS, para aparecer na tela do cliente lá.

## Dado de origem (schema real, não hipótese)

Tudo já existe hoje em `AiConversation`
(`apps/backend/prisma/schema.prisma:220-276`) — não é campo novo, é campo que
já é preenchido e nunca foi enviado a lugar nenhum:

| Campo Nexa | Tipo | Preenchido por | Exemplo |
|---|---|---|---|
| `externalId` | `String?` | Identidade do cliente vinda do TMS (token do widget) | `"ext-4821"` |
| `ticketNumber` | `Int?` | Sequencial por tenant, gerado atomicamente (`TicketCounter`) | `47` |
| `ticketCategory` | `String?` | `case-classifier-agent.service.ts` — 12 valores (fiscal, cte, mdfe, frete, financeiro, cadastro, frota, usuarios, integracoes, api, erro_sistema, treinamento) | `"cte"` |
| `ticketPriority` | `String?` | Mesmo classificador — `critical \| high \| medium \| low` | `"high"` |
| `rootCause` | `String?` | `DiagnosticAgent` — causa-raiz em texto livre | `"Certificado digital vencido"` |
| `status` | enum | `open \| waiting_customer \| waiting_internal \| escalated \| opt_out \| closed` — **normalizado pra `open`/`closed` antes de sair** (ver nota abaixo) | `"closed"` |
| `resolvedAt` | `DateTime?` | Quando a IA marcou como resolvido | — |
| `csatScore` | `Int?` | Nota 1-5 que o cliente dá no encerramento | `4` |
| `subject` | `String?` | Resumo curto do chamado | `"CT-e não emite"` |

> **Nota (2026-08-06):** o primeiro ticket sincronizado em produção tinha
> status interno `escalated` (Lia chamou humano, ainda não fechado) e o TMS
> devolveu 400 — a validação deles foi construída certinha em cima do que este
> documento tinha (só `open`/`closed` como exemplo, os outros 4 estados nunca
> foram documentados). Corrigido do lado Nexa: `TicketSyncService` normaliza
> qualquer status interno pra `open` ou `closed` antes de enviar — **o TMS
> nunca recebe os outros 4 valores**, o contrato original está correto sem
> precisar mudar nada do lado deles.

## O que o Nexa propõe enviar

**Payload por evento** (webhook, ver seção seguinte):

```json
{
  "event": "ticket.updated",
  "tenantId": "t1",
  "externalId": "ext-4821",
  "ticketNumber": 47,
  "category": "cte",
  "priority": "high",
  "status": "closed",
  "subject": "CT-e não emite",
  "rootCause": "Certificado digital vencido",
  "resolvedByAi": false,
  "resolvedAt": "2026-08-05T14:32:00Z",
  "csatScore": 4,
  "conversationUrl": "https://app.nexa.../inbox?c=<conversationId>"
}
```

- `resolvedByAi`: `true` se a Lia resolveu sozinha, `false` se um humano do
  Nexa assumiu — dá pro TMS diferenciar os dois casos na tela do cliente, se
  quiser.
- `conversationUrl`: **opcional**, só se o time do TMS quiser um link de volta
  pro Nexa (ex.: um atendente do TMS que precise ver a conversa completa).
- **Não enviamos** o conteúdo das mensagens trocadas — só o resumo. Se o TMS
  precisar do histórico completo da conversa, isso é uma decisão separada
  (dado mais sensível, mais LGPD envolvida) — não faz parte deste pedido
  inicial.

## Quando enviar

Dois pontos no ciclo, ambos já existem como eventos internos no Nexa hoje:

1. **`ticketNumber` atribuído** (chamado virou ticket de verdade) —
   `support-agent.service.ts:275-299`, evento interno já emitido.
2. **`status` muda para `closed`** (resolvido, por IA ou por humano) — ponto
   de fechamento do `ConversationJanitorService` /
   `support-agent.service.ts`.

Não propomos enviar a cada mensagem — isso geraria tráfego alto e a maior
parte da conversa (a Lia tentando resolver) não interessa ao TMS.

## Formato de transporte — a decidir com o time do TMS

Duas opções, ambas viáveis do lado Nexa:

**A) Webhook (Nexa chama o TMS)** — mais simples pro Nexa, mas depende de o TMS
expor um endpoint que aceite POST autenticado. É o padrão que o Nexa já usa
pra outras integrações de saída (`docs/adr/` tem exemplos de webhook outbound
com HMAC).

**B) Polling (TMS chama o Nexa)** — o Nexa expõe `GET /api/tms/tickets?since=`
e o TMS busca periodicamente. Mais simples de operar (sem gerenciar retry de
webhook), mais lento (não é tempo real).

**Recomendação do lado Nexa: opção A**, com assinatura HMAC (mesmo padrão já
usado nos webhooks outbound existentes) e retry com backoff exponencial em
caso de falha do lado TMS.

## O que o Nexa NÃO está pedindo agora

- Não pedimos que o TMS **escreva de volta** no Nexa (ex.: cliente responde
  pelo TMS). Isso seria um segundo fluxo, mais complexo (voltaria a exigir que
  a Lia soubesse reagir a uma resposta que não veio pelo canal dela).
- Não pedimos o histórico completo de mensagens — só o resumo do ticket.

## Do lado do TMS (implementado)

O time do TMS foi com a opção A (webhook) — exatamente como recomendado aqui.

- **Endpoint:** `POST https://www.hipertms.com.br/api/nexa/tickets`
- **Assinatura:** `X-Nexa-Signature: sha256=<hmac-sha256 hex do corpo bruto>`,
  fail-closed (503 se o segredo não estiver configurado do lado deles).
- **Persistência:** tabela própria, upsert por `(tenantId, ticketNumber)` —
  reentrega (ex.: CSAT que chega depois do fechamento) atualiza em vez de duplicar.
- **Exibição:** aba "Histórico" no `SupportDrawer` do TMS, com fallback: continua
  disponível mesmo quando o Nexa está fora do ar (não depende de sessão viva do
  portal, diferente das outras abas do drawer).
- **`externalId` confirmado:** é o **usuário (pessoa)** logado no TMS, nunca o
  tenant — combina com `handoff.service.ts:47` do lado Nexa.

## Do lado do Nexa (implementado)

- `HiperTmsConnector.syncTicket()` — primeiro método de **escrita** do
  conector (tudo antes disso era leitura). HMAC sobre o corpo bruto, nunca
  reserializa o payload depois de calcular o hash.
- `TicketSyncService` — retry durável com o MESMO padrão do `WebhookService`
  existente (5 tentativas, backoff `10s/30s/2min/10min/30min`), mas sem
  reaproveitar a tabela `WebhookDelivery`: aquela exige uma
  `WebhookSubscription` (FK obrigatória) — um conceito de integração que o
  TENANT configura. Esta é uma integração FIXA Nexa↔TMS, sempre o mesmo
  destino e segredo. Reaproveitar exigiria uma subscription "de sistema" fake
  só pra satisfazer a FK, misturando os dois conceitos. Em vez disso, o estado
  vive direto em `AiConversation` (`ticketSyncStatus/Attempts/NextRetryAt/Error`)
  — cada ticket tem um destino só, não precisa de tabela de delivery separada.
- **Gatilhos:** `ticketNumber` atribuído (`support-agent.service.ts`) e os três
  fechamentos de ticket de suporte (confirmação do cliente, resolvido 48h,
  sem resposta do cliente) — **não** o fechamento de lead comercial
  (`closeInactiveLeads`), que é outro fluxo.
- Variável `NEXA_TICKET_WEBHOOK_SECRET` — separada do `TMS_SERVICE_TOKEN`
  de propósito (sentido inverso da integração; um vazamento não compromete o
  outro).

## Próximos passos

1. Combinar o segredo compartilhado entre os dois lados (gerar com
   `openssl rand -hex 32`, colocar em `NEXA_TICKET_WEBHOOK_SECRET` nos dois
   `.env` de produção — nunca por chat).
2. Validar ponta a ponta em produção: fechar um ticket de teste, confirmar que
   aparece na aba Histórico do TMS.

## Relacionados

- `docs/reviews/2026-08-05-auditoria-suporte.md` — achado que originou este pedido.
- `apps/backend/src/application/connectors/hipertms.connector.ts` — onde o
  método de escrita vai entrar quando o contrato for fechado.
- `apps/backend/prisma/schema.prisma:220-276` — `AiConversation`, fonte de
  todos os campos citados aqui.
