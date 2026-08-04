/**
 * abuse-guard.service.ts — "3 strikes" para quem tenta manipular a Lia.
 *
 * ## Por que existe
 *
 * O `output-guard.ts` (shared/governance) já barra deterministicamente preço
 * inventado, vazamento de prompt, ofensa e dado de terceiro — mas até aqui, cada
 * bloqueio só ia pro log. Quem tentava de novo no dia seguinte tinha a mesma
 * chance de passar. Este serviço fecha esse ciclo: conta as tentativas por
 * telefone e, ao atingir o teto, silencia o número — igual banimento de rede
 * social.
 *
 * ## Por que "strike", não "erro"
 *
 * Um bloqueio do output-guard nunca é a Lia errando sozinha — é sempre uma
 * tentativa de manipulação que o guard interceptou (ela só dispara quando o
 * rascunho JÁ continha algo que não devia sair). Contar isso como abuso, não
 * como bug, é a leitura correta do sinal.
 *
 * ## Por que o banimento é silencioso
 *
 * Mesma lógica do `wrong_person`: um número banido que recebe "sua conta foi
 * suspensa" aprende que o ataque funcionou até certo ponto — sabe quantas
 * tentativas faltavam. Silêncio total não dá esse retorno.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AdminAlertService } from '@/application/monitor/admin-alert.service';

/** Tentativas de manipulação antes de banir. Configurável — ver ABUSE_BAN_THRESHOLD. */
const BAN_THRESHOLD = Number(process.env.ABUSE_BAN_THRESHOLD ?? 3);

@Injectable()
export class AbuseGuardService {
  private readonly logger = new Logger('AbuseGuard');

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAlert: AdminAlertService,
  ) {}

  /** O número já está banido? Chamado ANTES de gastar qualquer chamada de IA. */
  async isBanned(tenantId: string, phone: string): Promise<boolean> {
    if (!phone) return false;
    const row = await this.prisma.contactAbuseRecord
      .findUnique({ where: { tenantId_phone: { tenantId, phone } }, select: { bannedAt: true } })
      .catch(() => null);
    return !!row?.bannedAt;
  }

  /**
   * Registra uma tentativa bloqueada pelo output-guard e bane se atingir o teto.
   *
   * Idempotente por natureza (upsert com increment) — chamadas concorrentes da
   * mesma conversa não perdem contagem. Nunca lança: uma falha aqui não pode
   * impedir o aceno seguro de ser enviado, que já é o comportamento correto
   * independente de o strike ter sido gravado.
   */
  async recordStrike(
    tenantId: string,
    phone: string,
    violations: string[],
    detail: string,
  ): Promise<{ banned: boolean; strikeCount: number }> {
    if (!phone) return { banned: false, strikeCount: 0 };

    try {
      const row = await this.prisma.contactAbuseRecord.upsert({
        where: { tenantId_phone: { tenantId, phone } },
        update: {
          strikeCount: { increment: 1 },
          lastViolation: violations.join(','),
          lastDetail: detail.slice(0, 500),
          lastAt: new Date(),
        },
        create: {
          tenantId,
          phone,
          strikeCount: 1,
          lastViolation: violations.join(','),
          lastDetail: detail.slice(0, 500),
          lastAt: new Date(),
        },
      });

      // `!row.bannedAt` evita re-notificar em cada violação futura: uma vez banido,
      // o número já é barrado antes de chegar aqui (isBanned() corta no topo do
      // handle()) — mas checamos mesmo assim, defesa em profundidade.
      if (row.strikeCount >= BAN_THRESHOLD && !row.bannedAt) {
        await this.prisma.contactAbuseRecord.update({
          where: { id: row.id },
          data: { bannedAt: new Date() },
        });
        this.logger.warn(
          `BANIMENTO: ${phone} (tenant=${tenantId}) atingiu ${row.strikeCount} tentativas — ` +
          `última: ${violations.join(', ')}`,
        );
        await this.adminAlert
          .notifyAdmin(
            `Número banido por abuso — ${phone}`,
            `${phone} tentou manipular a Lia ${row.strikeCount} vezes e foi banido automaticamente.\n\n` +
              `Última tentativa: ${detail}\n\n` +
              `A Lia não responde mais este número (silêncio, sem aviso — evita ` +
              `confirmar que o ataque teve efeito). Para reverter, use o painel de ` +
              `moderação em Contatos.`,
          )
          .catch(() => null);
        return { banned: true, strikeCount: row.strikeCount };
      }

      return { banned: !!row.bannedAt, strikeCount: row.strikeCount };
    } catch (e: any) {
      this.logger.warn(`Falha ao registrar strike de ${phone}: ${e?.message}`);
      return { banned: false, strikeCount: 0 };
    }
  }

  /** Lista números banidos do tenant, mais recentes primeiro — para o painel de moderação. */
  async listBanned(tenantId: string) {
    return this.prisma.contactAbuseRecord.findMany({
      where: { tenantId, bannedAt: { not: null } },
      orderBy: { bannedAt: 'desc' },
    });
  }

  /** Reverte o banimento (decisão manual do admin) — zera a contagem para dar um recomeço limpo. */
  async unban(tenantId: string, phone: string): Promise<{ ok: boolean }> {
    const r = await this.prisma.contactAbuseRecord.updateMany({
      where: { tenantId, phone },
      data: { bannedAt: null, strikeCount: 0 },
    });
    if (r.count > 0) this.logger.log(`Desbanido manualmente: ${phone} (tenant=${tenantId})`);
    return { ok: r.count > 0 };
  }
}
