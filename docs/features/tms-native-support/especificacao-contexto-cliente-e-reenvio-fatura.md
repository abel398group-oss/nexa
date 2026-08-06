# Especificação — Contexto do cliente no token + reenvio de fatura

**Data:** 2026-08-06 · **Status:** Proposto — pedido para o time do TMS
**Origem:** auditoria de suporte de 2026-08-05
(`docs/reviews/2026-08-05-auditoria-suporte.md`) e follow-up de contexto do
widget.

> Este documento junta dois pedidos pequenos e independentes ao time do TMS.
> Podem ser feitos em qualquer ordem, e um não bloqueia o outro.
>
> 1. **Campos novos no token de handoff** — `companyName` e `cnpj`.
> 2. **Endpoint novo** — `POST /nexa/invoices/resend`, para a Lia reenviar
>    fatura/boleto sem intervenção humana.

---

## 1. Campos novos no token de handoff

### O que existe hoje

O token de handoff (widget do TMS → Nexa) já é gerado pelo TMS
server-to-server (`HandoffService.create`,
`apps/backend/src/application/handoff/handoff.service.ts:44-63`) e carrega
hoje **apenas**:

```ts
interface HandoffContext {
  externalId: string;   // identidade do usuário (pessoa) logado no TMS
  tenantId: string;
  name?: string | null; // nome do usuário
  page?: string | null; // tela do TMS de onde o widget foi aberto
  errorCode?: string | null;
  isManager: boolean;
}
```

**Não existe** `companyName` nem `cnpj` em nenhum lugar do payload — conferido
por busca direta no código (`handoff.service.ts` e
`apps/backend/src/application/agents/web-chat.service.ts`), zero ocorrências.
Um pedido anterior presumia que esses campos já vinham e eram descartados;
não é o caso — precisam ser **adicionados na origem, pelo TMS**.

### O que pedimos

Dois campos novos, opcionais, no mesmo payload que já existe hoje:

```json
{
  "externalId": "user-4821",
  "tenantId": "t1",
  "name": "João Silva",
  "companyName": "Transportadora ABC Ltda",
  "cnpj": "12345678000190",
  "page": "/fiscal/cte",
  "errorCode": null,
  "isManager": false
}
```

- `companyName`: razão social ou nome fantasia da transportadora/empresa que
  o usuário representa (não confundir com o `tenantId`, que é o operador do
  Nexa — normalmente o próprio HiperTMS. Ver nota de vocabulário abaixo).
- `cnpj`: CNPJ da empresa, só dígitos ou formatado — tanto faz, o Nexa
  normaliza na recepção.

### Por que pedimos

Hoje a Lia atende sabendo o **nome da pessoa**, mas não a **empresa** dela.
Em conversas de suporte que citam múltiplas filiais/unidades, ou quando o
time humano assume o chamado, saber a empresa de cara evita perguntar (o que
a regra de LGPD do suporte já proíbe — `diagnostic-agent.service.ts:124-128`)
ou obrigar o atendente humano a procurar o cadastro manualmente.

**Nota de vocabulário** (para não repetir um erro de interpretação já
corrigido nesta auditoria): `tenantId` no Nexa é o **operador que usa o
Nexa** (ex.: o próprio HiperTMS), não a transportadora/empresa cliente. A
transportadora é identificada por `externalId` (a pessoa) e, com este pedido,
por `companyName`/`cnpj`. Os dois conceitos não se confundem no schema do
Nexa (`Contact.company` é campo separado de `tenantId`).

### O que muda do lado do Nexa (quando os campos chegarem)

- `HandoffContext` ganha os dois campos opcionais.
- `tmsCustomer` (usado por `support-agent.service.ts`,
  `diagnostic-agent.service.ts`, `resolution-agent.service.ts`) passa a
  carregar `companyName`/`cnpj` do mesmo jeito que `page` foi conectado nesta
  auditoria (commit `349e170` — ver `docs/reviews/2026-08-05-auditoria-suporte.md`,
  achado S-04/S-05 para o padrão já estabelecido).
- Uso inicial: exibir a empresa no card do ticket no Inbox do Nexa (ver Passo
  3 desta rodada) e, opcionalmente, permitir que a Lia confirme "aqui é a
  Transportadora ABC?" sem que o cliente precise digitar (facilita o
  antifraude do lado humano, sem violar a regra de nunca pedir CNPJ ao
  cliente).

### O que NÃO estamos pedindo agora

- Não pedimos histórico de filiais/múltiplos CNPJs por usuário — só o CNPJ
  da empresa associada à sessão atual.
- Não pedimos validação de CNPJ do lado do Nexa — confiamos no dado que o
  TMS já validou no próprio cadastro.

---

## 2. Endpoint `POST /nexa/invoices/resend`

### Por que este endpoint

"Reenviar a 2ª via da fatura/boleto" é hoje uma ação **100% manual**: o KB de
suporte da Lia (`hipertms-suporte-kb.data.ts`) só instrui o cliente ou o
atendente a navegar até **Financeiro → Faturas (tomador) → detalhe da
fatura** e clicar em **Emitir Boleto** dentro do próprio TMS — a Lia não tem
nenhum jeito de fazer isso por código hoje.

Entre as ações candidatas a self-service levantadas nesta auditoria (reenvio
de fatura vs. reprocessamento de CT-e/MDF-e rejeitado), esta foi a
recomendada como primeira: é **idempotente** (reenviar não duplica cobrança)
e **não tem risco fiscal/SEFAZ** — diferente de reprocessar um documento
fiscal, que pode gerar rejeição em cascata ou envio duplicado se feito errado.

Não existe hoje, do lado do Nexa, nenhum stub para esta ação especificamente:
`createPaymentRequest` (`hipertms.connector.ts:1177-1193`) é para **criar uma
cobrança nova** (onboarding de assinatura), uma ação categoricamente
diferente de reenviar uma fatura **já existente**. Este pedido é por um
método novo, não reaproveitamento daquele stub.

### O que propomos que o endpoint faça

```
POST https://www.hipertms.com.br/api/nexa/invoices/resend
Authorization: Bearer <TMS_SERVICE_TOKEN>   (mesmo token já usado nas leituras
                                              hoje — getContractStatus, etc.)
Content-Type: application/json

{
  "externalId": "user-4821",     // obrigatório — mesma identidade do handoff
  "invoiceId": "inv-9911"        // opcional — ver comportamento abaixo
}
```

**Comportamento esperado:**

- Se `invoiceId` for enviado: reenvia especificamente aquela fatura (e-mail
  + disponibiliza o link do boleto/PIX, como já acontece hoje quando um
  humano clica em "Emitir Boleto" na tela).
- Se `invoiceId` **não** for enviado: busca a fatura pendente mais recente do
  `externalId` e reenvia essa. Cobre o caso mais comum ("minha fatura não
  chegou") sem a Lia precisar primeiro descobrir o ID da fatura.
- **Idempotência:** reenviar a mesma fatura múltiplas vezes não deve gerar
  nova cobrança nem tarifa adicional ao cliente (o KB já menciona que o Asaas
  cobra tarifa por emissão de boleto — se isso for um limite, o TMS decide o
  rate-limit do lado dele; o Nexa não teria como saber).

**Resposta esperada (sucesso):**

```json
{
  "ok": true,
  "invoiceId": "inv-9911",
  "sentTo": "financeiro@transportadoraabc.com.br",
  "dueDate": "2026-08-15",
  "amount": 349.90
}
```

**Resposta esperada (sem fatura pendente):**

```json
{ "ok": false, "reason": "no_pending_invoice" }
```

### Formato de transporte

Mesma decisão já validada com o time do TMS para `syncTicket` — mas em
**sentido oposto** (aqui é o Nexa chamando o TMS, não o TMS chamando o Nexa),
então o padrão correto é o mesmo já usado pelas leituras existentes
(`getContractStatus`, `getDocumentStatus`, etc.): `Authorization: Bearer
<TMS_SERVICE_TOKEN>`, o mesmo secret que essas chamadas já usam hoje — não é
necessário criar um secret novo como foi feito para `syncTicket` (aquele caso
era webhook Nexa→TMS *outbound* assíncrono; este é request/response síncrono,
mesmo padrão das leituras).

### O que muda do lado do Nexa (quando o endpoint existir)

- Novo método `HiperTmsConnector.resendInvoice(input)` — não reaproveita
  `createPaymentRequest`.
- Ação exposta à Lia via `action-policy.ts` (ADR 012): como é reversível e
  sem risco fiscal, pode ser autoexecutável (a Lia dispara direto), diferente
  de ações irreversíveis (refund, cancelamento) que exigem humano.
- KB atualizado para a Lia saber que a ação existe (hoje o KB só ensina o
  caminho manual na tela).

### O que NÃO estamos pedindo agora

- Não pedimos alterar valor, vencimento ou forma de pagamento da fatura —
  só reenviar a que já existe.
- Não pedimos criar fatura nova — isso seria outra ação (`createPaymentRequest`
  já cobre onboarding; faturas recorrentes são geradas pelo próprio ciclo do
  TMS).

---

## Próximos passos

1. Time do TMS confirma se os dois campos do token (`companyName`, `cnpj`)
   têm fonte de dado disponível na sessão do usuário (devem ter, já que
   aparecem na tela do TMS).
2. Time do TMS avalia o endpoint de reenvio — em especial se `Bearer
   TMS_SERVICE_TOKEN` é aceitável ou se preferem outro esquema de auth para
   esta chamada específica.
3. Depois de confirmado dos dois lados, Nexa implementa o consumo (mesmo
   padrão desta auditoria: tipo widened → propagado pela cadeia de agentes →
   testado).

## Relacionados

- `docs/reviews/2026-08-05-auditoria-suporte.md` — achados que motivaram
  este pedido (S-04, S-05) e a análise de contexto do widget.
- `apps/backend/src/application/handoff/handoff.service.ts` — token atual.
- `apps/backend/src/application/connectors/hipertms.connector.ts` — onde
  `resendInvoice` entra quando o contrato for fechado.
- `docs/features/tms-native-support/especificacao-sync-ticket-tms.md` —
  pedido irmão (sentido inverso: Nexa → TMS), mesmo padrão de documento.
