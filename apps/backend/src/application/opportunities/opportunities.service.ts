import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { Paginated, PaginationQueryDto } from '@/shared/dto/pagination.dto';

export const OPP_STAGES = ['new', 'qualified', 'proposal', 'won', 'lost'] as const;

@Injectable()
export class OpportunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, q: PaginationQueryDto, stage?: string): Promise<Paginated<any>> {
    const where: any = { tenantId };
    if (stage) where.stage = stage;
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { company: { contains: q.search, mode: 'insensitive' } },
        { phone: { contains: q.search } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.opportunity.findMany({ where, take: q.limit, skip: q.offset, orderBy: { updatedAt: 'desc' } }),
      this.prisma.opportunity.count({ where }),
    ]);
    return { items, total };
  }

  // Resumo do funil: contagem e valor por estagio (para o dashboard).
  async summary(tenantId: string) {
    const rows = await this.prisma.opportunity.groupBy({
      by: ['stage'],
      where: { tenantId },
      _count: true,
      _sum: { value: true },
    });
    return rows.map((r) => ({ stage: r.stage, count: r._count as number, value: Number(r._sum.value ?? 0) }));
  }

  async findOne(tenantId: string, id: string) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id, tenantId },
      include: { stageHistory: { orderBy: { changedAt: 'desc' } } },
    });
    if (!opp) throw new NotFoundException('Oportunidade nao encontrada');
    return opp;
  }

  async create(tenantId: string, dto: Record<string, any>) {
    return this.prisma.opportunity.create({ data: { tenantId, ...dto, stage: dto.stage ?? 'new' } });
  }

  async update(tenantId: string, id: string, dto: Record<string, any>) {
    await this.findOne(tenantId, id);
    // mudanca de estagio so pelo endpoint /stage (gera historico) — aqui e ignorada
    const { stage, ...rest } = dto;
    return this.prisma.opportunity.update({ where: { id }, data: rest });
  }

  // Move o estagio e registra o historico (de -> para).
  async moveStage(tenantId: string, id: string, toStage: string, reason?: string) {
    if (!OPP_STAGES.includes(toStage as any)) {
      throw new BadRequestException(`Estagio invalido. Use: ${OPP_STAGES.join(', ')}`);
    }
    const opp = await this.findOne(tenantId, id);
    if (opp.stage === toStage) return opp;
    const [updated] = await this.prisma.$transaction([
      this.prisma.opportunity.update({ where: { id }, data: { stage: toStage } }),
      this.prisma.opportunityStageHistory.create({
        data: { opportunityId: id, fromStage: opp.stage, toStage, reason },
      }),
    ]);
    return updated;
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.opportunity.delete({ where: { id } });
    return { ok: true };
  }

  // Auto-criacao no lead quente (score >= 70) — idempotente por conversationId (nao duplica).
  async createFromLead(
    tenantId: string,
    input: { conversationId?: string; contactId?: string; phone?: string; name?: string; interestScore?: number; intent?: string; summary?: string; assignedTo?: string },
  ) {
    if (input.conversationId) {
      const existing = await this.prisma.opportunity.findFirst({
        where: { tenantId, conversationId: input.conversationId },
      });
      if (existing) return existing;
    }
    return this.prisma.opportunity.create({ data: { tenantId, stage: 'new', ...input } });
  }
}
