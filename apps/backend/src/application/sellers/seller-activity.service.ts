import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { Paginated, PaginationQueryDto } from '@/shared/dto/pagination.dto';

// F7 (2026-08-05, expansão RevOps): tipo de atividade registrada manualmente
// pelo vendedor humano — ligação, e-mail ou nota livre.
export const ACTIVITY_TYPES = ['call', 'email', 'note'] as const;

/**
 * sellerScope: quando presente, toda query filtra sellerId=scope — mesmo
 * padrão de OpportunitiesService. Vendedor sem sellerId vira '__none__', que
 * não bate com nada (nunca vaza atividade de outro vendedor).
 */
@Injectable()
export class SellerActivityService {
  constructor(private readonly prisma: PrismaService) {}

  private scoped(where: any, sellerScope?: string): any {
    return sellerScope
      ? { ...where, sellerId: sellerScope === '__none__' ? '__never__' : sellerScope }
      : where;
  }

  // `as any`: sellerActivity só existe no client Prisma REGENERADO — o cast
  // mantém o build verde antes e depois do `prisma generate` (mesmo padrão
  // usado em opportunities.service.ts pros campos F6+).
  async create(
    tenantId: string,
    dto: {
      sellerId: string;
      opportunityId?: string;
      type: string;
      result?: string;
      durationSec?: number;
      notes?: string;
    },
  ) {
    if (!ACTIVITY_TYPES.includes(dto.type as any)) {
      throw new BadRequestException(`Tipo inválido. Use: ${ACTIVITY_TYPES.join(', ')}`);
    }
    return (this.prisma as any).sellerActivity.create({ data: { tenantId, ...dto } });
  }

  async findAll(
    tenantId: string,
    q: PaginationQueryDto,
    opportunityId?: string,
    sellerScope?: string,
  ): Promise<Paginated<any>> {
    const where = this.scoped({ tenantId }, sellerScope);
    if (opportunityId) where.opportunityId = opportunityId;
    const [items, total] = await Promise.all([
      (this.prisma as any).sellerActivity.findMany({
        where,
        take: q.limit,
        skip: q.offset,
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).sellerActivity.count({ where }),
    ]);
    return { items, total };
  }

  // Resumo por vendedor (para o painel de KPI): quantidade de ligações,
  // e-mails e notas no período — a peça que faltava pra sellersKpi() deixar
  // de ler só dado derivado da IA.
  async summary(tenantId: string, sellerScope?: string) {
    const rows = await (this.prisma as any).sellerActivity.groupBy({
      by: ['sellerId', 'type'],
      where: this.scoped({ tenantId }, sellerScope),
      _count: true,
    });
    const bySeller = new Map<string, { sellerId: string; calls: number; emails: number; notes: number }>();
    for (const r of rows) {
      const entry = bySeller.get(r.sellerId) ?? { sellerId: r.sellerId, calls: 0, emails: 0, notes: 0 };
      if (r.type === 'call') entry.calls = r._count as number;
      else if (r.type === 'email') entry.emails = r._count as number;
      else if (r.type === 'note') entry.notes = r._count as number;
      bySeller.set(r.sellerId, entry);
    }
    return [...bySeller.values()];
  }
}
