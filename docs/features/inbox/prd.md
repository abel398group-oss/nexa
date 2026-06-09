# PRD — Inbox (Conversas e Atendimento)

## Visão geral

O Inbox é a interface de conversas WhatsApp do Nexa. Exibe mensagens inbound/outbound em tempo real, mostra o status do lead e, quando o remetente é cliente TMS, exibe um badge de identificação.

## Personas

- Vendedor: acompanha conversas ativas, responde manualmente quando necessário.
- Supervisor: monitora autonomia da IA e intervém se necessário.

## Escopo

- Lista de conversas com preview da última mensagem e timestamp
- Visualização de conversa com histórico completo
- Envio manual de mensagem pelo painel
- Badge TMS: ao abrir uma conversa, consulta o TMS pelo telefone:
  - `✅ Cliente TMS — [Plano]` se cadastrado (hover mostra nome e empresa)
  - `🆕 Prospect` se não cadastrado
  - `verificando TMS…` durante a consulta
- Status da IA: mostra se a Lia está em autonomia (auto-enviando) ou aguardando humano
- Handoff: marcar conversa como "em atendimento humano"

## Badge TMS — fluxo técnico

1. Usuário abre conversa → `openConv()` no InboxPage
2. Frontend chama `GET /connectors/lookup?phone=...` em paralelo
3. Backend chama `ConnectorsService.lookupCustomer()` → `HiperTmsConnector.lookupCustomer()`
4. Se TMS_API_BASE_URL não configurado: fallback para `TmsLookupService.batchLookup()` no banco direto
5. Badge exibido com resultado

## Referências

- Page: `apps/frontend/src/pages/InboxPage.tsx`
- Endpoint: `GET /connectors/lookup?phone=...`
