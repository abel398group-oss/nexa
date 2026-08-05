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

  // America/Sao_Paulo nao observa horario de verao desde 2019 — deslocamento
  // fixo. Usado pra alinhar os buckets semanais ao calendario do Brasil sem
  // depender do TZ do processo/servidor (que pode estar em UTC em producao).
  private static readonly BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

  // Segunda-feira (00:00 BRT) da semana que contem `d`, calculada só com
  // metodos UTC + deslocamento fixo — nao usa Date local (setHours/getDay),
  // que herdaria o fuso do servidor e deslocaria os buckets em producao.
  private mondayBRT(d: Date): Date {
    const shifted = new Date(d.getTime() - OpportunitiesService.BRT_OFFSET_MS);
    shifted.setUTCHours(0, 0, 0, 0);
    shifted.setUTCDate(shifted.getUTCDate() - ((shifted.getUTCDay() + 6) % 7));
    return new Date(shifted.getTime() + OpportunitiesService.BRT_OFFSET_MS);
  }

  /**
   * F6+: evolucao semanal — recebidos (createdAt) × fechados (stageHistory
   * toStage='won') por semana, ultimas `weeks` semanas (max 26). Alimenta o
   * grafico do painel do vendedor; sem escopo vira a visao do gestor.
   */
  async evolution(tenantId: string, weeks = 8, sellerScope?: string) {
    const w = Math.max(1, Math.min(26, Math.round(weeks)));
    const since = this.mondayBRT(new Date(Date.now() - w * 7 * 24 * 60 * 60 * 1000));

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

    const buckets = new Map<string, { weekStart: string; received: number; won: number }>();
    for (let i = w - 1; i >= 0; i--) {
      const ref = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
      const key = this.mondayBRT(ref).toISOString().slice(0, 10);
      buckets.set(key, { weekStart: key, received: 0, won: 0 });
    }
    for (const o of created) {
      const b = buckets.get(this.mondayBRT(o.createdAt).toISOString().slice(0, 10));
      if (b) b.received++;
    }
    for (const h of wonHistory) {
      const b = buckets.get(this.mondayBRT(h.changedAt).toISOString().slice(0, 10));
      if (b) b.won++;
    }
    return [...buckets.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }

  // F7 (RevOps): estagios em que o lead ainda esta "vivo" e precisa de acao do
  // vendedor. paused fica de FORA de proposito — pausado e uma decisao dele de
  // nao mexer agora; se voltasse pra fila, a pausa nao serviria pra nada.
  private static readonly QUEUE_STAGES = ['new', 'qualified', 'proposal'];

  /**
   * Fila de trabalho do vendedor: os leads dele que ainda esperam acao, na
   * ordem em que valem ser atacados.
   *
   * Existe porque o vendedor tinha que cruzar duas telas (Inbox pra ler a
   * conversa, Oportunidades pra mover o estagio) e decidir sozinho por quem
   * comecar. Aqui a ordem ja vem pronta e o contexto vem junto.
   *
   * Prioridade (aplicada em memoria — sao no maximo `take` linhas, e SQL com
   * CASE aqui ficaria pior de ler que o ganho):
   *   1. pediu reuniao (`intent = meeting_request`) — e o sinal mais forte
   *   2. score maior primeiro
   *   3. quem esta esperando ha mais tempo
   */
  async queue(tenantId: string, sellerScope?: string, take = 30) {
    const opps = await this.prisma.opportunity.findMany({
      where: this.scoped({ tenantId, stage: { in: OpportunitiesService.QUEUE_STAGES } }, sellerScope),
      take,
      orderBy: { updatedAt: 'asc' },
    });
    if (opps.length === 0) return [];

    // Ultima mensagem de cada conversa, pra o vendedor ver do que se trata sem
    // abrir o Inbox. Uma query so para todas as conversas (evita N+1).
    const convIds = opps.map((o: any) => o.conversationId).filter(Boolean) as string[];
    const msgs = convIds.length
      ? await this.prisma.aiMessage.findMany({
          where: { conversationId: { in: convIds } },
          select: { conversationId: true, direction: true, content: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const ultimaPorConversa = new Map<string, any>();
    for (const m of msgs) {
      // como veio ordenado desc, a PRIMEIRA de cada conversa ja e a mais recente
      if (!ultimaPorConversa.has(m.conversationId)) ultimaPorConversa.set(m.conversationId, m);
    }

    const enriched = opps.map((o: any) => {
      const last = o.conversationId ? ultimaPorConversa.get(o.conversationId) : null;
      return {
        ...o,
        lastMessage: last ? { direction: last.direction, content: last.content, at: last.createdAt } : null,
        // Espera contada da ultima mexida no lead — e o que o vendedor sente
        // como "esse ta parado ha tempo demais".
        waitingSince: o.updatedAt,
        pediuReuniao: o.intent === 'meeting_request',
      };
    });

    return enriched.sort((a, b) => {
      if (a.pediuReuniao !== b.pediuReuniao) return a.pediuReuniao ? -1 : 1;
      if (b.interestScore !== a.interestScore) return b.interestScore - a.interestScore;
      return new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime();
    });
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
    // Sem isto, discardReason ficava null em quem descarta sem informar motivo — e o
    // painel de motivo de perda (sellerOverview) perdia justamente os casos que mais
    // precisa explicar. Achado da revisão externa (Gemini, 2026-08-05), confirmado no código.
    if (toStage === 'discarded' && (!opts.discardReason || !DISCARD_REASONS.includes(opts.discardReason as any))) {
      throw new BadRequestException(`Motivo obrigatorio ao descartar. Use: ${DISCARD_REASONS.join(', ')}`);
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

  // F7 (RevOps): registra QUANDO o lead consentiu compartilhar o dado com um
  // parceiro externo (LGPD) — presença do timestamp é a prova, não um booleano.
  // Idempotente: consentimento já dado não é sobrescrito por uma segunda chamada.
  async recordPartnerConsent(tenantId: string, id: string, sellerScope?: string) {
    const opp = await this.findOne(tenantId, id, sellerScope);
    if ((opp as any).partnerConsentAt) return opp;
    return this.prisma.opportunity.update({
      where: { id },
      data: { partnerConsentAt: new Date() } as any,
    });
  }

  // F7 (RevOps): compartilha o lead com um parceiro externo (ex.: fornecedor
  // de pneus). Partner NUNCA é um segundo tenant — é uma empresa de fora do
  // Nexa. Bloqueia sem consentimento prévio (LGPD) e sem parceiro ativo do
  // MESMO tenant — nunca aceita partnerId de outro tenant.
  async shareWithPartner(tenantId: string, id: string, partnerId: string, sellerScope?: string) {
    const opp = await this.findOne(tenantId, id, sellerScope);
    if (!(opp as any).partnerConsentAt) {
      throw new BadRequestException(
        'Lead ainda não consentiu o compartilhamento com parceiro (LGPD) — registre o consentimento antes.',
      );
    }
    const partner = await (this.prisma as any).partner.findFirst({ where: { id: partnerId, tenantId, active: true } });
    if (!partner) throw new BadRequestException('Parceiro inválido ou inativo.');
    return this.prisma.opportunity.update({
      where: { id },
      data: {
        sharedWithPartnerId: partnerId,
        partnerShareStatus: 'shared',
        partnerSharedAt: new Date(),
      } as any,
    });
  }

  async remove(tenantId: string, id: string, sellerScope?: string) {
    await this.findOne(tenantId, id, sellerScope);
    await this.prisma.opportunity.delete({ where: { id } });
    return { ok: true };
  }

  // Auto-criacao no lead quente (score >= 70) — idempotente por conversationId (nao duplica).
  // F6+: aceita assignedSellerId (dono real, vindo do handoff). Se a oportunidade
  // ja existe sem dono e o handoff trouxe um, adota (lead re-engajou pos-handoff).
  //
  // Sem conversationId (chamador futuro que nao passe o campo), cai pra um
  // fallback por contactId — so contra oportunidades ainda abertas, pra nao
  // duplicar o lead nem "reviver" um won/lost/discarded antigo do mesmo contato.
  async createFromLead(
    tenantId: string,
    input: { conversationId?: string; contactId?: string; phone?: string; name?: string; interestScore?: number; intent?: string; summary?: string; assignedTo?: string; assignedSellerId?: string },
  ) {
    const dedupeWhere = input.conversationId
      ? { tenantId, conversationId: input.conversationId }
      : input.contactId
        ? { tenantId, contactId: input.contactId, stage: { notIn: ['won', 'lost', 'discarded'] } }
        : null;

    if (dedupeWhere) {
      const existing = await this.prisma.opportunity.findFirst({ where: dedupeWhere as any });
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
