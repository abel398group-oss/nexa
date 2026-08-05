/**
 * stale-lead.service.ts — avisa quando um lead fica parado no funil.
 *
 * ## Por que existe
 *
 * O funil não cobrava ninguém. Um lead entrava, o vendedor não mexia, e ele
 * simplesmente afundava na lista — sem alerta, sem prazo, sem nada. O resto do
 * sistema é proativo (follow-up de campanha, alerta de SLA no suporte); o
 * funil comercial era o único lugar onde o silêncio não gerava reação.
 *
 * ## O que conta como "mexer"
 *
 * Ação do VENDEDOR, não do lead: mover de estágio / editar (`updatedAt`) ou
 * registrar ligação/e-mail/nota (`SellerActivity`). Mensagem do lead de
 * propósito NÃO zera o relógio — lead respondendo e ninguém retornando é
 * exatamente o caso que precisa gritar mais alto, não menos.
 *
 * ## Por que só um aviso por lead
 *
 * `staleNotifiedAt` carimba o aviso. Sem isso o mesmo lead voltaria ao sino
 * todo dia até alguém mexer, e o vendedor aprenderia a ignorar o sino inteiro
 * — que é o oposto do objetivo.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { RedisLockService } from '@/shared/lock/redis-lock.service';

/** Dias sem ação do vendedor até o lead ser considerado parado. */
function staleDays(): number {
  return Number(process.env.STALE_LEAD_DAYS ?? 3);
}

/** Estágios em que o lead ainda espera ação — os mesmos da fila. */
const ABERTOS = ['new', 'qualified', 'proposal'];

@Injectable()
export class StaleLeadService {
  private readonly logger = new Logger('StaleLead');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly lock: RedisLockService,
  ) {}

  /**
   * 12:00 UTC = 9h de Brasília — começo do expediente, quando o vendedor abre
   * o painel. Avisar de madrugada empilharia notificação que ninguém lê.
   */
  @Cron('0 12 * * *')
  async tick(): Promise<void> {
    const release = await this.lock.acquire('lock:stale-lead:tick', 300);
    if (!release) return; // outra réplica já está varrendo
    try {
      await this.varrer();
    } catch (e: any) {
      this.logger.warn(`Varredura de leads parados falhou: ${e?.message}`);
    } finally {
      await release();
    }
  }

  /** Exposto para teste e para disparo manual — o @Cron só chama isto. */
  async varrer(agora = new Date()): Promise<{ avisados: number }> {
    const corte = new Date(agora.getTime() - staleDays() * 24 * 60 * 60 * 1000);

    const candidatos = await this.prisma.opportunity.findMany({
      where: {
        stage: { in: ABERTOS },
        updatedAt: { lt: corte },
        // já avisado e ninguém mexeu: não repete (ver cabeçalho)
        OR: [{ staleNotifiedAt: null }, { staleNotifiedAt: { lt: corte } }],
      } as any,
      select: { id: true, tenantId: true, name: true, company: true, phone: true, assignedSellerId: true, updatedAt: true } as any,
      take: 200,
    });
    if (candidatos.length === 0) return { avisados: 0 };

    // Registrar uma ligação NÃO altera o updatedAt da oportunidade, então sem
    // este cruzamento um vendedor que ligou ontem levaria cobrança hoje.
    const ids = candidatos.map((o: any) => o.id);
    const atividades = await (this.prisma as any).sellerActivity.findMany({
      where: { opportunityId: { in: ids }, createdAt: { gte: corte } },
      select: { opportunityId: true },
    });
    const tocadosRecentemente = new Set(atividades.map((a: any) => a.opportunityId));

    const parados = candidatos.filter((o: any) => !tocadosRecentemente.has(o.id));
    if (parados.length === 0) return { avisados: 0 };

    for (const o of parados as any[]) {
      const dias = Math.floor((agora.getTime() - new Date(o.updatedAt).getTime()) / (24 * 60 * 60 * 1000));
      const quem = o.company || o.name || o.phone || 'Lead sem nome';
      await this.notifications.create(o.tenantId, {
        type: 'info',
        title: `⏳ Lead parado há ${dias} dias`,
        body: `${quem} está no funil sem contato há ${dias} dias. Retome ou marque como perdido.`,
        link: '/fila',
      });
    }

    await this.prisma.opportunity.updateMany({
      where: { id: { in: parados.map((o: any) => o.id) } },
      data: { staleNotifiedAt: agora } as any,
    });

    this.logger.log(`Leads parados (> ${staleDays()} dias): ${parados.length} aviso(s) enviado(s)`);
    return { avisados: parados.length };
  }
}
