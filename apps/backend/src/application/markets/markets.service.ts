/**
 * markets.service.ts — mercados (ADR 037).
 *
 * "Mercado" é o nome na tela; no banco é a linha de `products`, porque `productCode` já
 * é a chave que separa conhecimento, campanha e conector em todo o sistema. Um
 * `marketId` paralelo daria duas chaves para o mesmo conceito, presentes em toda
 * consulta e divergindo no primeiro esquecimento.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { avaliarMercado, type MarketCounts, type MarketReadiness } from './market-readiness';

@Injectable()
export class MarketsService {
  private readonly logger = new Logger('Markets');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mercados do tenant com o estado de cada um.
   *
   * O vendedor recebe só os liberados (`somenteLiberados`): mercado em rascunho não
   * pode aparecer no seletor do disparo, senão a trava não serve para nada.
   */
  async list(tenantId: string, opts: { somenteLiberados?: boolean } = {}) {
    const markets = await this.prisma.product.findMany({ orderBy: { name: 'asc' } });
    const visiveis = opts.somenteLiberados ? markets.filter((m: any) => m.status === 'active') : markets;

    return Promise.all(
      visiveis.map(async (m: any) => ({
        ...m,
        readiness: opts.somenteLiberados ? undefined : await this.readiness(tenantId, m.code),
      })),
    );
  }

  /** Conta o que existe e devolve o veredito da trava (ver market-readiness.ts). */
  async readiness(tenantId: string, code: string): Promise<MarketReadiness> {
    const market = await this.prisma.product.findUnique({ where: { code } });
    if (!market) throw new NotFoundException('Mercado não encontrado');

    // Fato "útil" = aprovado E sem pendência de fonte. Contar o pendente junto deixaria
    // um mercado feito só de estatística inventada passar na trava.
    const [conhecimentoUtil, conhecimentoSemFonte, modelos, vendedores] = await Promise.all([
      this.prisma.aiKnowledgeBase.count({
        where: { tenantId, productCode: code, approved: true, requiresSource: false } as any,
      }),
      this.prisma.aiKnowledgeBase.count({
        where: { tenantId, productCode: code, approved: true, requiresSource: true } as any,
      }),
      this.prisma.messageTemplate.count({ where: { tenantId, productCode: code, active: true } }),
      // Com um único número de WhatsApp o time é um só — não há vínculo por mercado
      // nesta fase (ADR 037).
      this.prisma.seller.count({ where: { tenantId, active: true } }),
    ]);

    const counts: MarketCounts = {
      conhecimentoUtil,
      conhecimentoSemFonte,
      modelos,
      vendedores,
      temIdentidade: !!(market as any).displayName && !!(market as any).senderName,
    };
    return avaliarMercado(counts);
  }

  /**
   * Libera o mercado para o disparo.
   *
   * Recusa quando a trava aponta bloqueio — e devolve o motivo, não um "não pode"
   * genérico: quem clicou precisa saber o que falta preencher.
   */
  async release(tenantId: string, code: string) {
    const r = await this.readiness(tenantId, code);
    if (!r.pronto) {
      const faltando = r.pendencias.filter((p) => p.bloqueia).map((p) => p.motivo);
      throw new BadRequestException(`Mercado não pode ser liberado. ${faltando.join(' · ')}`);
    }

    const market = await this.prisma.product.update({
      where: { code },
      data: { status: 'active', releasedAt: new Date() } as any,
    });
    this.logger.log(`Mercado "${market.name}" liberado para disparo`);
    return market;
  }

  /**
   * Suspende o mercado. Some do seletor do vendedor na hora.
   *
   * `releasedAt` é preservado de propósito — é registro de que já esteve no ar, e
   * apagar perderia a única pista de quando começou a prospecção daquele parceiro.
   */
  async pause(_tenantId: string, code: string) {
    const market = await this.prisma.product.update({ where: { code }, data: { status: 'paused' } });
    this.logger.warn(`Mercado "${market.name}" suspenso — sumiu do disparo`);
    return market;
  }
}
