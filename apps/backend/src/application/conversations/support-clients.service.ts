import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';
import { SUPPORT_CHANNELS } from './conversation-track';
import { cruzarChamadosPorEmpresa, juntarClientesComChamados, type ClienteComChamados } from './support-clients';

/// Teto de chamados lidos para o cruzamento. Alto porque a conta tem que fechar: cortar
/// aqui faria a soma por empresa ficar menor que o total, e a tela avisa quando corta.
const LIMITE_CHAMADOS = 2000;

/// Status que NÃO contam como chamado aberto. Mesma régua da tela.
const ENCERRADOS = ['closed', 'opt_out'];

@Injectable()
export class SupportClientsService {
  private readonly logger = new Logger('SupportClients');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tms: TmsLookupService,
  ) {}

  /**
   * A base de clientes do TMS com os chamados de cada um.
   *
   * A base manda na lista, e é isso que conserta a tela: antes ela montava "Clientes" a
   * partir das conversas de suporte, então cliente que paga e nunca reclamou não existia.
   * Agora ele aparece com zero chamado.
   *
   * Dois bancos, e a falha de cada um é reportada em vez de virar lista vazia — "o TMS
   * não respondeu" e "não há clientes" são coisas diferentes, e quem lê a tela precisa
   * saber qual das duas está vendo.
   */
  async listar(tenantId: string, limite = 500): Promise<{
    clientes: ClienteComChamados[];
    falhou: boolean;
    motivo?: string;
    filtrouCancelados: boolean;
    /// Chamados que não chegaram a nenhuma empresa (sem id, ou usuário removido do TMS).
    chamadosSemEmpresa: number;
    /// true = o teto de leitura cortou; os contadores cobrem só os mais recentes.
    listaCortada: boolean;
  }> {
    const base = await this.tms.listarClientes(limite);
    // TMS fora do ar: devolve o motivo e nem tenta cruzar. Cruzar com base vazia daria
    // "nenhum cliente tem chamado", que é uma afirmação falsa sobre dado que existe.
    if (base.falhou) {
      return { ...base, clientes: [], chamadosSemEmpresa: 0, listaCortada: false };
    }

    const [chamados, total] = await Promise.all([
      this.prisma.aiConversation.findMany({
        where: { tenantId, sourceChannel: { in: [...SUPPORT_CHANNELS] as any } },
        select: { externalId: true, status: true, lastActivityAt: true, startedAt: true },
        orderBy: { lastActivityAt: 'desc' },
        take: LIMITE_CHAMADOS,
      }),
      this.prisma.aiConversation.count({
        where: { tenantId, sourceChannel: { in: [...SUPPORT_CHANNELS] as any } },
      }),
    ]);

    const empresaDoUsuario = await this.tms.empresasDeUsuarios(
      chamados.map((c) => c.externalId).filter(Boolean) as string[],
    );

    const cruzamento = cruzarChamadosPorEmpresa(
      chamados.map((c) => ({
        externalId: c.externalId,
        aberto: !ENCERRADOS.includes(c.status as string),
        em: (c.lastActivityAt ?? c.startedAt)?.getTime() ?? 0,
      })),
      empresaDoUsuario,
    );

    if (cruzamento.semEmpresa) {
      this.logger.warn(
        `${cruzamento.semEmpresa} de ${chamados.length} chamados sem empresa no TMS — id ausente ou usuário removido`,
      );
    }

    return {
      clientes: juntarClientesComChamados(base.clientes, cruzamento),
      falhou: false,
      filtrouCancelados: base.filtrouCancelados,
      chamadosSemEmpresa: cruzamento.semEmpresa,
      listaCortada: total > chamados.length,
    };
  }
}
