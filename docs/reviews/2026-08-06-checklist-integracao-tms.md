# Checklist de integração — o que fica pendente no HiperTMS

**Data:** 2026-08-06 · **Escopo:** varredura de todos os commits desta
rodada do Módulo de Suporte (Passos 1-3, Ciclo 1 N2, Ciclo 2 N3, auditoria de
KB) para separar o que já roda 100% no Nexa do que depende do repositório do
HiperTMS.
**Método:** conferido código real — `handoff.service.ts`,
`hipertms.connector.ts` — mais os dois documentos de especificação já
escritos nesta sessão. Nada aqui é suposição.

---

## 1. Pendente do lado do TMS

Só **duas coisas**, ambas já especificadas em detalhe em
[`docs/features/tms-native-support/especificacao-contexto-cliente-e-reenvio-fatura.md`](../features/tms-native-support/especificacao-contexto-cliente-e-reenvio-fatura.md),
status **"Proposto"** — sem evidência de que o time do TMS tenha implementado
ainda (conferido de novo agora: `companyName`/`cnpj` continuam ausentes do
token, `resendInvoice` não existe no connector).

### 1.1 `companyName` e `cnpj` no token de handoff

**Sim, é pendência real do TMS.** O token que o TMS gera hoje
(`HandoffContext`, `handoff.service.ts:57-64`) carrega só:

```ts
{ externalId, tenantId, name, page, errorCode, isManager }
```

Sem `companyName`/`cnpj`. Enquanto o TMS não adicionar esses dois campos no
payload, o card do chamado no Inbox do Nexa **não tem de onde puxar** nome da
transportadora/CNPJ automaticamente — hoje o card mostra o nome da *pessoa*
(via `name`), não da empresa. `Contact.company` (usado no ícone 🏢 do card,
ver `InboxPage.tsx:722-727`) é preenchido por outro caminho (cadastro do
contato no Nexa), não vem do token — então o card **já mostra empresa
quando o contato já tem isso cadastrado**, mas não é alimentado
automaticamente pelo token do widget.

### 1.2 `POST /nexa/invoices/resend`

**Sim, é pendência real do TMS.** Não existe hoje nenhum endpoint de reenvio
de fatura/boleto no lado deles, e o connector do Nexa
(`hipertms.connector.ts`) não tem nenhum método `resendInvoice` — confirmado
agora por busca direta, zero ocorrências. Enquanto esse endpoint não existir,
a Lia continua só orientando o cliente a reemitir manualmente pela tela
(o que já está documentado na KB) — não existe self-service automático pra
2ª via.

**Nada mudou nesses dois itens desde que o documento foi escrito.** Não é
preciso reescrever a especificação — ela já está pronta pra mandar. Só falta
o time do TMS confirmar e implementar.

---

## 2. O que já roda 100%, sem tocar em nada do TMS

Tudo que foi commitado nesta rodada — **exceto os dois itens acima** — não
depende de nenhuma mudança no repositório do TMS:

| Feature | Por quê não depende do TMS |
|---|---|
| Saudação contextual com `page` (Passo 1, `349e170`) | `page` **já vinha** no token antes desta rodada — o problema era só que morria na camada de WebSocket do Nexa. Fix 100% interno. |
| Resumo de 3 linhas no transbordo (`adc17cf`) | Construído a partir de dados que o próprio Nexa já produz (diagnóstico, resolução, motivo da escalação) — não lê nada do TMS. |
| Correção do bug de KB não aprovada (`b94f5b4`) | Tabela `AiKnowledgeBase`/`AiKnowledgeVersion` são só do Nexa. |
| Playbooks `integracoes`/`api`/`cadastro` + artigos novos de KB (`3c3c9b1`) | Conteúdo estático no connector do Nexa (`hipertms-suporte-kb.data.ts`) — sincroniza pro banco via `importFromConnector`, mas a fonte é local, não uma API do TMS. |
| Log + instrução de prompt pra código SEFAZ desconhecido (`05b281f`) | Tabela de rejeições é local (`hipertms.connector.ts`) — não chama o TMS. |
| Atribuição a analista + fila (Não Atribuídos/Meus Chamados) (`96f7344`, `6f8e148`) | 100% modelo `User`/`AiConversation` do Nexa. |
| Notas internas + isolamento de sala no WebSocket (`96f7344`) | `AiMessage.isInternal` + `ConversationsGateway` — infraestrutura só do Nexa. |
| `linkedIssueUrl` (Ciclo 2, `bba6ff3`) | Campo de texto livre que o analista cola manualmente — não é integração com Jira/GitHub/etc., não fala com o TMS nem com a ferramenta de dev. |

**Já rodando em produção sem pendência nenhuma** — nenhum desses itens
precisa de aviso, coordenação ou deploy do lado do TMS.

### Nota à parte: sync de ticket (não é desta rodada, mas é do mesmo assunto)

O `TicketSyncService` (commit anterior a esta rodada, `6f5d074` e os que o
antecederam) **já é uma integração de mão dupla implementada dos dois
lados** — o TMS já tem o endpoint receptor (`POST /api/nexa/tickets`) no ar.
Não é pendência: já está funcionando, é só o histórico técnico completo
pra não gerar confusão.

---

## 3. Checklist objetivo pro time do TMS

Só isso, exatamente como já está no documento de especificação:

- [ ] **Token de handoff**: adicionar `companyName` (razão social/nome
      fantasia) e `cnpj` ao payload que o `HandoffService.create` do Nexa já
      recebe hoje — mesmo formato dos campos existentes (`externalId`,
      `name`, `page`), sem quebrar nada do que já existe.
- [ ] **Endpoint novo**: `POST /nexa/invoices/resend`, recebendo
      `externalId` + `invoiceId` (opcional — sem ele, reenvia a fatura
      pendente mais recente). Auth sugerida: `Bearer TMS_SERVICE_TOKEN`
      (mesmo token que as leituras existentes já usam — `getContractStatus`
      etc. — não precisa de secret novo). Resposta esperada e formato
      completo já estão na seção 2 da especificação.
- [ ] Confirmar com o Nexa quando qualquer um dos dois estiver pronto —
      o consumo do lado do Nexa (widening do `HandoffContext`, novo método
      `resendInvoice` no connector) é rápido de implementar depois que o
      contrato existir de verdade do lado deles.

Nenhum outro item desta rodada precisa de ação do time do TMS.

## Relacionados

- `docs/features/tms-native-support/especificacao-contexto-cliente-e-reenvio-fatura.md`
  — especificação completa dos 2 pedidos (payload exato, exemplos, auth).
- `docs/features/tms-native-support/especificacao-sync-ticket-tms.md` —
  integração já implementada dos dois lados (referência de como ficou
  quando o TMS responde e implementa).
- `docs/reviews/2026-08-06-relatorio-modulo-suporte.md`,
  `docs/reviews/2026-08-06-auditoria-kb-lia.md`,
  `docs/reviews/2026-08-06-auditoria-operacao-time-suporte.md` — os 3
  relatórios que originaram os commits desta rodada.
