# Cotação por WhatsApp — mensagem interna vs. mensagem-cliente

**Data:** 2026-08-19
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

## O que NÃO entrou (e por quê)

A ideia original incluía também, na mensagem interna: **margem, receita líquida, impostos
detalhados** (a "análise crítica" que aparece na tela do rascunho no TMS) e um **link
direto** pro registro.

Não entrou porque `POST /nexa/quote` hoje só devolve isto (`ResultadoTms` em
`quote-tms.client.ts`):

```ts
{ price, minimumFloor, distanceKm, draftId, validUntil }
```

Sem margem/receita/impostos na resposta, e sem uma URL de portal confirmada (não existe
hoje um path tipo `/vendas/cotacoes/:id` documentado nem testado — só a instrução em
texto "Vendas › Cotações › {id}", que já existia). Inventar uma URL teria risco real de
mandar o vendedor pra um link quebrado em produção.

## Para entrar depois

Se o squad TMS ampliar o contrato de `/nexa/quote` para devolver margem, receita líquida,
impostos e uma URL do registro, essas linhas entram em `resultadoInterno()` — nunca em
`resultadoParaCliente()`. O ponto de extensão já está marcado no comentário da função em
`apps/backend/src/application/quote/quote-messages.ts`.

## Onde mexe no código

| Arquivo | Mudança |
|---|---|
| `quote-messages.ts` | `resultado()` virou duas funções: `resultadoInterno()` e `resultadoParaCliente()` (esta é a `resultado()` antiga, texto igual) |
| `quote-conversation.service.ts` | `fechar()` devolve `[interna, paraCliente]` no caminho de sucesso; os demais passos continuam devolvendo uma `string` só |
| `whatsapp.service.ts` | `tentarCotacao()` aceita `string \| string[]` e manda cada item em sequência ao WAHA, na ordem do array |

Testes: `quote-messages.spec.ts` e `quote-conversation.service.spec.ts` cobrem as duas
mensagens separadamente (piso ANTT presente numa, ausente na outra). 90 testes do módulo
`quote` e 67 do módulo `whatsapp` passando; `pnpm build` limpo.
