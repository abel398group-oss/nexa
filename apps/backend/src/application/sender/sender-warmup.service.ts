/**
 * sender-warmup.service.ts — quem liga o motor da escada de aquecimento.
 *
 * A regra de subir mora em `sender-warmup.ts`, pura. Aqui fica só o que precisa de
 * banco e de relógio: quem são os números, quanto cada um mandou no degrau, e a
 * gravação do novo degrau.
 *
 * Roda uma vez por dia, e não a cada tick: aquecimento se mede em dias, e reavaliar a
 * cada 15 segundos varreria 24h de alvos por número para responder algo que só muda
 * uma vez a cada três dias.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { RedisLockService } from '@/shared/lock/redis-lock.service';
import { SenderService, WARMUP_DAILY } from './sender.service';
import { decidirAquecimento, escadaDoEnv } from './sender-warmup';

@Injectable()
export class SenderWarmupService {
  private readonly logger = new Logger('SenderWarmup');

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: SenderService,
    private readonly lock: RedisLockService,
  ) {}

  /**
   * 05:00 BRT — antes da janela de envio (`SENDER_BUSINESS_START`, default 07h), para
   * o número já começar o dia com o teto novo. Subir o degrau no meio da tarde daria
   * um dia pela metade no teto novo, e o próximo passo contaria um dia que não houve.
   */
  @Cron('0 5 * * *', { timeZone: 'America/Sao_Paulo' })
  async tick(): Promise<void> {
    const release = await this.lock.acquire('lock:sender:warmup', 600);
    if (!release) return;
    try {
      await this.avaliarTodos();
    } catch (e) {
      // Aquecimento é melhoria contínua, não pré-requisito: falhar aqui não pode
      // derrubar o disparo. Mas some do log NUNCA (REGRA 3).
      this.logger.error(`Avaliação de aquecimento falhou: ${(e as Error).message}`);
    } finally {
      await release();
    }
  }

  /** Exposto para o painel e para teste: avalia e aplica, devolvendo o que mudou. */
  async avaliarTodos(): Promise<{ avaliados: number; subiram: number }> {
    const escada = escadaDoEnv([...WARMUP_DAILY]);
    const agora = new Date();

    const numeros = await this.prisma.senderNumber.findMany({
      // Número desativado não aquece: ou foi o freio de engajamento que o tirou do ar,
      // ou alguém o desligou de propósito. Nos dois casos, subir o teto dele agora é
      // preparar um volume maior para quando voltar — exatamente ao contrário.
      where: { active: true },
      select: {
        id: true, tenantId: true, phone: true, linha: true,
        warmupStage: true, warmupStageSince: true, createdAt: true,
      },
    });

    // Saúde é por tenant (é o que `engagementHealth` apura), então é lida uma vez por
    // tenant e não uma vez por número — dois números do mesmo tenant fariam a mesma
    // varredura de 24h duas vezes.
    const saudePorTenant = new Map<string, boolean>();
    let subiram = 0;

    for (const n of numeros) {
      if (!saudePorTenant.has(n.tenantId)) {
        const v = await this.sender.engagementHealth(n.tenantId).catch(() => null);
        // Sem veredito não se sobe. Falha de apuração é ausência de prova de saúde, e
        // a escada só anda com prova — o freio pode falhar aberto porque errar lá só
        // atrasa um envio; errar aqui aumenta volume às cegas.
        saudePorTenant.set(n.tenantId, v?.healthy ?? false);
      }

      const veredito = decidirAquecimento(
        {
          warmupStage: n.warmupStage,
          stageSince: n.warmupStageSince,
          createdAt: n.createdAt,
          enviadosNoEstagio: await this.enviadosNoEstagio(n),
          saudavel: saudePorTenant.get(n.tenantId) ?? false,
        },
        escada,
        agora,
      );

      if (!veredito.avanca) {
        this.logger.debug(`${n.phone} (${n.linha}): fica no degrau ${n.warmupStage} — ${veredito.motivo}`);
        continue;
      }

      await this.prisma.senderNumber.update({
        where: { id: n.id },
        data: { warmupStage: veredito.proximoEstagio, warmupStageSince: agora },
      });
      subiram++;
      this.logger.log(
        `AQUECIMENTO: ${n.phone} (${n.linha}) subiu para o degrau ${veredito.proximoEstagio} ` +
          `(${escada.degraus[veredito.proximoEstagio]}/dia) — ${veredito.motivo}`,
      );
    }

    if (subiram) this.logger.log(`Aquecimento: ${subiram} de ${numeros.length} número(s) subiram de degrau`);
    return { avaliados: numeros.length, subiram };
  }

  /**
   * Envios com sucesso atribuídos a este número desde que entrou no degrau.
   *
   * O vínculo é pela LINHA: `campaign_targets` não guarda qual número enviou, mas a
   * campanha guarda por qual linha saiu, e cada linha é um chip. Sem o `join`, um
   * número parado herdaria os envios do outro e subiria de degrau de carona.
   */
  private async enviadosNoEstagio(n: {
    tenantId: string; linha: string; warmupStageSince: Date | null; createdAt: Date;
  }): Promise<number> {
    const desde = n.warmupStageSince ?? n.createdAt;
    const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n
        FROM campaign_targets t
        JOIN campaigns c ON c.id = t.campaign_id
       WHERE t.tenant_id = ${n.tenantId}
         AND c.linha = ${n.linha}
         AND t.status = 'sent'
         AND t.sent_at >= ${desde}
    `;
    return Number(rows[0]?.n ?? 0);
  }
}
