# Item 4 — Fila de disparo de campanha no BullMQ [PLANEJADO, NÃO IMPLEMENTAR AINDA]

> Não confundir com o Item 2 (`item2-fila-alerta-bullmq-2026-07.md`) — aquele é
> a fila de ALERTA interno (`MonitorDispatchService`), este é a fila de
> DISPARO DE CAMPANHA (`sender.service.ts` WhatsApp + `email-campaign-sender.service.ts`
> e-mail). Duas filas diferentes, dois problemas diferentes.
>
> Escrito em 2026-08-05 depois de ler `sender.service.ts` inteiro (1100 linhas)
> pra avaliar essa migração pedida no plano de expansão RevOps (multi-canal +
> parceria de pneus + vendedor humano). **Decisão: planejar agora, não migrar
> às cegas nesta sessão** — não dá pra testar contra um WhatsApp de verdade
> aqui, e esse arquivo tem histórico de bugs reais em produção (ver abaixo).

## Gatilho de implementação/ativação

Executar quando QUALQUER um acontecer:

- volume de campanha sustentado crescer (mais leads, mais parceiros como o de
  pneus, mais canais) a ponto do ritmo de disparo virar reclamação visível, OU
- decidir implementar um POOL de verdade com mais de um `SenderNumber` ativo
  por tenant (hoje só existe paralelismo nenhum — ver "O que a fila NÃO
  resolve" abaixo), OU
- decisão explícita do Abel de priorizar isso.

**Não é gatilho:** "a fila vai deixar mais rápido". Ver a seção seguinte —
não é esse o ganho.

## O que a fila NÃO resolve (importante não vender errado)

O ritmo de envio hoje é limitado por **regra de negócio anti-ban** (delay
aleatório 30-90s **entre cada mensagem**, `sender.service.ts:22-23`), não por
capacidade técnica. Trocar o polling por BullMQ **não manda mais rápido** — o
WhatsApp continua banindo número que manda rápido demais, fila ou não fila.

O que a fila REALMENTE ganha:
- Elimina a latência/desperdício do polling a cada 15s (job dispara na hora
  certa, não espera o próximo tick).
- Retry/backoff nativo em vez do esquema manual atual (recuperação de "preso
  em `sending` há 5min", `sender.service.ts:797-811`).
- Base pronta pra **paralelismo real** SE/QUANDO existir mais de um
  `SenderNumber` ativo por tenant (hoje o código sempre pega UM número —
  `ensureNumber()` — não há pool de verdade nem lane por número).

## Problema — por que não é troca mecânica

`sender.service.ts` tem **21 correções de bug documentadas no próprio código**
(`DISP-001` a `DISP-021`, mais `BUG-001`, `BUG-06`, `BUG-010`, `G7`, `G8`) —
cada uma existe porque algo já quebrou em produção. Uma migração de fila
precisa preservar TODAS, não só o "envia mensagem". Lista do que não pode se
perder (não exaustiva — ler o arquivo inteiro antes de mexer):

| Comportamento | Onde hoje | Por que existe |
|---|---|---|
| Delay aleatório 30-90s **compartilhado entre réplicas** via Redis | `:29-89` (`readAntibanState`/`writeAntibanState`) | anti-ban — sem isto, 2 réplicas dobram o ritmo |
| Claim atômico (`queued`→`sending`) antes de processar | `:928-932` | evita mandar a mesma campanha 2x se dois ciclos se sobrepõem |
| Entrega NÃO CONFIRMADA ≠ falha (`DISP-021`) | `:1050-1065` | reenviar em cima de timeout/5xx duplicou mensagem pro Mateus em 2026-08-03 |
| Recovery de alvo preso em `sending` >5min | `:797-811` | worker que crasha no meio do envio não pode travar o alvo pra sempre |
| Freio de engajamento (desativa número se ninguém responde) | `:204-240` | mede o que VOLTA, não só o que sai — sinal de banimento iminente |
| Checagem de opt-out/blocklist DUAS vezes (criação da campanha + no envio) | `:934-949` | quem saiu DEPOIS da campanha criada ainda é barrado |
| Limite diário/hora por warmup stage | `:126-130`, `:900-909` | número novo tem cota menor, cresce com o tempo |
| Segue delay mesmo em falha (não varre a fila inteira em 15s de erro) | `:1071-1075` | WAHA fora do ar não pode virar "reprovar tudo instantaneamente" |
| Follow-up (24h/72h) agendado só em envio confirmado ou sent-sem-confirmação | `:1032-1033`, `:1063-1065` | não é sobre a fila, mas é side-effect do mesmo trecho — não pode sumir |

Se a migração perder qualquer um desses, é regressão de produção, não
detalhe de implementação.

## Solução (atrás de flag — mesmo padrão do Item 2)

- Env `DISPATCH_MODE=poll|queue`, **default `poll`** (comportamento atual, intocado).
- `poll` → nada muda, é o `@Interval(15000)` de hoje.
- `queue` → BullMQ. Um único worker com `concurrency: 1` (preserva "uma
  mensagem por vez" — não é o volume que precisa crescer, é a arquitetura que
  precisa ficar pronta). Delay aleatório entre mensagens via
  `worker.rateLimit(randomDelayMs)` (API nativa do BullMQ pra isso — chamada
  DEPOIS de cada envio, com o mesmo cálculo `DELAY_MIN_MS..DELAY_MAX_MS` que já
  existe hoje), não via `limiter` fixo do BullMQ (que não suporta delay
  aleatório por job nativamente).
- WhatsApp primeiro (mais simples de validar isolado), e-mail depois — o
  `email-campaign-sender.service.ts` tem menos regras (sem freio de
  engajamento tão elaborado), mas passa pela mesma disciplina.

## Passos

1. Adicionar `bullmq` como dependência (hoje não existe no `package.json`).
2. Extrair a lógica de "o que fazer com UM alvo" de dentro do `tickLocked()`
   pra uma função pura reusável pelos dois modos — HOJE ela está entrelaçada
   com a busca da campanha/checagem de janela/limites. Isso sozinho já é valor
   (testável em isolamento) mesmo antes de ligar o BullMQ.
3. `queue` mode: fila + worker, processor chama a função extraída no passo 2.
   `jobId` determinístico (`campaignTargetId`) pra dedup.
4. Portar TODA a tabela da seção "Problema" acima — cada linha vira teste.
5. Rodar os dois modos LADO A LADO em staging com número de teste WAHA real
   (não simulado) antes de cogitar produção.

## Validação (OBRIGATÓRIA antes de confiar)

Staging com número de teste WAHA de verdade — não dá pra provar anti-ban
contra um mock. Checklist mínimo: nenhuma mensagem duplicada, delay entre
envios respeitado (medir de verdade, não assumir), claim atômico segurando
sob 2 ciclos concorrentes, recovery de crash funcionando, freio de
engajamento ainda desativando o número quando devia. Sem isso, "pronto" é
só teoria — mesma regra do Item 2.

## Reverter

`DISPATCH_MODE=poll` + restart. Volta ao comportamento atual (o `@Interval`
nunca é removido nesta fase — fica como fallback até o `queue` mode provar
paridade em produção real por um tempo).

## TMS

Nada — interno do Nexa. O filtro de cliente TMS (`tmsLookup.batchLookup`)
continua rodando na criação da campanha, não no worker de disparo.
