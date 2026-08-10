import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PaginationQueryDto, Paginated } from '@/shared/dto/pagination.dto';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { AuditService } from '@/shared/audit/audit.service';
import { trackWhere } from './conversation-track';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger('Conversations');

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly waha: WahaClientService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Etapa 2B (item 2.2): quais conversas são "ticket de SUPORTE".
   *
   * O critério mora em `conversation-track.ts` — precisava existir também como
   * predicado (não só como filtro Prisma) para o ConversationAgent decidir a
   * trilha de uma conversa em memória, e manter duas definições do mesmo conceito
   * era garantia de divergirem.
   */
  private scopeFilter(scope?: 'support' | 'sales') {
    return scope ? trackWhere(scope) : null;
  }

  /**
   * Busca por telefone, nome ou empresa do contato. Contact não tem relation
   * Prisma com AiConversation (só `contactId` solto), então resolve em duas
   * etapas: acha os contatos que casam e filtra as conversas pelos telefones
   * deles. Antes a busca só olhava telefone — procurar pelo nome do cliente,
   * que é o reflexo natural de quem atende, não achava nada.
   */
  private async searchFilter(tenantId: string, term?: string) {
    const t = term?.trim();
    if (!t) return null;
    const contatos = await this.prisma.contact.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: t, mode: 'insensitive' } },
          { company: { contains: t, mode: 'insensitive' } },
        ],
      },
      select: { phone: true },
      take: 500,
    });
    const phones = contatos.map((c) => c.phone);
    return {
      OR: [
        { phone: { contains: t } },
        ...(phones.length ? [{ phone: { in: phones } }] : []),
      ],
    };
  }

  // Inbox: lista conversas do tenant
  // F12: assignedAnalystId !== undefined filtra por dono do chamado —
  // string = só daquele analista, null = só fila sem dono (não confundir
  // com "omitido" = sem filtro, todo mundo vê tudo).
  async findAll(
    tenantId: string,
    q: PaginationQueryDto,
    sellerId?: string,
    assignedAnalystId?: string | null,
    opts: {
      scope?: 'support' | 'sales';
      status?: string;
      /** waiting_internal via ?queue= — atalho pro card "Aguardando Dev". */
      onlyWaitingInternal?: boolean;
      /** Filtro de vendedor pedido pelo USUÁRIO (≠ sellerId, que é escopo de segurança). */
      filterSellerId?: string;
    } = {},
  ): Promise<Paginated<any> & { statusCounts: Record<string, number> }> {
    // Exclui conversas arquivadas da listagem padrão.
    // OR necessário: `outcome != 'archived'` em SQL exclui rows com NULL (three-valued logic).
    // AND explícito: são vários grupos OR independentes (arquivada, escopo,
    // busca) — deixá-los soltos no mesmo objeto faria um sobrescrever o outro.
    const and: any[] = [{ OR: [{ outcome: null }, { outcome: { not: 'archived' } }] }];

    const scope = this.scopeFilter(opts.scope);
    if (scope) and.push(scope);

    const search = await this.searchFilter(tenantId, q.search);
    if (search) and.push(search);

    const where: any = { tenantId, AND: and };

    // Escopo de segurança vem primeiro e não é negociável: um vendedor não
    // escapa da própria carteira nem mandando ?sellerId= de outro.
    if (sellerId) where.assignedSellerId = sellerId;
    else if (opts.filterSellerId) {
      where.assignedSellerId = opts.filterSellerId === '__none__' ? null : opts.filterSellerId;
    }

    if (assignedAnalystId !== undefined) where.assignedAnalystId = assignedAnalystId;

    // Contagem por status para os chips de filtro: precisa ignorar o próprio
    // filtro de status, senão o chip selecionado mostraria o total e todos os
    // outros zero. Com a filtragem no cliente isso saía de graça; no servidor
    // é uma query à parte.
    const whereSemStatus = { ...where };

    if (opts.onlyWaitingInternal) where.status = 'waiting_internal' as any;
    else if (opts.status) where.status = opts.status as any;

    const [items, total, porStatus] = await Promise.all([
      this.prisma.aiConversation.findMany({
        where,
        take: q.limit,
        skip: q.offset,
        // Ordena por ATIVIDADE, não por criação. Com `startedAt` um chamado
        // antigo que o cliente acabou de reabrir ficava lá atrás e podia nem
        // entrar na página — sumia da fila sem ninguém perceber.
        // nulls:'last' é essencial: em DESC o Postgres joga NULL pro topo, e
        // conversa que nunca teve atividade encabeçaria a lista.
        orderBy: [
          { lastActivityAt: { sort: 'desc', nulls: 'last' } },
          { startedAt: 'desc' },
        ],
        include: {
          assignedSeller: { select: { name: true } },
          assignedAnalyst: { select: { id: true, name: true } },
        },
      }).then(async (convs: any[]) => {
        // Enriquece com dados do contato (nome, tags) via phone+tenantId
        if (!convs.length) return convs;
        const phones = [...new Set(convs.map((c: any) => c.phone))];
        const contacts = await this.prisma.contact.findMany({
          where: { tenantId, phone: { in: phones } },
          select: { id: true, phone: true, name: true, nameSource: true, company: true, tags: true, accountOwner: true },
        });
        const contactMap = new Map(contacts.map((c: any) => [c.phone, c]));

        // Atribuição de campanha: busca a mensagem de campanha mais recente por conversa via ORM
        // (substituiu $queryRaw com ANY(::uuid[]) que quebrava no driver do PostgreSQL)
        const convIds = convs.map((c: any) => c.id);
        const campMsgs = await this.prisma.aiMessage.findMany({
          where: { conversationId: { in: convIds }, direction: 'outbound', intent: 'outbound_campaign' },
          orderBy: { createdAt: 'desc' },
          select: { conversationId: true, metadata: true },
        });
        // DISTINCT ON em JS: primeira ocorrência (mais recente) por conversa
        const convToCampId = new Map<string, string>();
        for (const msg of campMsgs) {
          if (!convToCampId.has(msg.conversationId)) {
            const cid = (msg.metadata as any)?.campaignId as string | undefined;
            if (cid) convToCampId.set(msg.conversationId, cid);
          }
        }
        const campaignIds = [...new Set(convToCampId.values())];
        const campaigns = campaignIds.length
          ? await this.prisma.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, name: true } })
          : [];
        const campaignById = new Map(campaigns.map((c) => [c.id, c.name]));
        const campByConv = new Map(
          [...convToCampId.entries()].map(([convId, campId]) => [
            convId,
            { id: campId, name: campaignById.get(campId) ?? '—' },
          ]),
        );

        return convs.map((c: any) => ({
          ...c,
          contact: contactMap.get(c.phone) ?? null,
          campaign: campByConv.get(c.id) ?? null,
        }));
      }),
      this.prisma.aiConversation.count({ where }),
      this.prisma.aiConversation.groupBy({
        by: ['status'],
        where: whereSemStatus,
        _count: { _all: true },
      }),
    ]);

    const statusCounts = Object.fromEntries(
      porStatus.map((g: any) => [g.status, g._count._all as number]),
    ) as Record<string, number>;

    return { items, total, statusCounts };
  }

  /**
   * Etapa 2B: contagens do painel operacional do Inbox de Suporte.
   *
   * Existe porque os 3 cards eram calculados no cliente sobre as conversas já
   * carregadas — ou seja, sobre uma página. Com a lista paginada isso vira
   * número errado com cara de número certo, que é pior que não mostrar nada.
   * Aqui a contagem é do banco inteiro, independente de página ou filtro.
   *
   * Mesma base do dashboard antigo: só ticket de suporte, e chamado encerrado
   * (closed/opt_out) não conta como fila.
   */
  async supportStats(tenantId: string, userId?: string) {
    const base: any = {
      tenantId,
      AND: [
        { OR: [{ outcome: null }, { outcome: { not: 'archived' } }] },
        trackWhere('support'),
      ],
      status: { notIn: ['closed', 'opt_out'] as any },
    };

    const [escaladosSemDono, emAtendimento, aguardandoDev, semDono, meus, maisAntigosSemDono] =
      await Promise.all([
        this.prisma.aiConversation.count({
          where: { ...base, status: 'escalated' as any, assignedAnalystId: null },
        }),
        this.prisma.aiConversation.count({ where: { ...base, assignedAnalystId: { not: null } } }),
        this.prisma.aiConversation.count({ where: { ...base, status: 'waiting_internal' as any } }),
        this.prisma.aiConversation.count({ where: { ...base, assignedAnalystId: null } }),
        userId
          ? this.prisma.aiConversation.count({ where: { ...base, assignedAnalystId: userId } })
          : Promise.resolve(0),
        // "Mais antigos sem dono" precisa de ordenação ASC — o oposto da lista.
        // Por isso não dá pra tirar da página carregada: são justamente os que
        // ficaram pra trás. nulls:'first' aqui porque sem atividade = mais antigo.
        this.prisma.aiConversation.findMany({
          where: { ...base, assignedAnalystId: null },
          orderBy: [{ lastActivityAt: { sort: 'asc', nulls: 'first' } }, { startedAt: 'asc' }],
          take: 8,
          select: {
            id: true,
            phone: true,
            status: true,
            ticketCategory: true,
            ticketPriority: true,
            lastActivityAt: true,
            startedAt: true,
          },
        }),
      ]);

    // Enriquece só os 8 da lista com o nome do contato (mesma via da listagem).
    const phones = [...new Set(maisAntigosSemDono.map((c) => c.phone))];
    const contatos = phones.length
      ? await this.prisma.contact.findMany({
          where: { tenantId, phone: { in: phones } },
          select: { id: true, phone: true, name: true, company: true },
        })
      : [];
    const porTelefone = new Map(contatos.map((c) => [c.phone, c]));

    return {
      escaladosSemDono,
      emAtendimento,
      aguardandoDev,
      semDono,
      meus,
      maisAntigosSemDono: maisAntigosSemDono.map((c) => ({
        ...c,
        contact: porTelefone.get(c.phone) ?? null,
      })),
    };
  }

  async findOne(tenantId: string, id: string) {
    const conv = await this.prisma.aiConversation.findFirst({ where: { id, tenantId } });
    if (!conv) throw new NotFoundException('Conversa não encontrada');
    return conv;
  }

  /**
   * Etapa 2A: findOne com o MESMO escopo de carteira que a listagem aplica.
   *
   * `findAll` já restringe o vendedor a `assignedSellerId = <dele>`, mas as
   * rotas de leitura por id (mensagens, timeline, detalhe) só validavam o
   * tenant — então saber o id era suficiente para um vendedor ler a conversa
   * de qualquer colega. Devolve 404 (e não 403) de propósito: para quem não
   * tem escopo, a conversa simplesmente não existe — não confirma o id.
   *
   * Continua existindo separado de `findOne` porque os chamadores INTERNOS
   * (addMessage, assignAnalyst, setLinkedIssue…) não devem herdar escopo de
   * vendedor: eles têm autorização própria e rodam também fora de request HTTP.
   */
  async findOneScoped(tenantId: string, id: string, sellerId?: string) {
    if (!sellerId) return this.findOne(tenantId, id);
    const conv = await this.prisma.aiConversation.findFirst({
      where: { id, tenantId, assignedSellerId: sellerId },
    });
    if (!conv) throw new NotFoundException('Conversa não encontrada');
    return conv;
  }

  // Fecha uma conversa com motivo (outcome). Grava histórico de stage.
  // Regras de fechamento:
  //   opt_out     → imediato (LGPD)
  //   won/lost    → imediato (venda concluída ou perdida)
  //   no_response → janitor após 7 dias (somente leads, não clientes ativos)
  async closeConversation(
    tenantId: string,
    id: string,
    outcome: 'won' | 'lost' | 'no_response' | 'opt_out',
    reason?: string,
  ) {
    const conv = await this.findOne(tenantId, id);
    const toStatus = outcome === 'opt_out' ? 'opt_out' : 'closed';
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.aiConversation.update({
        where: { id },
        // ADR 035: closing releases the human takeover — if the customer comes
        // back and the conversation reopens, Lia attends normally again.
        data: { status: toStatus as any, outcome, outcomeAt: now, endedAt: now, humanTakeoverAt: null } as any,
      }),
      // Ajuste 4: grava histórico de mudança de status/outcome
      this.prisma.conversationStageHistory.create({
        data: {
          conversationId: id,
          fromStatus: conv.status as string,
          toStatus,
          fromOutcome: conv.outcome ?? null,
          toOutcome: outcome,
          reason: reason ?? outcome,
          changedAt: now,
        },
      }),
    ]);

    return { id, status: toStatus, outcome };
  }

  /**
   * ADR 035 — "Devolver pra Lia": releases the human takeover. Clears
   * humanTakeoverAt and, if the conversation was escalated, returns it to
   * 'open' (with stage history). Lia resumes normal auto-attendance.
   */
  async returnToAi(tenantId: string, id: string) {
    const conv = await this.findOne(tenantId, id);
    const wasEscalated = (conv.status as string) === 'escalated';
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.aiConversation.update({
        where: { id },
        data: {
          humanTakeoverAt: null,
          ...(wasEscalated ? { status: 'open' as any } : {}),
        } as any,
      }),
      ...(wasEscalated
        ? [
            this.prisma.conversationStageHistory.create({
              data: {
                conversationId: id,
                fromStatus: 'escalated',
                toStatus: 'open',
                fromOutcome: conv.outcome ?? null,
                toOutcome: conv.outcome ?? null,
                reason: 'devolvido_para_lia',
                changedAt: now,
              },
            }),
          ]
        : []),
    ]);

    this.logger.log(`ADR 035: conversa ${id} devolvida pra Lia (escalated=${wasEscalated})`);
    this.events.emit('conversation.updated', { tenantId, conversationId: id });
    return { id, humanTakeoverAt: null, status: wasEscalated ? 'open' : conv.status };
  }

  // Atalho para quando o vendedor marca won/lost no Inbox — fecha junto
  async setOutcome(tenantId: string, id: string, outcome: 'won' | 'lost' | null) {
    const conv = await this.findOne(tenantId, id);
    if (outcome === 'won' || outcome === 'lost') {
      return this.closeConversation(tenantId, id, outcome, outcome);
    }
    // null = desfaz o outcome (reabre a conversa — Ajuste 2)
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.aiConversation.update({
        where: { id },
        data: { outcome: null, outcomeAt: null, status: 'open' as any, endedAt: null },
      }),
      this.prisma.conversationStageHistory.create({
        data: {
          conversationId: id,
          fromStatus: conv.status as string,
          toStatus: 'open',
          fromOutcome: conv.outcome ?? null,
          toOutcome: null,
          reason: 'reaberta_manual',
          changedAt: now,
        },
      }),
    ]);
    return { id, status: 'open', outcome: null };
  }

  // Reatribui a conversa a um vendedor (ou null pra desatribuir). Valida o seller do tenant.
  async assign(tenantId: string, id: string, sellerId: string | null) {
    await this.findOne(tenantId, id); // valida escopo do tenant
    if (sellerId) {
      const seller = await this.prisma.seller.findFirst({
        where: { id: sellerId, tenantId },
        select: { id: true },
      });
      if (!seller) throw new NotFoundException('Vendedor não encontrado');
    }
    const updated = await this.prisma.aiConversation.update({
      where: { id },
      data: { assignedSellerId: sellerId, assignedAt: sellerId ? new Date() : null },
      include: { assignedSeller: { select: { name: true } } },
    });
    return { id, assignedSellerId: updated.assignedSellerId, assignedSeller: updated.assignedSeller };
  }

  // F12: atribui/reatribui um chamado de SUPORTE a um analista humano (userId
  // null = devolve pra fila geral). Não confundir com assign() acima, que é
  // o vendedor do lado comercial.
  async assignAnalyst(
    tenantId: string,
    id: string,
    userId: string | null,
    opts: { expectedAnalystId?: string | null } = {},
  ) {
    await this.findOne(tenantId, id); // valida escopo do tenant
    if (userId) {
      // Aceita usuário do tenant OU admin da plataforma (tenantId null) — mesmo
      // universo de quem já pode operar o Inbox via EffectiveTenantInterceptor.
      const analyst = await this.prisma.user.findFirst({
        where: { id: userId, OR: [{ tenantId }, { tenantId: null }] },
        select: { id: true },
      });
      if (!analyst) throw new NotFoundException('Analista não encontrado');
    }

    // Item 1.4 (auditoria 2026-08-06): trava de concorrência no "Assumir".
    //
    // Antes isto era um update cego: dois analistas clicando no mesmo segundo
    // recebiam 200 os dois, os dois viam "Você está com este chamado", e o
    // último gravado vencia em silêncio — o primeiro só descobria ao recarregar.
    //
    // Com `expectedAnalystId` presente a gravação vira condicional: o updateMany
    // só casa a linha se o dono no banco ainda for o esperado (null = "estava na
    // fila geral"). Zero linhas casadas = alguém chegou antes → 409 com o nome
    // de quem ficou, em vez de sobrescrever.
    //
    // Sem `expectedAnalystId` (transferência deliberada pelo seletor, ou
    // devolver pra fila) o caminho segue o de sempre — quem transfere está
    // olhando pro dono atual na tela e quer mesmo trocar.
    if (opts.expectedAnalystId !== undefined) {
      const claimed = await this.prisma.aiConversation.updateMany({
        where: { id, tenantId, assignedAnalystId: opts.expectedAnalystId },
        data: { assignedAnalystId: userId, assignedAnalystAt: userId ? new Date() : null },
      });

      if (claimed.count === 0) {
        const current = await this.prisma.aiConversation.findFirst({
          where: { id, tenantId },
          select: { assignedAnalyst: { select: { id: true, name: true } } },
        });
        const owner = current?.assignedAnalyst?.name ?? 'outro analista';
        this.logger.warn(`assignAnalyst: corrida no chamado ${id} — já estava com ${owner}`);
        throw new ConflictException(`Chamado já assumido por ${owner}.`);
      }

      const fresh = await this.prisma.aiConversation.findFirst({
        where: { id },
        select: {
          assignedAnalystId: true,
          assignedAnalyst: { select: { id: true, name: true } },
        },
      });
      this.events.emit('conversation.updated', { tenantId, conversationId: id });
      return {
        id,
        assignedAnalystId: fresh?.assignedAnalystId ?? null,
        assignedAnalyst: fresh?.assignedAnalyst ?? null,
      };
    }

    const updated = await this.prisma.aiConversation.update({
      where: { id },
      data: { assignedAnalystId: userId, assignedAnalystAt: userId ? new Date() : null },
      include: { assignedAnalyst: { select: { id: true, name: true } } },
    });
    this.events.emit('conversation.updated', { tenantId, conversationId: id });
    return { id, assignedAnalystId: updated.assignedAnalystId, assignedAnalyst: updated.assignedAnalyst };
  }

  // F12: lista enxuta de analistas do tenant pro seletor de atribuição do Inbox.
  // Deliberadamente fora do UsersController (@RequirePerm('users'), admin-only
  // de gestão de conta) — qualquer operador autenticado do Inbox precisa poder
  // ver a quem atribuir um chamado, sem precisar de permissão de administrar usuários.
  //
  // Item 2.1 (auditoria 2026-08-06): inclui admin da plataforma (tenantId null).
  // O filtro era só `{ tenantId }`, mas assignAnalyst SEMPRE aceitou `tenantId:
  // null` — então um platform admin que assumia um chamado ficava fora da lista,
  // o <Select> do painel não achava opção com aquele value e o browser caía na
  // primeira ("Sem dono"). A tela passava a se contradizer: dizia "Você está com
  // este chamado" logo acima de um seletor marcado como sem dono. Os dois lados
  // agora usam exatamente o mesmo critério de elegibilidade.
  async listAnalysts(tenantId: string) {
    return this.prisma.user.findMany({
      where: { isActive: true, OR: [{ tenantId }, { tenantId: null }] },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  // F13: vincula (ou remove, url=null) o link de uma issue externa de dev
  // (Jira/GitHub/ClickUp/Trello) a este chamado. Sem integração ativa — é o
  // suporte colando o link manualmente depois de abrir a issue na ferramenta
  // do time de engenharia.
  //
  // Vincular uma issue É, por definição, "aguardando ação interna de
  // engenharia" — por isso também move o status pra waiting_internal, a
  // menos que o chamado já esteja fechado/opt-out (não ressuscita um chamado
  // encerrado só porque alguém colou um link nele depois). Remover o link
  // (url=null) NÃO reverte o status — fica a critério do analista usar os
  // controles normais de resolver/reabrir.
  async setLinkedIssue(tenantId: string, id: string, url: string | null) {
    const conv = await this.findOne(tenantId, id);
    if (url && !/^https?:\/\/\S+$/.test(url)) {
      throw new BadRequestException('Link da issue precisa ser uma URL http(s) válida');
    }

    const willMoveToWaitingInternal =
      !!url && !['closed', 'opt_out'].includes(conv.status as string) && conv.status !== 'waiting_internal';

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.aiConversation.update({
        where: { id },
        data: {
          linkedIssueUrl: url,
          ...(willMoveToWaitingInternal ? { status: 'waiting_internal' as any } : {}),
        },
      }),
      ...(willMoveToWaitingInternal
        ? [
            this.prisma.conversationStageHistory.create({
              data: {
                conversationId: id,
                fromStatus: conv.status as string,
                toStatus: 'waiting_internal',
                fromOutcome: conv.outcome ?? null,
                toOutcome: conv.outcome ?? null,
                reason: 'issue_dev_vinculada',
                changedAt: now,
              },
            }),
          ]
        : []),
    ]);

    this.events.emit('conversation.updated', { tenantId, conversationId: id });
    return {
      id,
      linkedIssueUrl: url,
      status: willMoveToWaitingInternal ? 'waiting_internal' : conv.status,
    };
  }

  // Suporte: marca o chamado como resolvido (fecha) ou reabre. Grava histórico.
  // C1: fechamento manual (resolved=true) gera csatToken — operador fecha no Inbox
  // e o cliente ainda precisa poder avaliar via WhatsApp ou portal.
  async setResolved(tenantId: string, id: string, resolved: boolean) {
    const conv = await this.findOne(tenantId, id);
    const now = new Date();
    const toStatus = resolved ? 'closed' : 'open';
    // C1: token gerado apenas no fechamento; reabertura não toca o token existente
    const csatToken = resolved ? randomBytes(24).toString('hex') : undefined;
    await this.prisma.$transaction([
      this.prisma.aiConversation.update({
        where: { id },
        data: resolved
          ? { status: 'closed' as any, outcome: 'resolved', outcomeAt: now, resolvedAt: now, endedAt: now, csatToken } as any
          : { status: 'open' as any, outcome: null, outcomeAt: null, resolvedAt: null, endedAt: null },
      }),
      this.prisma.conversationStageHistory.create({
        data: {
          conversationId: id,
          fromStatus: conv.status as string,
          toStatus,
          fromOutcome: conv.outcome ?? null,
          toOutcome: resolved ? 'resolved' : null,
          reason: resolved ? 'resolvido_manual' : 'reaberto_manual',
          changedAt: now,
        },
      }),
    ]);
    return { id, status: toStatus, outcome: resolved ? 'resolved' : null };
  }

  // Arquiva uma conversa (soft): outcome='archived', status='closed'. Sem migration.
  async archive(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    const now = new Date();
    await this.prisma.aiConversation.update({
      where: { id },
      data: { status: 'closed' as any, outcome: 'archived', outcomeAt: now, endedAt: now },
    });
    return { id, archived: true };
  }

  // Arquiva múltiplas conversas em lote (validando tenant em cada uma).
  async bulkArchive(tenantId: string, ids: string[]) {
    // valida: só opera em conversas do tenant
    const owned = await this.prisma.aiConversation.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true },
    });
    const validIds = owned.map((c) => c.id);
    if (!validIds.length) return { archived: 0 };
    const now = new Date();
    const result = await this.prisma.aiConversation.updateMany({
      where: { id: { in: validIds } },
      data: { status: 'closed' as any, outcome: 'archived', outcomeAt: now, endedAt: now },
    });
    return { archived: result.count };
  }

  // Exclui uma conversa permanentemente (cascade apaga mensagens via FK).
  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.aiConversation.delete({ where: { id } });
    return { id, deleted: true };
  }

  // Exclui múltiplas conversas permanentemente.
  async bulkRemove(tenantId: string, ids: string[]) {
    const owned = await this.prisma.aiConversation.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true },
    });
    const validIds = owned.map((c) => c.id);
    if (!validIds.length) return { deleted: 0 };
    const result = await this.prisma.aiConversation.deleteMany({
      where: { id: { in: validIds } },
    });
    return { deleted: result.count };
  }

  // Atualiza last_activity_at — chamado sempre que uma mensagem é gravada
  async touchActivity(conversationId: string) {
    return this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { lastActivityAt: new Date() },
    }).catch(() => null); // não bloqueia se a conversa já foi fechada
  }

  // F12: includeInternal=false por padrão de propósito — todo caminho que
  // alimenta o cliente (widget/portal) ou o prompt da IA precisa do default
  // seguro. Só a rota HTTP do Inbox (analista logado) passa includeInternal:true.
  async getMessages(
    tenantId: string,
    id: string,
    opts: { includeInternal?: boolean; sellerId?: string } = {},
  ) {
    // Etapa 2A: escopo de carteira também aqui — antes bastava o id.
    await this.findOneScoped(tenantId, id, opts.sellerId);
    return this.prisma.aiMessage.findMany({
      where: { conversationId: id, ...(opts.includeInternal ? {} : { isInternal: false }) },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Etapa 2A (item 2.3) — editar/excluir NOTA INTERNA.
   *
   * Só nota interna: mensagem que já saiu para o cliente (WhatsApp/portal/widget)
   * não pode ser reescrita nem apagada aqui. O cliente já leu; reescrever o
   * histórico do lado de cá criaria uma versão da conversa que não bate com a
   * que ele tem na mão — pior que o problema que se quer resolver.
   *
   * Autorização: autor da nota, ou `admin`. Um `operacional` NÃO edita a nota de
   * outro analista — foi a leitura que fiz de "apenas o autor ou admin", já que
   * a alternativa ("autor OU qualquer admin/operacional") não restringiria nada:
   * só admin e operacional enxergam nota interna, então a cláusula do autor
   * viraria letra morta. Se a intenção era o time inteiro poder editar tudo,
   * é trocar `role === 'admin'` por `SUPPORT_ROLES.includes(role)` aqui.
   *
   * Notas anteriores à migration não têm autor (null) — nesse caso só admin.
   */
  private async findEditableInternalNote(
    tenantId: string,
    messageId: string,
    actor: { userId?: string; role?: string },
  ) {
    const msg = await this.prisma.aiMessage.findFirst({ where: { id: messageId, tenantId } });
    if (!msg) throw new NotFoundException('Mensagem não encontrada');
    if (!(msg as any).isInternal) {
      throw new ForbiddenException('Só nota interna pode ser editada ou removida.');
    }
    const authorUserId = (msg as any).authorUserId as string | null;
    const isAuthor = !!authorUserId && authorUserId === actor.userId;
    if (!isAuthor && actor.role !== 'admin') {
      throw new ForbiddenException('Só o autor da nota (ou um admin) pode alterá-la.');
    }
    return msg;
  }

  async updateInternalNote(
    tenantId: string,
    messageId: string,
    content: string,
    actor: { userId?: string; role?: string },
  ) {
    const msg = await this.findEditableInternalNote(tenantId, messageId, actor);
    const updated = await this.prisma.aiMessage.update({
      where: { id: messageId },
      data: { content },
    });
    await this.audit.log({
      action: 'internal_note.updated',
      userId: actor.userId ?? null,
      tenantId,
      resource: `ai_message:${messageId}`,
      // Guarda o texto anterior: a edição some com ele, e sem isso não há como
      // reconstruir o que foi dito se a alteração for contestada depois.
      metadata: { conversationId: msg.conversationId, previousContent: msg.content },
    });
    // NÃO usar 'message.updated': esse evento já é o recibo (ack) do WhatsApp
    // e tem outro payload — ver ConversationsGateway.handleMessageUpdated.
    this.events.emit('internal_note.updated', {
      conversationId: msg.conversationId,
      message: updated,
    });
    return updated;
  }

  async deleteInternalNote(
    tenantId: string,
    messageId: string,
    actor: { userId?: string; role?: string },
  ) {
    const msg = await this.findEditableInternalNote(tenantId, messageId, actor);
    // Exclusão é DEFINITIVA de propósito: o caso de uso declarado é apagar dado
    // sensível colado por engano (LGPD). Um soft delete deixaria o dado no banco
    // e não resolveria nada. O conteúdo fica no audit log, que é restrito.
    await this.prisma.aiMessage.delete({ where: { id: messageId } });
    await this.audit.log({
      action: 'internal_note.deleted',
      userId: actor.userId ?? null,
      tenantId,
      resource: `ai_message:${messageId}`,
      metadata: { conversationId: msg.conversationId, deletedContent: msg.content },
    });
    this.events.emit('internal_note.deleted', {
      conversationId: msg.conversationId,
      messageId,
    });
    return { id: messageId, deleted: true };
  }

  // Histórico de mudanças de status/outcome (para a timeline da conversa).
  // Etapa 2A: mesmo escopo de carteira das mensagens — a timeline revela o
  // andamento do lead de outro vendedor, então tinha exatamente o mesmo furo.
  async getTimeline(tenantId: string, id: string, sellerId?: string) {
    await this.findOneScoped(tenantId, id, sellerId);
    return this.prisma.conversationStageHistory.findMany({
      where: { conversationId: id },
      orderBy: { changedAt: 'asc' },
    });
  }

  // ADR 027: acha ou cria uma conversa web_chat para o usuário TMS identificado.
  // Reutiliza uma conversa aberta existente (não fecha + reabre a cada sessão).
  // Chamado pelo ConversationsGateway no handshake do socket.
  async findOrCreateWebChat(
    tenantId: string,
    externalId: string,
    name: string | null,
  ): Promise<{ conversationId: string; isNew: boolean }> {
    // Reutiliza conversa aberta se existir. Inclui 'portal' além de 'web_chat':
    // o formulário "abrir chamado" (portal-tickets.service.ts) cria a conversa
    // com sourceChannel 'portal' — sem isso, um cliente que abre chamado pelo
    // formulário e depois abre o chat ao vivo ganhava uma SEGUNDA conversa,
    // porque esta busca só enxergava 'web_chat'.
    const existing = await this.prisma.aiConversation.findFirst({
      where: {
        tenantId,
        externalId,
        sourceChannel: { in: ['web_chat', 'portal'] as any },
        status: { notIn: ['closed', 'opt_out'] as any },
      },
      select: { id: true },
      orderBy: { startedAt: 'desc' },
    });
    if (existing) return { conversationId: existing.id, isNew: false };

    // Garante contato (upsert por tenantId+phone, onde phone = externalId do TMS)
    const contact = await this.prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone: externalId } },
      create: { tenantId, phone: externalId, name: name ?? 'Cliente TMS', leadStatus: 'cliente_ativo', nameSource: 'tms' },
      update: { name: name ?? undefined, nameSource: 'tms' },
    });

    const conv = await this.prisma.aiConversation.create({
      data: {
        tenantId,
        correlationId: uuidv4(),
        contactId: contact.id,
        phone: externalId,
        sourceChannel: 'web_chat' as any,
        agentType: 'support' as any,
        customerStage: 'cliente_ativo' as any,
        externalId,
        lastActivityAt: new Date(),
      },
    });

    this.logger.log(`web_chat: nova conversa criada ext=${externalId} conv=${conv.id.slice(0, 8)}`);
    return { conversationId: conv.id, isNew: true };
  }

  // Cria conversa (correlationId nasce aqui — rastreio ponta a ponta)
  async create(
    tenantId: string,
    dto: {
      contactId: string;
      phone: string;
      productCode?: string;
      sourceChannel?: string;
      agentType?: string;
      /**
       * Vendedor dono, quando a conversa nasce de um disparo (11/08/2026).
       *
       * Sem isto a conversa nascia sem dono e aparecia para os três vendedores —
       * o lead que respondeu ao Mateus ficava visível para o João. Quem dispara
       * é quem atende a resposta.
       */
      assignedSellerId?: string | null;
    },
  ) {
    return this.prisma.aiConversation.create({
      data: {
        tenantId,
        correlationId: uuidv4(),
        contactId: dto.contactId,
        phone: dto.phone,
        productCode: dto.productCode,
        sourceChannel: (dto.sourceChannel as any) ?? 'whatsapp',
        agentType: (dto.agentType as any) ?? 'router',
        customerStage: 'lead',
        ...(dto.assignedSellerId
          ? { assignedSellerId: dto.assignedSellerId, assignedAt: new Date() }
          : {}),
      },
    });
  }

  // Grava mensagem na conversa (herda correlationId da conversa)
  async addMessage(
    tenantId: string,
    conversationId: string,
    dto: {
      direction: 'inbound' | 'outbound';
      content: string;
      intent?: string;
      metadata?: Record<string, unknown>;
      tokensIn?: number;
      tokensOut?: number;
      estimatedCostUsd?: number;
      /** ADR 035: true only on the human inbox route — first human outbound activates takeover. */
      byHuman?: boolean;
      /**
       * Etapa 2A: quem escreveu, resolvido do JWT no controller — NUNCA do body.
       * Base da regra "só o autor edita a própria nota interna".
       */
      authorUserId?: string | null;
      /**
       * F12: nota interna — visível só pra equipe de suporte no Inbox, NUNCA
       * despachada ao cliente. Quando true: não ativa o takeover ADR 035 (não
       * é uma resposta ao cliente) e NUNCA passa pelo envio WAHA, mesmo em
       * conversa de WhatsApp.
       */
      isInternal?: boolean;
      /**
       * DISP-001: quando true, uma recusa do WAHA vira exceção em vez de só um
       * warn no log. Usado pelo disparo de campanha, que precisa distinguir
       * "entregue" de "tentou e falhou" para não marcar o alvo como 'sent'.
       * Default false — todos os outros chamadores mantêm o comportamento atual
       * (log-only), inclusive a rota HTTP do inbox, cujo contrato de resposta
       * NÃO muda.
       */
      requireDelivery?: boolean;
      /**
       * A mensagem JÁ foi entregue por quem chamou — registra no histórico sem
       * despachar de novo.
       *
       * Existe para o disparo de e-mail: ele monta assunto, template e link de
       * descadastro próprios e envia pelo EmailReplyService, então passar pelo
       * despacho daqui mandaria o MESMO e-mail duas vezes. Sem este registro, a
       * mensagem enviada não existia em conversa nenhuma — o engajamento da
       * campanha ficava zerado para sempre e o analista abria a conversa vendo a
       * resposta do lead sem saber o que tinha sido perguntado.
       *
       * Marca ack=1 ("✓ enviado"), o mesmo que o canal de e-mail usa: o servidor
       * aceitou, não que foi entregue na caixa ou lido.
       */
      alreadyDelivered?: boolean;
      /**
       * Rótulo do caminho de envio para o orçamento do número
       * (`NumberBudgetService`): `campaign` para disparo frio, `lia` para
       * resposta em conversa. Só afeta o relatório de quem gastou o quê — o
       * teto é do número, não da origem.
       */
      sendOrigin?: string;
    },
  ) {
    const conv = await this.findOne(tenantId, conversationId);

    // ADR 035: first outbound sent by a human activates the per-conversation
    // takeover — Lia switches to draft-only mode until release (close or
    // explicit return). Lia's own sends (metadata.aiGenerated) never set this.
    if (dto.byHuman && dto.direction === 'outbound' && !dto.isInternal && !(conv as any).humanTakeoverAt) {
      await this.prisma.aiConversation.update({
        where: { id: conv.id },
        data: { humanTakeoverAt: new Date() } as any,
      });
      this.logger.log(`ADR 035: takeover humano ativado na conversa ${conv.id} — Lia em modo rascunho`);
      this.events.emit('conversation.updated', { tenantId, conversationId: conv.id });
    }
    // C3: espelha metadata.campaignId numa coluna dedicada indexada (evita filtrar JSON
    // sem índice em ai_messages). Derivado aqui → nenhum chamador precisa mudar.
    const campaignId = typeof (dto.metadata as any)?.campaignId === 'string'
      ? ((dto.metadata as any).campaignId as string)
      : null;
    const message = await this.prisma.aiMessage.create({
      data: {
        conversationId: conv.id,
        tenantId,
        correlationId: conv.correlationId,
        direction: dto.direction,
        content: dto.content,
        intent: dto.intent,
        metadata: (dto.metadata ?? {}) as any,
        campaignId,
        tokensIn: dto.tokensIn,
        tokensOut: dto.tokensOut,
        estimatedCostUsd: dto.estimatedCostUsd,
        isInternal: dto.isInternal ?? false,
        authorUserId: dto.authorUserId ?? null,
      } as any,
    });
    // atualiza timestamp de última atividade (base da regra de auto-fechamento em 7 dias)
    await this.touchActivity(conv.id);

    // tempo real: empurra para a sala da conversa (WebSocket)
    this.events.emit('message.created', { conversationId: conv.id, message });
    // notifica o inbox do tenant (lista de conversas na sidebar)
    this.events.emit('conversation.updated', { tenantId, conversationId: conv.id });

    // ── Despacho por canal ────────────────────────────────────────────────────
    // web_chat e portal: a resposta já vai pelo WebSocket (message.created).
    // email: sai por SMTP — ver bloco abaixo.
    // whatsapp (e qualquer outro): WAHA.
    // F12: nota interna NUNCA é despachada, em canal nenhum — regra de segurança
    // crítica, não é só otimização de rota.
    const canal = conv.sourceChannel as string;
    const despachavel = !dto.isInternal && dto.direction === 'outbound' && !dto.alreadyDelivered;

    // Já entregue por quem chamou (ver `alreadyDelivered`): só registra o recibo.
    if (dto.alreadyDelivered && dto.direction === 'outbound' && !dto.isInternal) {
      await this.prisma.aiMessage
        .update({ where: { id: message.id }, data: { ack: 1 } })
        .catch((e: any) => this.logger.warn(`Falha ao marcar ack (msg=${message.id}): ${e?.message}`));
      (message as any).ack = 1;
      return message;
    }

    // E-MAIL — 2026-08-07: este canal não tinha ramo nenhum aqui e caía no `else`
    // do WhatsApp, ou seja, o WAHA era chamado com `conv.phone` = "email:fulano@…".
    // O envio falhava, virava um warn no log e a resposta NUNCA chegava ao lead.
    // A resposta automática da Lia funcionava só porque o EmailService dispara o
    // SMTP por fora (email.service.ts, passo 7) — quem respondia pelo inbox
    // escrevia no vazio.
    //
    // O envio real acontece no listener do EmailModule (email-outbound.listener.ts):
    // ConversationsModule não pode importar EmailModule (EmailModule já importa
    // este), então o desacoplamento é por evento — mesmo padrão do web_chat.
    if (despachavel && canal === 'email') {
      this.events.emit('conversation.outbound.email', {
        tenantId,
        conversationId: conv.id,
        messageId: message.id,
      });
      return message;
    }

    // WEB CHAT / PORTAL — a entrega é o próprio 'message.created' emitido acima:
    // o gateway empurra para a sala do socket e a mensagem já está persistida, então
    // o widget a vê agora ou ao carregar o histórico.
    //
    // O recibo (`ack`) precisa refletir isso. Só o WhatsApp preenchia o campo, e o
    // Inbox lê justamente ele para desenhar o status — resultado: TODA mensagem de
    // web chat e portal ficava marcada "enviando" para sempre, mesmo entregue.
    //
    // ack=1 ("✓ enviado") e nunca 2/3: sabemos que saiu daqui, não que a pessoa
    // recebeu na tela nem que leu. Canal sem recibo de leitura não pode fingir ter um.
    if (despachavel && (canal === 'web_chat' || canal === 'portal')) {
      await this.prisma.aiMessage
        .update({ where: { id: message.id }, data: { ack: 1 } })
        .catch((e: any) => this.logger.warn(`Falha ao marcar ack (conv=${conv.id} msg=${message.id}): ${e?.message}`));
      (message as any).ack = 1;
      return message;
    }

    if (despachavel && canal !== 'web_chat' && canal !== 'portal') {
      // presence: marca como lida e mostra "digitando…" antes de mandar. Toda
      // mensagem que passa por aqui é conversa de verdade (resposta da Lia,
      // inbox humano, primeira mensagem de campanha) — é exatamente onde uma
      // pessoa apareceria digitando. Alerta automático não passa por aqui.
      const r = await this.waha.sendText(conv.phone, dto.content, {
        presence: true,
        origin: dto.sendOrigin ?? 'lia',
      });
      if (r.sent) {
        this.logger.log(`WhatsApp enviado p/ ${conv.phone}${r.externalId ? ` (${r.externalId})` : ''}`);
        if (r.externalId) {
          // guarda o id do WhatsApp + marca ENVIADO (✓) p/ casar os recibos depois
          await this.prisma.aiMessage.update({ where: { id: message.id }, data: { externalId: r.externalId, ack: 1 } });
          (message as any).externalId = r.externalId;
          (message as any).ack = 1;
        }
      } else {
        this.logger.warn(`WhatsApp NÃO enviado p/ ${conv.phone}: ${r.reason}`);
        // DISP-001: o disparo de campanha pede requireDelivery para poder marcar
        // o alvo como 'failed'. Sem isto o WAHA recusava em silêncio e a campanha
        // era reportada como 100% enviada.
        if (dto.requireDelivery) {
          // DISP-021: carrega no erro se a recusa foi DEFINITIVA. Timeout/rede
          // podem ter entregue a mensagem — quem trata precisa saber disso para
          // não marcar falha e provocar reenvio duplicado.
          const err = new Error(`whatsapp_nao_enviado: ${r.reason ?? 'motivo desconhecido'}`) as Error & { definitive?: boolean };
          err.definitive = r.definitive === true;
          throw err;
        }
      }
    }
    return message;
  }
}
