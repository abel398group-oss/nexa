import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

/**
 * F7 (2026-08-05, expansão RevOps): CRUD de empresa parceira EXTERNA (ex.:
 * fornecedor de pneus). Partner NUNCA é um Tenant — não ganha acesso ao Nexa,
 * só recebe indicação de lead compartilhado (com consentimento, ver
 * OpportunitiesService.recordPartnerConsent/shareWithPartner).
 */
@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  // `as any`: partner só existe no client Prisma REGENERADO — mesmo padrão de
  // seller-activity.service.ts pros modelos F7.
  list(tenantId: string, search?: string) {
    const where: any = { tenantId };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    return (this.prisma as any).partner.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findOne(tenantId: string, id: string) {
    const p = await (this.prisma as any).partner.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Parceiro não encontrado');
    return p;
  }

  create(tenantId: string, dto: { name: string; type: string; contactEmail?: string; contactPhone?: string }) {
    return (this.prisma as any).partner.create({ data: { tenantId, ...dto } });
  }

  async update(tenantId: string, id: string, dto: Record<string, any>) {
    await this.findOne(tenantId, id);
    return (this.prisma as any).partner.update({ where: { id }, data: dto });
  }

  async setActive(tenantId: string, id: string, active: boolean) {
    await this.findOne(tenantId, id);
    const partner = await (this.prisma as any).partner.update({ where: { id }, data: { active } });

    // Desativar o parceiro NÃO suspende os mercados dele — suspender é decisão de
    // operação, não efeito colateral de um toggle. Mas quem clicou precisa saber
    // que as campanhas desses mercados continuam disparando com a marca dele:
    // devolve a contagem para a tela avisar.
    if (!active) {
      const activeMarkets = await (this.prisma as any).product.count({
        where: { partnerId: id, status: 'active' },
      });
      return { ...partner, activeMarkets };
    }
    return partner;
  }

  /**
   * Exclui o parceiro — mas só enquanto ele não carrega histórico.
   *
   * A rota não existia (13/08/2026): dava para cadastrar errado e nunca limpar,
   * só desativar. Cadastro de teste e nome digitado errado ficavam na lista para
   * sempre.
   *
   * A recusa importa mais que a exclusão. `Opportunity.sharedWithPartnerId` é
   * `onDelete: SetNull`, então apagar FUNCIONARIA — e apagaria em silêncio de
   * QUEM o lead foi compartilhado, deixando `partnerSharedAt` e
   * `partnerShareStatus` apontando para ninguém. Esse é o rastro de consentimento
   * de LGPD (ver OpportunitiesService.shareWithPartner): a oportunidade
   * continuaria dizendo "compartilhado em tal data", sem dizer com quem.
   *
   * Por isso: com indicação no histórico → 409 e a orientação de desativar, que
   * é o que preserva o registro. Sem indicação nenhuma → apaga de verdade.
   */
  async remove(tenantId: string, id: string) {
    const parceiro = await this.findOne(tenantId, id);

    // Mesma lógica do bloqueio por indicação: a FK é SetNull, então apagar
    // FUNCIONARIA — e o mercado viraria "da casa" em silêncio, perdendo de quem
    // é. Quem quer apagar o parceiro desvincula o mercado antes, de propósito.
    const mercados = await (this.prisma as any).product.count({ where: { partnerId: id } });
    if (mercados > 0) {
      throw new ConflictException(
        `"${parceiro.name}" é dono de ${mercados} mercado(s). ` +
          'Desvincule o parceiro na tela de Mercados antes de excluí-lo — ou apenas desative-o.',
      );
    }

    const indicacoes = await (this.prisma as any).opportunity.count({
      where: { tenantId, sharedWithPartnerId: id },
    });

    if (indicacoes > 0) {
      throw new ConflictException(
        `"${parceiro.name}" já recebeu ${indicacoes} indicação(ões) de lead. ` +
          'Excluir apagaria do histórico com quem cada lead foi compartilhado. ' +
          'Desative o parceiro — ele para de aparecer para indicação e o registro fica de pé.',
      );
    }

    await (this.prisma as any).partner.delete({ where: { id } });
    return { id, deleted: true };
  }
}
