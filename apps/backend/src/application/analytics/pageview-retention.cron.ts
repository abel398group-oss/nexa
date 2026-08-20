/**
 * Expurgo de retenção da `page_views` — a parte executável da nota de LGPD.
 *
 * O comentário do model (schema.prisma) registra desde 10/08/2026 que a tabela passou
 * a conter DADO PESSOAL (o `ip` do visitante) e que isso exige "prazo de retenção com
 * expurgo". A decisão foi anotada; a rotina que apaga nunca existiu. Este arquivo é
 * ela.
 *
 * DUAS IDADES, NÃO UMA. Apagar a visita inteira jogaria fora o histórico do painel
 * junto com o dado pessoal, e são coisas com necessidades diferentes:
 *
 *   1. O `ip` é ANULADO aos `PAGEVIEW_IP_RETENTION_DAYS` dias (padrão 30). Verificado
 *      em 20/08/2026: NADA lê essa coluna — `pageview-stats.service.ts` nunca a toca,
 *      e os visitantes únicos saem do `visitorHash`, que é derivado na entrada e não
 *      volta ao IP. Guardar o IP cru além disso é acumular risco sem ganhar consulta.
 *   2. A LINHA é apagada aos `PAGEVIEW_ROW_RETENTION_DAYS` dias (padrão 366), que é o
 *      teto que o próprio painel aceita consultar (MAX_DIAS em analytics.controller).
 *      Depois disso o dado não é nem alcançável pela tela.
 *
 * Resultado: o gráfico continua inteiro, sem o dado pessoal embaixo.
 *
 * EM LOTES, de propósito. Rodando todo dia os lotes são minúsculos. Mas a PRIMEIRA
 * execução pode encontrar o acúmulo de meses — e um `DELETE` único sobre centenas de
 * milhares de linhas segura lock e trava o banco de produção. Lote + laço faz a mesma
 * faxina sem prender a tabela.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { RedisLockService } from '@/shared/lock/redis-lock.service';

const LOCK = 'nexa:pageview-retention:diario';
const LOCK_TTL_S = 900;

const IP_DIAS_PADRAO = 30;
const LINHA_DIAS_PADRAO = 366;

/** Linhas por lote. Pequeno o bastante para não segurar lock perceptível. */
const LOTE = 5_000;
/** Trava de segurança do laço: 200 lotes = 1 milhão de linhas por execução. */
const MAX_LOTES = 200;

/**
 * Três estados, não dois:
 *   ausente / 'false' → NÃO FAZ NADA (padrão — a rotina nasce desligada, a pedido)
 *   'dry'             → conta o que apagaria e loga, sem escrever nada
 *   'true'            → executa
 */
type Modo = 'off' | 'dry' | 'on';

@Injectable()
export class PageviewRetentionCron {
  private readonly logger = new Logger('PageviewRetention');

  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: RedisLockService,
  ) {}

  private modo(): Modo {
    const v = (process.env.PAGEVIEW_RETENTION_ENABLED ?? '').trim().toLowerCase();
    if (v === 'dry') return 'dry';
    // Só a palavra exata liga. Qualquer outra coisa (inclusive vazio, '1', 'sim')
    // mantém desligado: uma rotina que APAGA não pode ligar por engano de digitação.
    if (v === 'true') return 'on';
    return 'off';
  }

  /** 03:00 em Brasília (06:00 UTC) — fora do horário de uso, como as outras faxinas. */
  @Cron('0 6 * * *')
  async executar(): Promise<void> {
    const modo = this.modo();
    if (modo === 'off') return;

    // Com mais de uma réplica, todas acordam no mesmo minuto e disputariam as mesmas
    // linhas.
    const release = await this.lock.acquire(LOCK, LOCK_TTL_S);
    if (!release) {
      this.logger.debug('Expurgo já está rodando em outra instância');
      return;
    }

    try {
      const ipDias = this.dias('PAGEVIEW_IP_RETENTION_DAYS', IP_DIAS_PADRAO);
      const linhaDias = this.dias('PAGEVIEW_ROW_RETENTION_DAYS', LINHA_DIAS_PADRAO);

      // Guarda de coerência: anular o IP DEPOIS de apagar a linha não faz sentido, e
      // uma inversão nas envs passaria despercebida até alguém notar IP antigo vivo.
      if (ipDias > linhaDias) {
        this.logger.warn(
          `PAGEVIEW_IP_RETENTION_DAYS (${ipDias}) é maior que PAGEVIEW_ROW_RETENTION_DAYS (${linhaDias}) — o IP viveria até a linha sumir. Corrija as envs.`,
        );
      }

      const ipAntesDe = this.limite(ipDias);
      const linhaAntesDe = this.limite(linhaDias);

      if (modo === 'dry') {
        const [ips, linhas] = await Promise.all([
          this.contarIps(ipAntesDe),
          this.contarLinhas(linhaAntesDe),
        ]);
        this.logger.log(
          `[dry] anularia ${ips} ip(s) com mais de ${ipDias}d e apagaria ${linhas} linha(s) com mais de ${linhaDias}d — nada foi escrito`,
        );
        return;
      }

      const ipsAnulados = await this.anularIps(ipAntesDe);
      const linhasApagadas = await this.apagarLinhas(linhaAntesDe);

      // Silêncio quando não há o que fazer: a partir do 2º dia o normal é zero, e um
      // log diário de "0 e 0" só treina o leitor a ignorar a linha.
      if (ipsAnulados > 0 || linhasApagadas > 0) {
        this.logger.log(
          `${ipsAnulados} ip(s) anulado(s) (>${ipDias}d), ${linhasApagadas} linha(s) apagada(s) (>${linhaDias}d)`,
        );
      }
    } catch (e: any) {
      // REGRA 3: falha de faxina não pode sumir. Se isto ficar aparecendo, a tabela
      // está crescendo com dado pessoal e ninguém sabe.
      this.logger.error(`Expurgo de page_views falhou: ${e?.message}`);
    } finally {
      await release();
    }
  }

  private dias(env: string, padrao: number): number {
    const n = Number(process.env[env] ?? padrao);
    // Zero ou negativo apagaria tudo, inclusive o de hoje. Valor inválido cai no
    // padrão em vez de virar uma faxina destrutiva.
    if (!Number.isFinite(n) || n < 1) {
      if (process.env[env] !== undefined) {
        this.logger.warn(`${env}="${process.env[env]}" é inválido — usando ${padrao}`);
      }
      return padrao;
    }
    return Math.floor(n);
  }

  private limite(dias: number): Date {
    return new Date(Date.now() - dias * 24 * 3600 * 1000);
  }

  private contarIps(antesDe: Date): Promise<number> {
    return this.prisma.pageView.count({ where: { ip: { not: null }, createdAt: { lt: antesDe } } });
  }

  private contarLinhas(antesDe: Date): Promise<number> {
    return this.prisma.pageView.count({ where: { createdAt: { lt: antesDe } } });
  }

  /**
   * Anula o IP e preserva o resto da linha — a visita continua contando no painel.
   * `ip IS NOT NULL` no filtro para o lote não reprocessar o que já foi limpo.
   */
  private async anularIps(antesDe: Date): Promise<number> {
    return this.emLotes('anularIps', async () => {
      const n = await this.prisma.$executeRaw`
        UPDATE page_views SET ip = NULL
         WHERE id IN (
           SELECT id FROM page_views
            WHERE ip IS NOT NULL AND created_at < ${antesDe}
            LIMIT ${LOTE}
         )`;
      return Number(n);
    });
  }

  private async apagarLinhas(antesDe: Date): Promise<number> {
    return this.emLotes('apagarLinhas', async () => {
      const n = await this.prisma.$executeRaw`
        DELETE FROM page_views
         WHERE id IN (
           SELECT id FROM page_views WHERE created_at < ${antesDe} LIMIT ${LOTE}
         )`;
      return Number(n);
    });
  }

  /** Repete o lote até não sobrar nada, com teto para o laço nunca ser infinito. */
  private async emLotes(rotulo: string, lote: () => Promise<number>): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_LOTES; i++) {
      const n = await lote();
      total += n;
      if (n < LOTE) return total;
    }
    // Diz que parou no teto em vez de deixar parecer que terminou: o resto sai na
    // execução de amanhã, e ficar calado aqui esconderia um acúmulo grande.
    this.logger.warn(
      `${rotulo}: teto de ${MAX_LOTES} lotes atingido (${total} linhas) — o restante sai na próxima execução`,
    );
    return total;
  }
}
