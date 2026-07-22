# Item 2 — Fila de alerta no Redis (BullMQ) [FUTURO]

> Parte do `docs/infra/plano-escala-2026-07.md`. **NÃO implementar até o
> gatilho.** Documentado agora pra execução sem improviso quando o volume pedir.

## Gatilho de implementação/ativação

Executar quando QUALQUER um acontecer (o termômetro avisa — ver
`monitoramento-gargalos-2026-07.md`):

- decisão de ligar a **2ª réplica** do backend (item obrigatório antes disso), OU
- fila de dispatch sustentada > ~50 jobs, OU
- alertas/hora se aproximando do teto do rate-limit (`DISPATCH_MAX_PER_MINUTE`).

## Problema

`MonitorDispatchService` tem a fila **em memória** (`monitor-dispatch.service.ts`).
Com 2 réplicas, cada uma teria sua fila → alerta **duplicado**. Impede escala
horizontal.

## Solução (atrás de flag — produção não muda no deploy)

- Env `DISPATCH_MODE=memory|redis`, **default `memory`**.
- `memory` → comportamento atual, intocado.
- `redis` → fila BullMQ (Redis já está no stack). Dedup por `jobId`
  determinístico (ex.: `${tenantId}:${contactPhone}:${slotKey}`), retry/backoff
  nativos do BullMQ (substituem o retry manual atual), rate-limit por worker.

## Passos

1. Extrair a interface de despacho (enqueue/process) — o `MonitorDispatchService`
   vira uma fachada que delega pra `MemoryQueue` (atual) ou `BullQueue` (novo)
   conforme o flag.
2. `BullQueue`: fila + worker BullMQ, `jobId` determinístico pro dedup entre
   réplicas, `attempts`/`backoff` espelhando os valores atuais (3 / 30s-2min-10min).
3. Manter o log em `notificationLog` idêntico (sucesso e falha final).
4. Testes: dedup (mesmo jobId 2x = 1 envio), retry, e paridade memory↔redis.

## Validação (OBRIGATÓRIA antes de confiar)

Staging com **2 réplicas** apontando pro mesmo Redis: disparar o mesmo lote e
provar **0 alerta duplicado** + retry preservado. Com 1 réplica não dá pra
provar o que importa — não pular esta etapa.

## Reverter

`DISPATCH_MODE=memory` + restart. Volta ao comportamento atual na hora.

## TMS

Nada — interno do Nexa.
