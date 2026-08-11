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
      this.contarVendedores(tenantId, code),
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
   * Quantos vendedores contam para a trava de liberação.
   *
   * Conta os VINCULADOS a este mercado — é quem de fato pode receber lead dele. Mas com
   * uma escada: enquanto o tenant não tiver nenhum vínculo em `seller_markets`, cai no
   * comportamento antigo (vendedor ativo do tenant).
   *
   * A escada não é gentileza, é sequência. `vendedores === 0` BLOQUEIA liberar, então
   * trocar direto trancaria todo mercado que está no ar hoje — inclusive o HiperTMS — só
   * porque o vínculo é mais novo que eles. Assim que o primeiro vínculo existe, a regra
   * passa a valer de verdade e sozinha.
   */
  private async contarVendedores(tenantId: string, code: string): Promise<number> {
    const [doMercado, totalDeVinculos] = await Promise.all([
      this.prisma.sellerMarket.count({ where: { tenantId, productCode: code } }),
      this.prisma.sellerMarket.count({ where: { tenantId } }),
    ]);
    if (totalDeVinculos === 0) {
      return this.prisma.seller.count({ where: { tenantId, active: true } });
    }
    return doMercado;
  }

  /**
   * Quem trabalha este mercado, e quem ainda não.
   *
   * Devolve as duas listas de uma vez porque a tela precisa das duas: sem os "de fora"
   * não há o que escolher no botão de vincular.
   *
   */
  async vendedoresDoMercado(tenantId: string, code: string) {
    const market = await this.prisma.product.findUnique({ where: { code } });
    if (!market) throw new NotFoundException('Mercado não encontrado');

    const [vinculos, todos] = await Promise.all([
      this.prisma.sellerMarket.findMany({
        where: { tenantId, productCode: code },
        select: { sellerId: true, role: true },
      }),
      this.prisma.seller.findMany({
        where: { tenantId, active: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const papelPor = new Map(vinculos.map((v) => [v.sellerId, v.role]));
    return {
      vinculados: todos
        .filter((s) => papelPor.has(s.id))
        .map((s) => ({ ...s, role: papelPor.get(s.id) as string })),
      disponiveis: todos.filter((s) => !papelPor.has(s.id)),
    };
  }

  /// Vincula vendedor ao mercado. Idempotente: o unique é (sellerId, productCode), e
  /// clicar duas vezes não pode virar erro na cara de quem está montando a operação.
  async vincularVendedor(tenantId: string, code: string, sellerId: string, role = 'seller') {
    const [market, seller] = await Promise.all([
      this.prisma.product.findUnique({ where: { code } }),
      this.prisma.seller.findFirst({ where: { id: sellerId, tenantId } }),
    ]);
    if (!market) throw new NotFoundException('Mercado não encontrado');
    // Checar o tenant aqui e não confiar no id do body: vínculo é o que decide quem
    // recebe lead, então id de outro tenant não pode passar (ADR 005).
    if (!seller) throw new NotFoundException('Vendedor não encontrado');

    await this.prisma.sellerMarket.upsert({
      where: { sellerId_productCode: { sellerId, productCode: code } },
      create: { tenantId, sellerId, productCode: code, role },
      update: { role },
    });
    this.logger.log(`vendedor ${sellerId} vinculado ao mercado ${code} (${role})`);
    return this.vendedoresDoMercado(tenantId, code);
  }

  /// Desvincula. Não mexe em lead já atribuído — tirar o vínculo diz "não recebe mais",
  /// não "perde o que está na mão", senão o negócio em andamento fica órfão.
  async desvincularVendedor(tenantId: string, code: string, sellerId: string) {
    await this.prisma.sellerMarket.deleteMany({
      where: { tenantId, productCode: code, sellerId },
    });
    this.logger.log(`vendedor ${sellerId} desvinculado do mercado ${code}`);
    return this.vendedoresDoMercado(tenantId, code);
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
