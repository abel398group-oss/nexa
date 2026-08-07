/**
 * Fábrica única de clientes Redis.
 *
 * Existe por causa de um crash de processo, não por organização: o backend criava
 * seis clientes ioredis espalhados (lock, webhooks, sender, proactive-engine,
 * health, gateway WS) e NENHUM registrava listener de `error`. Um EventEmitter que
 * emite `error` sem ouvinte **lança** — então uma queda do Redis não degradava o
 * serviço, derrubava o processo inteiro:
 *
 *   MaxRetriesPerRequestError: Reached the max retries per request limit (20)
 *     at Socket.<anonymous> (ioredis/built/redis/event_handler.js:207)
 *
 * Em produção isso significa que uma oscilação do Redis mata todas as réplicas ao
 * mesmo tempo. Localmente, significa que o backend não sobe sem `docker compose up
 * -d redis` — mesmo em tarefas que não usam Redis para nada.
 *
 * Todo caminho que precisa de Redis já é fail-open no chamador (ver
 * RedisLockService.acquire): sem Redis o serviço roda em modo single-instance. O
 * que faltava era não morrer no meio do caminho.
 */
import { Logger } from '@nestjs/common';
import { Redis, RedisOptions } from 'ioredis';

/** Silencia repetição: com o Redis fora, o retry dispara um erro por segundo. */
const INTERVALO_LOG_MS = 60_000;

export function createRedisClient(
  url: string,
  nome: string,
  opts: RedisOptions = {},
): Redis {
  const logger = new Logger(`Redis:${nome}`);

  const client = new Redis(url, {
    lazyConnect: true,
    // Backoff crescente com teto de 10s — reconecta sozinho quando o Redis volta,
    // sem martelar a rede enquanto ele está fora.
    retryStrategy: (tentativa) => Math.min(tentativa * 500, 10_000),
    // Falha RÁPIDO no comando (o default é 20 tentativas). Com o backoff acima,
    // o default deixaria uma chamada pendurada por minutos — foi o que travou o
    // /health quando o Redis estava fora. Todo chamador aqui trata Redis como
    // opcional e segue sem ele, então errar cedo é melhor que esperar.
    maxRetriesPerRequest: 2,
    connectTimeout: 5_000,
    ...opts,
  });

  let ultimoLog = 0;
  let errosSilenciados = 0;

  // O listener é o ponto inteiro deste arquivo: com ele registrado, o erro vira
  // log; sem ele, vira exceção não tratada e o processo morre.
  client.on('error', (err: Error) => {
    const agora = Date.now();
    if (agora - ultimoLog < INTERVALO_LOG_MS) {
      errosSilenciados++;
      return;
    }
    const repetidos = errosSilenciados > 0 ? ` (+${errosSilenciados} erros iguais no último minuto)` : '';
    ultimoLog = agora;
    errosSilenciados = 0;
    logger.warn(`indisponível: ${err.message}${repetidos} — seguindo em modo degradado`);
  });

  client.on('ready', () => {
    if (ultimoLog > 0) logger.log('reconectado');
    ultimoLog = 0;
    errosSilenciados = 0;
  });

  return client;
}
