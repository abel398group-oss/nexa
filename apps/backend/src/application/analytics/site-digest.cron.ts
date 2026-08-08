/**
 * Resumo diário das visitas do site, no WhatsApp do admin.
 *
 * UM por dia, nunca um por visita. Já existe precedente disso no produto (o resumo
 * diário de pagamentos nasceu justamente para não inundar a caixa), e alerta que
 * chega demais deixa de ser lido — aí a próxima informação importante passa batida.
 *
 * DIA SEM VISITA → NÃO MANDA NADA. Silêncio é informação: significa que ninguém
 * entrou no site. Mandar "0 visitas" todo dia treina o leitor a ignorar a mensagem.
 *
 * Desligável por env sem redeploy (`SITE_DIGEST_ENABLED=false`), como pedido.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AdminAlertService } from '@/application/monitor/admin-alert.service';
import { RedisLockService } from '@/shared/lock/redis-lock.service';
import { PageviewStatsService, ResumoDiario } from './pageview-stats.service';

const LOCK = 'nexa:site-digest:diario';
const LOCK_TTL_S = 600;

@Injectable()
export class SiteDigestCron {
  private readonly logger = new Logger('SiteDigest');

  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: PageviewStatsService,
    private readonly alerta: AdminAlertService,
    private readonly lock: RedisLockService,
  ) {}

  private habilitado(): boolean {
    return (process.env.SITE_DIGEST_ENABLED ?? 'true').toLowerCase() !== 'false';
  }

  /**
   * 08:00 em Brasília (11:00 UTC).
   *
   * De manhã e não de madrugada de propósito: mensagem que chega às 3h fica
   * enterrada sob tudo que chegou depois, e o número do dia anterior é para ser lido
   * quando a pessoa começa a trabalhar.
   */
  @Cron('0 11 * * *')
  async enviar(): Promise<void> {
    if (!this.habilitado()) return;

    // Lock distribuído: com mais de uma réplica, todas acordam no mesmo minuto e o
    // admin receberia a mesma mensagem N vezes.
    const release = await this.lock.acquire(LOCK, LOCK_TTL_S);
    if (!release) {
      this.logger.debug('Resumo diário já está sendo enviado por outra instância');
      return;
    }

    try {
      const ontem = new Date(Date.now() - 24 * 3600 * 1000);

      // Um resumo por site cadastrado — o Nexa é multi-tenant e cada tenant tem o
      // seu. Hoje é um, e a query já lida com N sem mudar nada.
      const sites = await this.prisma.website
        .findMany({ where: { isActive: true }, select: { tenantId: true, domain: true } })
        .catch((e: any) => {
          this.logger.warn(`Falha ao listar sites: ${e?.message}`);
          return [];
        });

      for (const site of sites) {
        try {
          const r = await this.stats.resumoDoDia(site.tenantId, ontem);
          if (r.visitas === 0) {
            this.logger.log(`Sem visitas em ${r.dia} (${site.domain}) — nada enviado`);
            continue;
          }
          await this.alerta.notifyAdmin(
            `${site.domain} ontem (${this.dataCurta(r.dia)})`,
            this.corpo(r),
            { icon: '📊' },
          );
          this.logger.log(`Resumo enviado: ${site.domain} ${r.dia} — ${r.visitas} visitas`);
        } catch (e: any) {
          // Um site com problema não pode impedir o resumo dos outros.
          this.logger.warn(`Resumo de ${site.domain} falhou: ${e?.message}`);
        }
      }
    } finally {
      await release();
    }
  }

  /** YYYY-MM-DD → DD/MM. */
  private dataCurta(dia: string): string {
    const [, m, d] = dia.split('-');
    return `${d}/${m}`;
  }

  /**
   * Corpo do resumo. Texto puro — o mesmo vai para WhatsApp e e-mail.
   *
   * A variação percentual só aparece quando há base de comparação: "+100%" saindo de
   * 1 visita para 2 é tecnicamente verdade e completamente inútil, e sem dia anterior
   * nenhum a conta seria divisão por zero.
   */
  private corpo(r: ResumoDiario): string {
    const linhas = [`Visitas: ${r.visitas}${this.variacao(r)}`, `Visitantes únicos: ${r.unicos}`];
    if (r.topOrigem) linhas.push(`Top origem: ${r.topOrigem.rotulo} (${r.topOrigem.visitas})`);
    if (r.topPagina) linhas.push(`Página mais vista: ${r.topPagina.rotulo} (${r.topPagina.visitas})`);
    return linhas.join('\n');
  }

  private variacao(r: ResumoDiario): string {
    const base = r.visitasDiaAnterior;
    if (base < 5) return ''; // base pequena: percentual engana mais do que informa
    const pct = Math.round(((r.visitas - base) / base) * 100);
    if (pct === 0) return ' (igual ao dia anterior)';
    return ` (${pct > 0 ? '+' : ''}${pct}% vs dia anterior)`;
  }
}
