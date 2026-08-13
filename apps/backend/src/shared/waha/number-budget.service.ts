/**
 * NumberBudgetService — quanto o número do WhatsApp já mandou hoje, contando
 * TODOS os caminhos de envio.
 *
 * Por que existe: o teto de aquecimento morava em `SenderNumber.sentToday`, que
 * só é incrementado pelo worker de campanha (`sender.service.ts`). Follow-up,
 * resposta da Lia, encerramento do janitor, digest do Monitor, handoff de
 * vendedor e alerta de admin saem pelo MESMO número e não contavam. O painel
 * dizia "10/10 hoje" com o chip tendo mandado muito mais: o freio media um
 * caminho de sete.
 *
 * A contagem fica no único ponto por onde todo envio passa
 * (`WahaClientService`), então um caminho de envio novo já nasce debitado — não
 * dá para esquecer.
 *
 * Semântica deliberada: todo envio DEBITA, mas só a campanha é BLOQUEADA pelo
 * teto. Alerta de cliente que contratou e resposta em conversa aberta são o
 * produto; segurar isso para preservar orçamento de prospecção fria seria
 * trocar o essencial pelo descartável. Quando o teto estoura, quem para é a
 * campanha — ver `SenderService.tick`.
 *
 * Os tetos aqui são rede de segurança contra loop e rajada, não a política de
 * ritmo. O ritmo fino (delay 30–90s, aquecimento, teto por hora) continua no
 * `SenderService`, que só governa o tráfego de campanha.
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createRedisClient } from '@/shared/redis/redis.factory';
import { brasiliaDayStamp, brasiliaHourStamp } from '@/shared/utils/brasilia-hours.util';

// Lidos a cada uso (não no import) para que mudar o .env valha sem rebuild —
// mesmo padrão de `optOutFooter()` no follow-up.
/** Teto diário do número somando TODOS os caminhos. */
const dailyCeiling = () => Number(process.env.NUMBER_DAILY_CEILING ?? 250);
/** Teto por hora — pega rajada mesmo quando o total do dia ainda está folgado. */
const hourlyCeiling = () => Number(process.env.NUMBER_HOURLY_CEILING ?? 40);

// TTL generoso o suficiente para a chave sobreviver ao dia/hora que ela mede e
// sumir sozinha depois — sem varredura e sem chave órfã acumulando no Redis.
const DAY_TTL_S = 36 * 3600;
const HOUR_TTL_S = 2 * 3600;

/** Sem linha = principal, mesmo default usado em `WahaClientService.resolveLinha`. */
const LINHA_PADRAO = 'principal';

const KEY_DAY = (linha: string, stamp: string) => `number:sent:day:${linha}:${stamp}`;
const KEY_HOUR = (linha: string, stamp: string) => `number:sent:hour:${linha}:${stamp}`;
const KEY_ORIGIN = (linha: string, stamp: string) => `number:sent:origin:${linha}:${stamp}`;

export interface NumberBudgetSnapshot {
  /** Envios de hoje por todos os caminhos. */
  today: number;
  /** Envios na hora corrente. */
  thisHour: number;
  /** Quebra por origem (`campaign`, `lia`, `monitor`, …) no dia. */
  byOrigin: Record<string, number>;
  dailyCeiling: number;
  hourlyCeiling: number;
}

@Injectable()
export class NumberBudgetService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('NumberBudget');
  private redis: Redis | null = null;

  // Fallback em memória: sem Redis o processo continua contando (single-instance),
  // igual ao estado anti-ban do SenderService. Some no restart — aceitável para um
  // teto de segurança, e o alternativa (não contar nada) é pior.
  //
  // Um balde POR LINHA (2026-08-13): antes disto era um único contador global,
  // então a linha vendas debitaria no mesmo orçamento da principal e as duas
  // ficariam com o teto errado assim que o segundo número começasse a mandar
  // mensagem de verdade.
  private local = new Map<string, { dayStamp: string; day: number; hourStamp: string; hour: number; byOrigin: Map<string, number> }>();

  private localFor(linha: string) {
    let l = this.local.get(linha);
    if (!l) {
      l = { dayStamp: '', day: 0, hourStamp: '', hour: 0, byOrigin: new Map<string, number>() };
      this.local.set(linha, l);
    }
    return l;
  }

  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (url) {
      this.redis = createRedisClient(url, 'number-budget');
    } else {
      this.logger.warn('REDIS_URL ausente — orçamento do número contado em memória (single-instance)');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => null);
  }

  /** Zera os contadores locais quando vira o dia/hora (o Redis faz isso via chave nova). */
  private rollLocal(linha: string, dayStamp: string, hourStamp: string) {
    const l = this.localFor(linha);
    if (l.dayStamp !== dayStamp) {
      l.dayStamp = dayStamp;
      l.day = 0;
      l.byOrigin.clear();
    }
    if (l.hourStamp !== hourStamp) {
      l.hourStamp = hourStamp;
      l.hour = 0;
    }
    return l;
  }

  /**
   * Debita um envio. `origin` é só rótulo de diagnóstico (`campaign`, `lia`,
   * `monitor`, `janitor`, …) — não muda o teto. `linha` isola o balde: sem ela,
   * cai na principal.
   *
   * Nunca lança: contar é observabilidade, e derrubar um envio real porque o
   * Redis piscou seria trocar um problema pequeno por um grande.
   */
  async record(origin: string, linha: string = LINHA_PADRAO): Promise<void> {
    const now = new Date();
    const dayStamp = brasiliaDayStamp(now);
    const hourStamp = brasiliaHourStamp(now);

    const l = this.rollLocal(linha, dayStamp, hourStamp);
    l.day += 1;
    l.hour += 1;
    l.byOrigin.set(origin, (l.byOrigin.get(origin) ?? 0) + 1);

    if (!this.redis) return;
    try {
      await this.redis
        .multi()
        .incr(KEY_DAY(linha, dayStamp))
        .expire(KEY_DAY(linha, dayStamp), DAY_TTL_S)
        .incr(KEY_HOUR(linha, hourStamp))
        .expire(KEY_HOUR(linha, hourStamp), HOUR_TTL_S)
        .hincrby(KEY_ORIGIN(linha, dayStamp), origin, 1)
        .expire(KEY_ORIGIN(linha, dayStamp), DAY_TTL_S)
        .exec();
    } catch (e: any) {
      this.logger.warn(`falha ao debitar envio (origin=${origin}, linha=${linha}): ${e?.message}`);
    }
  }

  /** Quanto o número já mandou hoje e nesta hora, com a quebra por origem. */
  async snapshot(linha: string = LINHA_PADRAO): Promise<NumberBudgetSnapshot> {
    const now = new Date();
    const dayStamp = brasiliaDayStamp(now);
    const hourStamp = brasiliaHourStamp(now);
    const l = this.rollLocal(linha, dayStamp, hourStamp);

    const base = {
      dailyCeiling: dailyCeiling(),
      hourlyCeiling: hourlyCeiling(),
    };

    if (!this.redis) {
      return {
        ...base,
        today: l.day,
        thisHour: l.hour,
        byOrigin: Object.fromEntries(l.byOrigin),
      };
    }

    try {
      const [day, hour] = await this.redis.mget(KEY_DAY(linha, dayStamp), KEY_HOUR(linha, hourStamp));
      const byOrigin = await this.redis.hgetall(KEY_ORIGIN(linha, dayStamp));
      return {
        ...base,
        today: Number(day ?? 0),
        thisHour: Number(hour ?? 0),
        byOrigin: Object.fromEntries(Object.entries(byOrigin).map(([k, v]) => [k, Number(v)])),
      };
    } catch (e: any) {
      this.logger.warn(`falha ao ler orçamento (linha=${linha}), usando contagem local: ${e?.message}`);
      return {
        ...base,
        today: l.day,
        thisHour: l.hour,
        byOrigin: Object.fromEntries(l.byOrigin),
      };
    }
  }

  /**
   * Teto estourado? Consultado pelo worker de campanha antes de disparar.
   * Devolve o motivo pronto para log — quem chama não precisa remontar a frase.
   */
  async overCeiling(linha: string = LINHA_PADRAO): Promise<{ over: boolean; reason?: string; snapshot: NumberBudgetSnapshot }> {
    const snapshot = await this.snapshot(linha);
    if (snapshot.today >= snapshot.dailyCeiling) {
      return {
        over: true,
        reason:
          `teto DIÁRIO do número atingido (${snapshot.today}/${snapshot.dailyCeiling} somando todos os canais: ` +
          `${describeOrigins(snapshot.byOrigin)})`,
        snapshot,
      };
    }
    if (snapshot.thisHour >= snapshot.hourlyCeiling) {
      return {
        over: true,
        reason: `teto POR HORA do número atingido (${snapshot.thisHour}/${snapshot.hourlyCeiling} somando todos os canais)`,
        snapshot,
      };
    }
    return { over: false, snapshot };
  }
}

/** "campaign=12, monitor=30, lia=4" — ordenado do maior para o menor. */
function describeOrigins(byOrigin: Record<string, number>): string {
  const entries = Object.entries(byOrigin).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(', ') : 'sem detalhe';
}
