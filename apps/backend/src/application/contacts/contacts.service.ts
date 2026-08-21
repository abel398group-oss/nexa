import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PaginationQueryDto, Paginated } from '@/shared/dto/pagination.dto';
import { CreateContactDto, UpdateContactDto } from './dto/create-contact.dto';
import { normalizePhone } from '@/shared/utils/phone.util';
import { OptOutRegistryService } from './opt-out-registry.service';
import { comEscopo } from '@/shared/auth/seller-scope';

/**
 * Marca do cliente do TMS dentro da tabela de contatos. É gravada num lugar só —
 * `conversations.service.ts`, quando o cliente abre o web chat do produto — e é o
 * que separa "quem já paga" de "quem a gente quer vender".
 */
export const CLIENTE_DO_TMS = 'cliente_ativo';

@Injectable()
export class ContactsService {
  private readonly logger = new Logger('Contacts');

  constructor(
    private readonly prisma: PrismaService,
    private readonly optOutRegistry: OptOutRegistryService,
  ) {}

  /**
   * `escopo` = vendedor logado (ver seller-scope.ts). `undefined` para admin e
   * demais papéis, que continuam vendo o tenant inteiro.
   *
   * `donoFiltro` é diferente: é o FILTRO que o admin escolhe na tela ("ver só os
   * do Mateus"). Um é trava de segurança, o outro é conveniência — e por isso o
   * escopo é aplicado por último, onde nenhum parâmetro de query o alcança.
   */
  async findAll(
    tenantId: string,
    q: PaginationQueryDto,
    tag?: string,
    escopo?: string,
    donoFiltro?: string,
    base?: string,
    status?: string,
  ): Promise<Paginated<any>> {
    const where: any = { tenantId };
    // 'Só ativos' / 'Só descadastrados' da tela. O filtro existia no seletor desde
    // sempre e nunca chegou aqui: o parâmetro morria antes, no ValidationPipe.
    if (status) where.status = status;
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { phone: { contains: q.search } },
        { company: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (tag) where.tags = { has: tag };
    // 'sem-dono' é a opção da tela para achar quem ainda não foi distribuído.
    if (donoFiltro) {
      where.ownerSellerId = donoFiltro === 'sem-dono' ? null : donoFiltro;
    }
    // Cliente do TMS e lead de prospecção moram na MESMA tabela: quem fala pelo web
    // chat entra por upsert com o id externo no lugar do telefone e `cliente_ativo`
    // (ver `conversations.service.ts`, garantirConversaWebChat). Sem este filtro a
    // tela de Leads do Market lista cliente do TMS com um UUID na coluna telefone.
    //
    // O default segue 'todos' de propósito: mudar o padrão do endpoint esconderia
    // gente de todo mundo que já chama GET /contacts. Quem quer o recorte pede.
    if (base === 'lead' || base === 'cliente') {
      // `{ not: 'cliente_ativo' }` sozinho não serve: `leadStatus` é nulo na maioria
      // dos leads importados, e em SQL `<> 'x'` sobre NULL não dá verdadeiro — os
      // leads sumiriam justamente da tela de leads.
      where.AND = [
        ...(where.AND ?? []),
        base === 'cliente'
          ? { leadStatus: CLIENTE_DO_TMS }
          : { OR: [{ leadStatus: null }, { leadStatus: { not: CLIENTE_DO_TMS } }] },
      ];
    }

    const comTrava = comEscopo(where, escopo);
    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where: comTrava,
        take: q.limit,
        skip: q.offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contact.count({ where: comTrava }),
    ]);
    return { items, total };
  }

  /**
   * Passa contatos de um vendedor para outro. Só o admin chega aqui.
   *
   * `null` devolve para o bolo sem dono, que é o caminho quando alguém sai da
   * empresa e ainda não se decidiu quem assume.
   *
   * As CONVERSAS vão junto: separar o contato e deixar a conversa com o vendedor
   * antigo daria a ele acesso ao histórico de um lead que não é mais dele — e
   * deixaria o novo dono sem o contexto do que já foi conversado.
   */
  async transferir(tenantId: string, ids: string[], sellerId: string | null) {
    if (!ids?.length) return { transferidos: 0, conversas: 0 };

    if (sellerId) {
      const vendedor = await this.prisma.seller.findFirst({ where: { id: sellerId, tenantId } });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
    }

    const contatos = await this.prisma.contact.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, phone: true },
    });
    if (!contatos.length) return { transferidos: 0, conversas: 0 };

    const [alterados, conversas] = await this.prisma.$transaction([
      this.prisma.contact.updateMany({
        where: { id: { in: contatos.map((c) => c.id) }, tenantId },
        data: { ownerSellerId: sellerId },
      }),
      this.prisma.aiConversation.updateMany({
        where: { tenantId, phone: { in: contatos.map((c) => c.phone) } },
        data: { assignedSellerId: sellerId, assignedAt: sellerId ? new Date() : null },
      }),
    ]);

    this.logger.log(
      `Transferência: ${alterados.count} contato(s) e ${conversas.count} conversa(s) → ` +
      `${sellerId ?? 'sem dono'}`,
    );
    return { transferidos: alterados.count, conversas: conversas.count };
  }

  // Lista as tags distintas do tenant com a contagem de contatos (para filtros e seletor de público).
  // Usa SQL com unnest() — evita carregar todos os contatos na memória (safe para 50k+ contatos).
  async listTags(tenantId: string): Promise<{ tag: string; count: number }[]> {
    return this.prisma.$queryRaw<{ tag: string; count: number }[]>`
      SELECT tag, COUNT(*)::int AS count
      FROM contacts, unnest(tags) AS tag
      WHERE tenant_id = ${tenantId}
      GROUP BY tag
      ORDER BY count DESC
    `;
  }

  // Adiciona ou remove uma tag em vários contatos de uma vez (sem duplicar).
  async bulkTag(tenantId: string, ids: string[], tag: string, mode: 'add' | 'remove' = 'add') {
    const clean = (tag ?? '').trim();
    if (!clean || !ids?.length) return { updated: 0 };
    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, tags: true },
    });
    let updated = 0;
    for (const c of contacts) {
      const set = new Set(c.tags ?? []);
      if (mode === 'add') set.add(clean);
      else set.delete(clean);
      await this.prisma.contact.update({ where: { id: c.id }, data: { tags: [...set] } });
      updated++;
    }
    return { updated };
  }

  // Renomeia uma tag em TODOS os contatos do tenant (array_replace + DISTINCT p/ não duplicar).
  async renameTag(tenantId: string, from: string, to: string) {
    const f = (from ?? '').trim();
    const t = (to ?? '').trim();
    if (!f || !t || f === t) return { updated: 0 };
    const r = await this.prisma.$executeRaw`
      UPDATE contacts SET tags = (
        SELECT array_agg(DISTINCT x) FROM unnest(array_replace(tags, ${f}, ${t})) AS x
      )
      WHERE tenant_id = ${tenantId} AND ${f} = ANY(tags)`;
    return { updated: Number(r) };
  }

  // Exclui uma tag de TODOS os contatos do tenant.
  async deleteTag(tenantId: string, tag: string) {
    const t = (tag ?? '').trim();
    if (!t) return { updated: 0 };
    const r = await this.prisma.$executeRaw`
      UPDATE contacts SET tags = array_remove(tags, ${t})
      WHERE tenant_id = ${tenantId} AND ${t} = ANY(tags)`;
    return { updated: Number(r) };
  }

  async findOne(tenantId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, tenantId } });
    if (!contact) throw new NotFoundException('Contato não encontrado');
    return contact;
  }

  // Exporta um único contato como CSV (LGPD — portabilidade de dados).
  // Retorna uma string CSV com cabeçalho; o controller seta os headers HTTP corretos.
  async exportCsv(tenantId: string, id: string): Promise<string> {
    const c = await this.findOne(tenantId, id);
    const row = [
      c.id,
      c.name ?? '',
      c.phone,
      c.email ?? '',
      c.company ?? '',
      c.leadStatus ?? '',
      c.status ?? '',
      (c.tags ?? []).join('|'),
      c.createdAt.toISOString(),
      c.updatedAt.toISOString(),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    const header = '"id","nome","telefone","email","empresa","leadStatus","status","tags","criadoEm","atualizadoEm"';
    return `${header}\n${row}\n`;
  }

  // Histórico de campanhas que um contato recebeu (via CampaignTarget).
  async campaignsForContact(tenantId: string, id: string) {
    const contact = await this.findOne(tenantId, id);
    const targets = await this.prisma.campaignTarget.findMany({
      where: { tenantId, phone: contact.phone },
      include: { campaign: { select: { id: true, name: true, channel: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return targets.map((t: any) => ({
      campaignId: t.campaignId,
      name: t.campaign?.name ?? '—',
      channel: t.campaign?.channel ?? 'whatsapp',
      status: t.status,
      sentAt: t.sentAt,
      createdAt: t.createdAt,
    }));
  }

  // F16: histórico de chamados (suporte/vendas) deste contato — alimenta o painel
  // do Inbox. Exclui arquivados: mesma regra do GET /conversations padrão, senão
  // um clique no histórico levaria a um ticket que não existe na lista principal.
  async ticketsForContact(tenantId: string, id: string) {
    await this.findOne(tenantId, id); // valida que é do tenant
    const convs = await this.prisma.aiConversation.findMany({
      where: { tenantId, contactId: id, OR: [{ outcome: null }, { outcome: { not: 'archived' } }] },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        ticketCategory: true,
        ticketPriority: true,
        createdAt: true,
        lastActivityAt: true,
      },
      orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    });
    return convs;
  }

  async create(tenantId: string, dto: CreateContactDto) {
    const phone = normalizePhone(dto.phone) || dto.phone; // garante formato canônico
    // upsert por (tenantId, phone) — não duplica
    return this.prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone } },
      update: { ...dto, phone, tags: dto.tags ?? undefined },
      create: { tenantId, ...dto, phone, tags: dto.tags ?? [] },
    });
  }

  // Grava o nome do contato a partir do pushName do WhatsApp respeitando a precedência
  // do nameSource (ADR 020): pushname < tms < manual. Só grava se o nome atual estiver
  // vazio OU também for 'pushname' — nunca sobrescreve um nome do TMS ou manual.
  async applyPushName(tenantId: string, phone: string, pushName: string) {
    const name = (pushName ?? '').trim();
    if (!name) return;
    const p = normalizePhone(phone) || phone;
    const c = await this.prisma.contact.findUnique({ where: { tenantId_phone: { tenantId, phone: p } } });
    if (!c) return;
    const src = (c as any).nameSource ?? 'pushname';
    if (c.name && src !== 'pushname') return; // nome de fonte superior → não toca
    if (c.name === name) return; // sem mudança
    await this.prisma.contact.update({ where: { id: c.id }, data: { name, nameSource: 'pushname' } });
  }

  /**
   * Grava o que o LEAD DISSE sobre si na conversa (2026-08-01).
   *
   * Precedência (estende a ADR 020): pushname < **lead** < tms < manual.
   * O que a pessoa digita vale mais que o apelido do perfil dela no WhatsApp
   * ("Jão 🚛" perde para "aqui é o João Silva"), mas nunca sobrepõe um dado do
   * TMS nem uma edição sua no painel.
   *
   * Regra de ouro: **só preenche campo VAZIO**. Não corrige o que já existe —
   * um erro de interpretação da IA sobrescrevendo dado bom é pior que um campo
   * em branco. Só o nome pode substituir um valor anterior, e apenas quando
   * esse valor veio do pushname.
   */
  async applyLeadProfile(
    tenantId: string,
    phone: string,
    profile: { nome?: string; empresa?: string; frota?: number },
  ): Promise<void> {
    if (!profile || (!profile.nome && !profile.empresa && profile.frota === undefined)) return;
    const p = normalizePhone(phone) || phone;
    const c = await this.prisma.contact.findUnique({ where: { tenantId_phone: { tenantId, phone: p } } });
    if (!c) return;

    const data: Record<string, unknown> = {};
    const src = (c as any).nameSource ?? 'pushname';

    // Nome: entra se está vazio OU se o que existe veio do pushname.
    if (profile.nome && (!c.name || src === 'pushname')) {
      if (c.name !== profile.nome) {
        data.name = profile.nome;
        data.nameSource = 'lead';
      }
    }
    // Empresa e frota: só quando vazios.
    if (profile.empresa && !c.company) data.company = profile.empresa;
    if (profile.frota !== undefined && (c as any).fleetSize == null) data.fleetSize = profile.frota;

    if (!Object.keys(data).length) return;
    await this.prisma.contact.update({ where: { id: c.id }, data: data as any });
    this.logger.log(`Perfil do lead atualizado (${p}): ${Object.keys(data).join(', ')}`);
  }

  async update(tenantId: string, id: string, dto: UpdateContactDto) {
    await this.findOne(tenantId, id);
    return this.prisma.contact.update({ where: { id }, data: { ...dto } });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id); // valida que é do tenant
    await this.prisma.contact.delete({ where: { id } });
    return { ok: true };
  }

  // Exclusão em lote: apaga todos os ids do tenant numa única operação (atômica).
  async deleteMany(tenantId: string, ids: string[]) {
    if (!ids?.length) return { deleted: 0 };
    const r = await this.prisma.contact.deleteMany({ where: { id: { in: ids }, tenantId } });
    return { deleted: r.count };
  }

  // reativa um contato que tinha optado por sair (uso MANUAL pelo admin, com consentimento)
  async reactivate(tenantId: string, id: string) {
    const c = await this.findOne(tenantId, id);
    // Tira também da lista de bloqueio permanente. Sem isto o disparo continuaria
    // pulando a pessoa e a tela mentiria: "reativei mas ela nunca recebe".
    // É ação MANUAL e consciente do admin — diferente de apagar o contato, que
    // não deve revogar o pedido de opt-out.
    await this.prisma.optOutRecord.deleteMany({
      where: {
        tenantId,
        OR: [
          ...(c.phone ? [{ phone: c.phone }] : []),
          ...(c.email ? [{ email: c.email }] : []),
        ],
      },
    }).catch(() => undefined);
    return this.prisma.contact.update({ where: { id }, data: { status: 'active', optOutAt: null } });
  }

  // marca um contato como descadastrado (opt-out) — não recebe mais disparos (LGPD)
  async optOut(tenantId: string, id: string) {
    const c = await this.findOne(tenantId, id);
    // Registro PERMANENTE também no opt-out manual: sem ele, apagar o contato e
    // reimportar a lista trazia a pessoa de volta (o mesmo furo do caso Patrícia —
    // o pedido morava só no registro que foi apagado). `register` nunca lança.
    // O telefone sintético `email:<addr>` de contato nascido por e-mail fica de
    // fora: os dígitos do endereço virariam um "telefone" de lixo no registro.
    const phoneReal = c.phone && !c.phone.startsWith('email:') ? c.phone : null;
    await this.optOutRegistry.register(tenantId, { phone: phoneReal, email: c.email }, 'pedido_manual');
    return this.prisma.contact.update({ where: { id }, data: { status: 'opted_out', optOutAt: new Date() } });
  }

  // ── Blocklist (2026-08-01, pré go-live): concorrentes NUNCA recebem campanha ──
  // status='blocked' é distinto de 'opted_out' (LGPD): opt-out é pedido do
  // contato; blocked é decisão NOSSA (concorrente, número interno, etc).
  // Reversível pelo painel (unblock). O sender barra em DOIS pontos:
  // criação da campanha (skipped/bloqueado) e tick (se bloquear depois de criada).
  async block(tenantId: string, ids: string[]) {
    if (!ids?.length) return { blocked: 0 };
    const r = await this.prisma.contact.updateMany({
      where: { id: { in: ids }, tenantId },
      data: { status: 'blocked' },
    });
    return { blocked: r.count };
  }

  async unblock(tenantId: string, ids: string[]) {
    if (!ids?.length) return { unblocked: 0 };
    // volta para 'active' apenas quem está 'blocked' — não mexe em opted_out
    const r = await this.prisma.contact.updateMany({
      where: { id: { in: ids }, tenantId, status: 'blocked' },
      data: { status: 'active' },
    });
    return { unblocked: r.count };
  }

  /**
   * Import em lote (CSV já parseado em array). Idempotente por phone.
   *
   * Consulta a lista de bloqueio ANTES de criar: quem já pediu para sair volta como
   * `opted_out`, não como `active`.
   *
   * Sem isto, o contato apagado numa limpeza e reimportado voltava ativo. O disparo
   * até barrava (o registry é consultado na criação da campanha e antes do envio),
   * mas a TELA mentia: você via 500 contatos disparáveis tendo 480, e qualquer canal
   * novo que esquecesse de consultar o registry vazaria. Foi assim que a Patrícia
   * recebeu campanha 3h depois de escrever que ia processar a empresa.
   *
   * Uma query para o lote inteiro — não uma por contato.
   */
  /**
   * `ownerSellerId` é escolhido na tela de importação — é o único lugar onde
   * alguém decide de quem a lista é, e o que faz todo o resto funcionar sozinho
   * depois. Vazio = entra sem dono, visível para todos, para o admin distribuir.
   */
  async importMany(tenantId: string, contacts: CreateContactDto[], ownerSellerId?: string | null) {
    if (!contacts?.length) return { imported: 0, blocked: 0 };

    const bloqueados = await this.optOutRegistry
      .blockedPhones(tenantId, contacts.map((c) => c.phone))
      .catch(() => new Set<string>()); // falha na consulta não pode travar o import

    let created = 0;
    let blocked = 0;
    for (const c of contacts) {
      const phone = normalizePhone(c.phone) || c.phone;
      const estaBloqueado = bloqueados.has(phone.replace(/\D/g, ''));
      if (estaBloqueado) blocked++;
      await this.prisma.contact.upsert({
        where: { tenantId_phone: { tenantId, phone } },
        // Já existe: preserva o status atual (inclusive opted_out) E o dono. Uma
        // lista reimportada em nome de outro vendedor não pode roubar o contato
        // de quem já vinha trabalhando nele.
        update: {},
        create: {
          tenantId,
          ...c,
          phone,
          tags: c.tags ?? [],
          ...(ownerSellerId ? { ownerSellerId } : {}),
          ...(estaBloqueado ? { status: 'opted_out', optOutAt: new Date() } : {}),
        },
      });
      created++;
    }
    if (blocked > 0) {
      this.logger.log(`Import: ${blocked} de ${created} contatos entraram já descadastrados (lista de bloqueio)`);
    }
    return { imported: created, blocked };
  }
}
