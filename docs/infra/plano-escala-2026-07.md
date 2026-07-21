# Plano de escala — Nexa (2026-07-21)

> Preparar a infra ENQUANTO o volume está baixo (1 cliente), com disciplina de
> reversibilidade — nunca big-bang em produção. Cada item tem: gatilho de
> ativação, passo reversível e o que valida antes de confiar.
>
> Princípio (decidido com Abel): **"deixar pronto" ≠ "ativar agora".** Construir
> + testar + deixar atrás de flag é seguro; virar a chave (2ª réplica, modo
> Redis) espera o volume real ou staging com 2 réplicas.

## Estado real do código (não o do .env.example)

| Ponto | Verdade no código | Arquivo |
|---|---|---|
| Pool Prisma | `PRISMA_CONNECTION_LIMIT ?? 3` conexões/instância (não 20 — o `.env.example` está velho). DO gerenciado tem `max_connections=25`. | `infra/prisma/prisma.service.ts:10` |
| Fila de alerta | Em memória — só 1 réplica (2 réplicas = alerta duplicado). | `application/monitor/monitor-dispatch.service.ts:12` |
| Inbox tempo real | Socket.io SEM Redis adapter — 2 réplicas = mensagem some entre instâncias. | `docs/infra/escalabilidade-nexa.md` |
| Lock de crons | Redis lock já existe (fail-open sem Redis). | `shared/lock/redis-lock.service.ts` |

## Os 3 itens, por risco e ordem

### Item 1 — Pool de conexões (DO Managed Connection Pool)

- **Risco:** baixo. Infra paralela; o Nexa só troca a string de conexão.
- **O que é:** o Postgres gerenciado do DO oferece um **connection pool nativo**
  (PgBouncer gerenciado) — NÃO se instala nada, liga-se no painel DO e aponta o
  `DATABASE_URL` pra porta/pool novo. Doc própria:
  `docs/infra/item1-pool-conexoes-2026-07.md`.
- **Gatilho:** fazer AGORA (é o único que se ativa e valida com 1 réplica).
- **Reverter:** trocar o `DATABASE_URL` de volta pro endpoint direto. 1 linha.
- **Valida:** app sobe, `/api/health` verde, sem `P2037`/timeout nos logs.
- **TMS:** nada — o banco do Nexa é separado do TMS.

### Item 2 — Fila de alerta no Redis (BullMQ)

- **Risco:** médio (mexe em código que funciona). Mitigação: flag.
- **O que é:** trocar a fila em memória do `MonitorDispatchService` por BullMQ,
  atrás de `DISPATCH_MODE=memory|redis` (default `memory` — produção não muda).
- **Gatilho de ATIVAÇÃO (`redis`):** quando subir a 2ª réplica OU o volume de
  alertas passar de ~X/min (definir com dado real).
- **Reverter:** `DISPATCH_MODE=memory` + restart. Comportamento antigo volta.
- **Valida:** staging com 2 réplicas provando dedup (0 alerta duplicado) e
  retry preservado. Sem isso, "pronto" é só teoria.
- **TMS:** nada.

### Item 3 — Socket.io Redis adapter

- **Risco:** médio, mas INERTE com 1 réplica (não muda nada visível hoje).
- **O que é:** adicionar `@socket.io/redis-adapter` pro inbox funcionar entre
  réplicas. Com 1 instância roda igual.
- **Gatilho de ATIVAÇÃO:** só faz diferença ao ligar a 2ª réplica.
- **Reverter:** remover o adapter (volta ao in-memory do socket.io).
- **Valida:** 1 réplica → inbox idêntico ao de hoje; staging 2 réplicas →
  mensagem aparece pros atendentes conectados em qualquer instância.
- **TMS:** nada (o webchat do TMS conecta via WS, mas o adapter é interno do Nexa).

## Ordem de execução

1. **Item 1 — ativa agora** (pool DO). Único que se valida de ponta a ponta hoje.
2. **Item 2 — constrói agora, flag `memory`** (dormente em produção).
3. **Item 3 — adiciona agora, roda com 1 réplica** (dormente até a 2ª).

Cada um: commit próprio, gates verdes, reversível. Nenhum toca em regra de
negócio (alerta, suporte, Lia) — são todos infra/transporte.

## O que NÃO fazer

- Ligar 2ª réplica antes dos itens 2 e 3 validados em staging.
- Fazer os 3 num commit só.
- "Otimizar" carga que ainda não existe além de deixar pronto+reversível.
