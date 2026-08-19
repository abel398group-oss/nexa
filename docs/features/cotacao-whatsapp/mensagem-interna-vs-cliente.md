# Cotação por WhatsApp — mensagem interna vs. mensagem-cliente

**Data:** 2026-08-19 (atualizado no mesmo dia — contrato do TMS ampliado)
**Status:** Implementado

> `docs/features/cotacao-whatsapp/prd.md`, `squad-nexa.md` e `squad-tms.md` descrevem o
> desenho ORIGINAL da feature (dois modos público/personalizado, NLP, tabela
> `NexaQuoteState`). O que foi construído é mais simples — sem IA, um único endpoint
> `/nexa/quote`, estado em Redis — ver `apps/backend/src/application/quote/`. Este
> documento cobre só a mudança abaixo; não reconcilia o resto dos docs desatualizados
> com o código real.

## O que mudou

Antes, o passo final da cotação mandava **uma** mensagem de WhatsApp — resultado +
instrução de onde completar o rascunho, sem o piso ANTT (pra não vazar margem se o
vendedor encaminhasse com um toque).

Agora manda **duas**, em sequência, na mesma conversa:

1. **Mensagem interna** (`resultadoInterno`) — só quem cotou vê. Tudo que a mensagem 2
   tem, mais o **piso ANTT**. Termina avisando que a mensagem encaminhável vem a seguir.
2. **Mensagem-cliente** (`resultadoParaCliente`) — a mesma de sempre, texto inalterado.
   Continua sem piso ANTT, sem margem, pronta pra repassar com um toque.

## Por quê

O vendedor não tinha, dentro do próprio WhatsApp, como conferir a margem antes de decidir
se aquele preço fecha conta — precisava abrir o TMS à parte. Separar em duas mensagens dá
esse contexto sem arriscar que ele vaze pro cliente: a informação sensível fica numa
mensagem que nunca é a que ele encaminha.

## Contrato do TMS ampliado (mesmo dia)

O squad TMS ampliou `POST /nexa/quote` — de forma aditiva, sem tocar nos campos que já
existiam — pra incluir a análise crítica. `ResultadoTms` em `quote-tms.client.ts` agora
tem:

```ts
{
  price, minimumFloor, distanceKm, draftId, validUntil,  // como antes, intocados
  netMargin: number | null,
  netRevenue: number | null,
  taxes: { total: number; items: ImpostoDaCotacao[] } | null,
  draftPath: string | null,   // ex.: "/logistic/quotes/<uuid>"
  draftUrl: string | null,    // absoluto, só quando o TMS conhece a base do web-app
}
```

`null` é proposital nos quatro primeiros: zero seria lido pelo vendedor como "cotação sem
margem", que é uma afirmação bem diferente de "o TMS não calculou isso agora".

`resultadoInterno()` agora mostra um bloco *📊 Análise crítica* (receita líquida, total de
impostos, margem) quando qualquer um desses vier preenchido, e um link `🔗` quando
`draftUrl` vier não-nulo. `resultadoParaCliente()` nunca lê esses campos — testado
explicitamente (`quote-messages.spec.ts`, "NUNCA mostra análise crítica nem link").

### Por que `draftUrl` só é usado quando o TMS manda pronto

O `draftPath` real é `/logistic/quotes/:id` com o **UUID** da cotação (`draftUuid`), não o
número visível (`draftId`, tipo "017747") — usar o número abriria "cotação não encontrada".

Cheguei a considerar montar o `draftUrl` aqui no Nexa quando o TMS manda `null` (prefixando
`draftPath` com `TMS_PANEL_BASE_URL`), mas **não fiz isso**: `digest-tabular.ts:42-45` já
documenta um incidente real — o squad confirmou em 21/07/2026 que `app.hipertms.com.br`
**não resolvia**, e a base confiável ali é a raiz sem subdomínio. Só que essa raiz foi
confirmada pra páginas-hub (`/fiscal`, `/logistic`), não pra rotas profundas da SPA como
`/logistic/quotes/:id` — não tenho como saber se ela serve essa rota também. Um link
quebrado em produção é pior que nenhum link, então: quando `draftUrl` vem `null`, a
mensagem interna simplesmente fica sem o `🔗` e mantém só a instrução em texto que já
existia ("Complete em Vendas › Cotações › {id}").

## Onde mexe no código

| Arquivo | Mudança |
|---|---|
| `quote-messages.ts` | `resultado()` virou duas funções: `resultadoInterno()` (piso ANTT + análise crítica + link, quando existirem) e `resultadoParaCliente()` (a `resultado()` antiga, texto igual, nunca lê os campos novos) |
| `quote-tms.client.ts` | `ResultadoTms` ganhou `netMargin`, `netRevenue`, `taxes`, `draftPath`, `draftUrl`; parsing defensivo (`extrairImpostos`) descarta o bloco de impostos inteiro se `total` não for número utilizável |
| `quote-conversation.service.ts` | `fechar()` devolve `[interna, paraCliente]` no caminho de sucesso e repassa os campos novos; os demais passos continuam devolvendo uma `string` só |
| `whatsapp.service.ts` | `tentarCotacao()` aceita `string \| string[]` e manda cada item em sequência ao WAHA, na ordem do array |

Testes: 98 testes do módulo `quote` (mensagem interna com/sem análise crítica, link só
quando vem pronto, `resultadoParaCliente` nunca vaza os campos novos, parsing defensivo de
`taxes` torto) e 67 do módulo `whatsapp` passando; `pnpm build` limpo.
