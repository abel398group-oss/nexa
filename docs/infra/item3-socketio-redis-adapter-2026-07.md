# Item 3 — Socket.io Redis adapter [FUTURO]

> Parte do `docs/infra/plano-escala-2026-07.md`. **NÃO implementar até o
> gatilho.** Inerte com 1 réplica; só faz diferença ao ligar a 2ª.

## Gatilho

Executar junto com a decisão de ligar a **2ª réplica** do backend. Antes disso
não muda nada — pode ser adicionado com folga e ficar dormente, mas sem urgência.

## Problema

O inbox em tempo real usa Socket.io **sem Redis adapter**. Com 2 réplicas, uma
mensagem que chega no backend A **não aparece** pro atendente conectado no
backend B — o suporte ao vivo quebra silenciosamente. Marcado 🔴 crítico em
`escalabilidade-nexa.md`.

## Solução

- Adicionar `@socket.io/redis-adapter` + `@socket.io/redis-emitter`.
- Configurar o gateway (`presentation/ws/`) pra usar o adapter apontando pro
  Redis já existente (mesma instância do lock/cache).
- Pub/sub do socket.io passa pelo Redis → evento emitido em qualquer réplica
  chega a todos os clientes, em qualquer instância.

## Passos

1. Instalar os pacotes.
2. No bootstrap do gateway WS, criar pub/sub clients (ioredis) e
   `io.adapter(createAdapter(pub, sub))`.
3. Reusar `REDIS_URL` (não abrir conexão nova sem contar no limite — REGRA 5).

## Validação

- **1 réplica:** inbox idêntico ao de hoje (regressão zero — é o teste que
  importa antes de subir a 2ª).
- **Staging 2 réplicas:** cliente conectado na réplica A vê mensagem que chegou
  pela réplica B.

## Reverter

Remover o `io.adapter(...)` — volta ao adapter em memória do socket.io (1 réplica).

## TMS

Nada direto. O webchat embutido do TMS conecta via WS ao Nexa, mas o adapter é
transparente pro cliente — nenhum contrato muda.
