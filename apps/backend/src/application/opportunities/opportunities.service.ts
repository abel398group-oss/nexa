import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { Paginated, PaginationQueryDto } from '@/shared/dto/pagination.dto';

// F6+ seller-leads (2026-07-20): + paused (com pausedUntil) e discarded (com
// discardReason) — stage e TEXT no banco, sem migration de enum.
export const OPP_STAGES = ['new', 'qualified', 'proposal', 'paused', 'won', 'lost', 'discarded'] as const;
export const DISCARD_REASONS = ['sem_fit', 'sem_resposta', 'concorrente', 'outro'] as const;

/**
 * sellerScope (F6+): quando presente, TODA query filtra assignedSellerId=scope.
 * O controller deriva do JWT (role=vendedor → user.sellerId). Vendedor sem
 * sellerId vira scope '__none__' — nao casa com nada, nunca vaza.
 */
@Injectable()
export class OpportunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private scoped(where: any, sellerScope?: string): any {
    return sellerScope
      ? { ...where, assignedSellerId: sellerScope === '__none__' ? '__never__' : sellerScope }
      : where;
  }

  async findAll(tenantId: string, q: PaginationQueryDto, stage?: string, sellerScope?: string): Promise<Paginated<any>> {
    const where: any = this.scoped({ tenantId }, sellerScope);
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
  async summary(tenantId: string, sellerScope?: string) {
    const rows = await this.prisma.opportunity.groupBy({
      by: ['stage'],
      where: this.scoped({ tenantId }, sellerScope),
      _count: true,
      _sum: { value: true },
    });
    return rows.map((r: any) => ({ stage: r.stage, count: r._count as number, value: Number(r._sum.value ?? 0) }));
  }

  /**
   * F6+: evolucao semanal — recebidos (createdAt) × fechados (stageHistory
   * toStage='won') por semana, ultimas `weeks` semanas (max 26). Alimenta o
   * grafico do painel do vendedor; sem escopo vira a visao do gestor.
   */
  async evolution(tenantId: string, weeks = 8, sellerScope?: string) {
    const w = Math.max(1, Math.min(26, Math.round(weeks)));
    const since = new Date();
    since.setDate(since.getDate() - w * 7);
    since.setHours(0, 0, 0, 0);

    const where = this.scoped({ tenantId }, sellerScope);
    const [created, wonHistory] = await Promise.all([
      this.prisma.opportunity.findMany({
        where: { ...where, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.opportunityStageHistory.findMany({
        where: { toStage: 'won', changedAt: { gte: since }, opportunity: where },
        select: { changedAt: true },
      }),
    ]);

    // Buckets semanais alinhados em segunda-feira (fuso do servidor).
    const monday = (d: Date) => {
      const out = new Date(d);
      out.setHours(0, 0, 0, 0);
      out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
      return out;
    };
    const buckets = new Map<string, { weekStart: string; received: number; won: number }>();
    for (let i = w - 1; i >= 0; i--) {
      const ref = new Date();
      ref.setDate(ref.getDate() - i * 7);
      const key = monday(ref).toISOString().slice(0, 10);
      buckets.set(key, { weekStart: key, received: 0, won: 0 });
    }
    for (const o of created) {
      const b = buckets.get(monday(o.createdAt).toISOString().slice(0, 10));
      if (b) b.received++;
    }
    for (const h of wonHistory) {
      const b = buckets.get(monday(h.changedAt).toISOString().slice(0, 10));
      if (b) b.won++;
    }
    return [...buckets.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }

  async findOne(tenantId: string, id: string, sellerScope?: string) {
    const opp = await this.prisma.opportunity.findFirst({
      where: this.scoped({ id, tenantId }, sellerScope),
      include: { stageHistory: { orderBy: { changedAt: 'desc' } } },
    });
    if (!opp) throw new NotFoundException('Oportunidade nao encontrada');
    return opp;
  }

  async create(tenantId: string, dto: Record<string, any>) {
    return this.prisma.opportunity.create({ data: { tenantId, ...dto, stage: dto.stage ?? 'new' } });
  }

  async update(tenantId: string, id: string, dto: Record<string, any>, sellerScope?: string) {
    await this.findOne(tenantId, id, sellerScope);
    // mudanca de estagio so pelo endpoint /stage (gera historico) — aqui e ignorada
    const { stage, ...rest } = dto;
    return this.prisma.opportunity.update({ where: { id }, data: rest });
  }

  // Move o estagio e registra o historico (de -> para).
  // F6+: paused aceita pausedUntil; discarded aceita discardReason. Ao mudar de
  // estagio os campos do estagio anterior sao limpos (nunca ficam orfaos).
  async moveStage(
    tenantId: string,
    id: string,
    toStage: string,
    reason?: string,
    opts: { pausedUntil?: Date | string | null; discardReason?: string | null } = {},
    sellerScope?: string,
  ) {
    if (!OPP_STAGES.includes(toStage as any)) {
      throw new BadRequestException(`Estagio invalido. Use: ${OPP_STAGES.join(', ')}`);
    }
    if (toStage === 'discarded' && opts.discardReason && !DISCARD_REASONS.includes(opts.discardReason as any)) {
      throw new BadRequestException(`Motivo invalido. Use: ${DISCARD_REASONS.join(', ')}`);
    }
    const opp = await this.findOne(tenantId, id, sellerScope);
    if (opp.stage === toStage) return opp;

    // `as any` de proposito: pausedUntil/discardReason/assignedSellerId so existem
    // no client Prisma REGENERADO — o cast mantem o build verde antes e depois do
    // `prisma generate` (mesmo padrao do humanTakeoverAt no ConversationAgent).
    const extra: Record<string, any> = {
      pausedUntil: toStage === 'paused' ? (opts.pausedUntil ? new Date(opts.pausedUntil) : null) : null,
      discardReason: toStage === 'discarded' ? (opts.discardReason ?? null) : null,
    };
    const [updated] = await this.prisma.$transaction([
      this.prisma.opportunity.update({ where: { id }, data: { stage: toStage, ...extra } as any }),
      this.prisma.opportunityStageHistory.create({
        data: { opportunityId: id, fromStage: opp.stage, toStage, reason: reason ?? opts.discardReason ?? undefined },
      }),
    ]);
    return updated;
  }

  async remove(tenantId: string, id: string, sellerScope?: string) {
    await this.findOne(tenantId, id, sellerScope);
    await this.prisma.opportunity.delete({ where: { id } });
    return { ok: true };
  }

  // Auto-criacao no lead quente (score >= 70) — idempotente por conversationId (nao duplica).
  // F6+: aceita assignedSellerId (dono real, vindo do handoff). Se a oportunidade
  // ja existe sem dono e o handoff trouxe um, adota (lead re-engajou pos-handoff).
  async createFromLead(
    tenantId: string,
    input: { conversationId?: string; contactId?: string; phone?: string; name?: string; interestScore?: number; intent?: string; summary?: string; assignedTo?: string; assignedSellerId?: string },
  ) {
    if (input.conversationId) {
      const existing = await this.prisma.opportunity.findFirst({
        where: { tenantId, conversationId: input.conversationId },
      });
      if (existing) {
        // cast: campo novo pre-`prisma generate` (ver comentario no moveStage)
        if (!(existing as any).assignedSellerId && input.assignedSellerId) {
          return this.prisma.opportunity.update({
            where: { id: existing.id },
            data: { assignedSellerId: input.assignedSellerId, assignedTo: input.assignedTo ?? existing.assignedTo } as any,
          });
        }
        return existing;
      }
    }
    return this.prisma.opportunity.create({ data: { tenantId, stage: 'new', ...input } as any });
  }
}
