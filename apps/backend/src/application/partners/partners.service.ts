import { Injectable, NotFoundException } from '@nestjs/common';
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
    return (this.prisma as any).partner.update({ where: { id }, data: { active } });
  }
}
