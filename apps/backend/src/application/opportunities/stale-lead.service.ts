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

    // Lead SEM DONO e lead parado são problemas diferentes, e mandá-los para o
    // mesmo lugar quebrava os dois avisos: `/fila` esconde o que não tem dono
    // (ver `sdr.service.ts`), então o SDR que clicasse num aviso de órfão caía
    // numa lista onde aquele lead não está. Aviso que leva a lugar nenhum ensina
    // a ignorar aviso — pior que não avisar.
    //
    // Com dono → é cobrança de quem já tem o lead na mão, e `/fila` é onde ele
    // trabalha. Sem dono → é pedido de DISTRIBUIÇÃO, e o destino é a tela onde
    // se atribui. O texto muda junto: "retome" não é ação possível para quem
    // ainda não recebeu o lead.
    const orfaos = (parados as any[]).filter((o) => !o.assignedSellerId);
    const comDono = (parados as any[]).filter((o) => o.assignedSellerId);

    const diasDe = (o: any) =>
      Math.floor((agora.getTime() - new Date(o.updatedAt).getTime()) / (24 * 60 * 60 * 1000));
    const quemE = (o: any) => o.company || o.name || o.phone || 'Lead sem nome';

    for (const o of comDono) {
      const dias = diasDe(o);
      await this.notifications.create(o.tenantId, {
        type: 'info',
        title: `⏳ Lead parado há ${dias} dias`,
        body: `${quemE(o)} está no funil sem contato há ${dias} dias. Retome ou marque como perdido.`,
        link: '/fila',
      });
    }

    // Um aviso só para os órfãos, com o número. Uma notificação por lead encheria
    // o sino com o mesmo pedido repetido — e o pedido é um: distribuir.
    if (orfaos.length) {
      const porTenant = new Map<string, any[]>();
      for (const o of orfaos) {
        const lista = porTenant.get(o.tenantId) ?? [];
        lista.push(o);
        porTenant.set(o.tenantId, lista);
      }
      for (const [tenantId, lista] of porTenant) {
        const maisAntigo = Math.max(...lista.map(diasDe));
        await this.notifications.create(tenantId, {
          // `info` porque é o que o contrato tem — não existe 'warning' em
          // CreateNotification, e inventar um tipo aqui quebraria a tela do sino,
          // que mapeia ícone por tipo conhecido.
          type: 'info',
          title: `👤 ${lista.length} lead(s) sem vendedor`,
          body:
            `${lista.length === 1 ? quemE(lista[0]) + ' está' : `${lista.length} leads estão`} no funil ` +
            `sem dono há até ${maisAntigo} dia(s) — nenhum SDR consegue vê-los. Distribua para alguém trabalhar.`,
          link: '/opportunities',
        });
      }
    }

    await this.prisma.opportunity.updateMany({
      where: { id: { in: parados.map((o: any) => o.id) } },
      data: { staleNotifiedAt: agora } as any,
    });

    // O lote importado e nunca distribuído é a fábrica de órfão: um clique
    // esquecido deixa a lista inteira invisível para o SDR. O aviso acima pega o
    // efeito (leads sem dono); este pega a CAUSA, e diz onde resolver de uma vez
    // — distribuir o lote é uma ação só, atribuir lead a lead são centenas.
    await this.avisarLotesNaoDistribuidos(agora).catch((e: any) =>
      this.logger.warn(`Aviso de lote não distribuído falhou: ${e?.message}`),
    );

    this.logger.log(`Leads parados (> ${staleDays()} dias): ${parados.length} aviso(s) enviado(s)`);
    return { avisados: parados.length };
  }

  /**
   * Lote que entrou e nunca foi distribuído.
   *
   * Importar não distribui — é um segundo clique, em outra tela. Enquanto ele não
   * acontece, TODO lead do lote está sem dono e invisível para o SDR (a fila
   * esconde quem não tem dono). Um lote de mil leads pode ficar assim
   * indefinidamente sem nada acusar.
   *
   * A janela é a mesma dos leads parados: quem importou de manhã e distribuiu à
   * tarde não precisa levar bronca por isso.
   */
  private async avisarLotesNaoDistribuidos(agora: Date): Promise<void> {
    const corte = new Date(agora.getTime() - staleDays() * 24 * 60 * 60 * 1000);

    const lotes = await this.prisma.leadBatch.findMany({
      where: { createdAt: { lt: corte }, status: { in: ['draft', 'active'] } },
      select: { id: true, tenantId: true, name: true, createdAt: true },
    });
    if (!lotes.length) return;

    for (const lote of lotes) {
      // "Não distribuído" é medido no resultado, não numa flag: se ainda existe
      // oportunidade sem dono deste lote, o passo não foi concluído — vale tanto
      // para quem nunca clicou quanto para quem distribuiu pela metade.
      const orfaos = await this.prisma.opportunity.count({
        where: { tenantId: lote.tenantId, batchId: lote.id, assignedSellerId: null, stage: 'new' },
      });
      if (orfaos === 0) continue;

      const dias = Math.floor((agora.getTime() - new Date(lote.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      await this.notifications.create(lote.tenantId, {
        type: 'info',
        title: `📋 Lote "${lote.name}" sem distribuir`,
        body:
          `${orfaos} lead(s) do lote importado há ${dias} dia(s) continuam sem vendedor — ` +
          'nenhum SDR os enxerga. Distribua o lote para a fila começar a andar.',
        link: '/lead-batches',
      });
      this.logger.warn(`Lote "${lote.name}" (${lote.id}): ${orfaos} lead(s) sem dono há ${dias} dia(s)`);
    }
  }
}
