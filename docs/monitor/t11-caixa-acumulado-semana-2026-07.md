# T11 — Acumulado da semana no bloco de caixa (2026-07-29)

> Status: **Nexa implementado, aguardando campos do TMS.**
> Enquanto o TMS não mandar `invoicedWeek`/`paidWeek`, o digest sai exatamente
> como hoje (as duas linhas novas simplesmente não existem).

## Problema

O bloco "SEU CAIXA" mostrava só o snapshot do dia. O usuário emite 10 CT-e na
segunda, 15 na terça, e não tinha como ver a semana somada — só o dia isolado.

## O que NÃO fazer (e por quê)

A ideia original era "somar o caixa dia a dia". **A maior parte dos campos do
`TmsCashView` não pode ser somada** — são fotografias, não movimentos:

| Campo | Natureza | Somável? |
|---|---|---|
| `inflow15d` / `outflow15d` | previsão dos próximos 15 dias | ❌ |
| `overdueReceivable` | total vencido em aberto **agora** | ❌ |
| `unbilledCte` | CT-e parado esperando faturar | ❌ |
| `invoicedToday` | faturado **naquele dia** | ✅ |
| `paidToday` | pago **naquele dia** | ✅ |

Somar `overdueReceivable` de seg a sex faz uma dívida de R$ 6.900 parada a
semana toda virar **R$ 34.500**. Número falso, decisão errada em cima dele.
**Só as duas linhas de "hoje" acumulam.**

## Quem calcula: o TMS, não o Nexa

Somar no Nexa a cada digest parecia mais simples e é a opção errada:

- backend cai um dia → aquele dia **desaparece do total pra sempre**;
- catch-up de 120 min pode contar duas vezes;
- contato com 2 horários/dia idem;
- e em todos esses casos **o número fica errado em silêncio** — o pior modo de
  falha possível pra um dado financeiro.

No TMS é a mesma query de `invoicedMonth`/`invoicedToday` com outro recorte de
data. Sem estado, sem buraco, sem drift. Se o TMS cair, a linha some naquele
dia e volta correta no dia seguinte.

## Contrato (aditivo, opcional)

```ts
// hipertms.connector.ts — TmsCashView
invoicedWeek?: { amount: number; count: number };
paidWeek?: { amount: number; count: number };
```

Janela: **segunda 00:00 → agora** (semana corrente, não a anterior).

⚠️ **`count` é FATURAS, não CT-e.** `invoicedToday.count` agrega
`tenantFinanceInvoice` / `SALES_INVOICE`
(`hipertms_v12/apps/api/src/application/proactivity/closing-report.service.ts:420-431`),
e uma fatura pode agrupar vários CT-e. Por isso o rótulo é **"Faturado"**, nunca
"CT-e". A contagem de CT-e emitidos é um pedido separado ao squad (ver abaixo).

## Layout — WhatsApp

Quarta-feira, com os campos presentes:

```
 SEU CAIXA — qua 29/07
Faturado hoje (12)     R$  6.500
Faturado seg→qua (37)  R$ 18.500
Pago hoje (4)          R$  1.100
Pago seg→qua (11)      R$  3.900
Entra (15d)            R$ 38.400
Sai (15d)              R$ 21.150
────────────────────────────────
Sobra                  R$ 17.250
Vencido s/ receber     R$  6.900
CT-e s/ faturar        R$  3.100
```

Regras:

- **O rótulo é a legenda.** `seg→qua` diz a janela sem texto explicativo,
  rodapé ou emoji. Cresce sozinho: `seg→ter`, `seg→qua`, … `seg→dom`.
- **Segunda-feira: linhas omitidas** (`weekRowsAreRedundant`) — o acumulado
  seria idêntico ao dia; repetir o mesmo número gastaria 2 linhas do bloco.
- **Domingo é o FIM da janela, não o começo** (daí o `getDay() || 7`).
- **Título passou de `15 dias` para a data.** Com linhas de hoje, de semana e
  de 15 dias no mesmo bloco, "SEU CAIXA — 15 dias" descrevia errado o conteúdo.
  As linhas de 15 dias mantêm o `(15d)` no rótulo.
- **`Gasto` → `Pago`** nos dois canais: o campo mede pagamentos efetuados
  (`tenantFinanceAccountPayment`), não despesa incorrida.
- Contagem de 4+ dígitos trunca o rótulo (`Faturado seg→dom (123…`) em vez de
  estourar o alinhamento de 32 colunas.

Custo total: **+2 linhas** de terça a domingo, 0 na segunda.

## Layout — e-mail

Mesmas linhas em `buildCashViewSectionHtml`, cada acumulado logo abaixo do dia
correspondente (📈 Faturado seg→qua / 📉 Pago seg→qua). Mesma degradação
graciosa e mesma regra de segunda-feira.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `connectors/hipertms.connector.ts` | `invoicedWeek`/`paidWeek` opcionais no `TmsCashView` |
| `monitor/digest-tabular.ts` | `weekWindowLabel()`, `weekRowsAreRedundant()`, `cashBlock(cash, now)` |
| `monitor/consolidation.service.ts` | `buildCashViewSectionHtml(cash, now)` + linhas de semana |
| `monitor/digest-tabular.spec.ts` | 9 casos novos (presente, ausente, segunda, largura, 4 dígitos) |

## Pendente do TMS

1. `invoicedWeek` / `paidWeek` no `GET /nexa/proactivity/cash-view`.
2. **Contagem de CT-e emitidos** (hoje e semana) — é o número que o usuário
   pensa quando fala "emiti 10 CT-e hoje". Hoje o Nexa só tem contagem de
   faturas. Se o squad expor `cteIssuedToday`/`cteIssuedWeek`, viram linhas
   próprias no bloco.

Registrado também em `docs/ai/kb-suporte-pendencias-tms.md`.
