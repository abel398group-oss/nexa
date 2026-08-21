import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { escopoDeVendedor, type UsuarioComEscopo } from '@/shared/auth/seller-scope';
import { MarketScopeService, filtroDeMercado, assertMercado } from '@/shared/auth/market-scope.service';
import { MarketAssetsService } from '@/application/markets/market-assets.service';
import { FollowUpService } from '@/application/followup/followup.service';
import { agruparPorBloco } from './closer-today';
import { empresaDoNegocio } from './lead-import';

type Usuario = UsuarioComEscopo & { sellerId?: string | null };

/// Etapas abertas: o que o painel do closer enxerga.
const ABERTAS = ['qualified', 'proposal', 'paused'];

@Injectable()
export class CloserService {
  private readonly logger = new Logger('Closer');

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketScope: MarketScopeService,
    private readonly marketAssets: MarketAssetsService,
    private readonly followup: FollowUpService,
  ) {}

  /**
   * Painel "HOJE" nos 3 blocos. A regra de qual bloco vive em `closer-today.ts`,
   * puro e testado — aqui só se busca o que está aberto e se agrupa.
   *
   * Por que não kanban por padrão: kanban responde "como está meu pipeline", e o
   * closer com quinze negócios abertos acorda com "o que eu faço hoje?". O quadro
   * obriga a varrer quatro colunas pra descobrir que tem reunião às 15h.
   */
  async hoje(tenantId: string, user: Usuario) {
    const escopo = escopoDeVendedor(user);
    // Carteira também é escopada por mercado: closer de pneus não abre negócio de TMS.
    const mercados = await this.marketScope.mercadosDoUsuario(tenantId, user);

    const negocios = await this.prisma.opportunity.findMany({
      where: {
        tenantId,
        stage: { in: ABERTAS },
        ...(escopo ? { assignedSellerId: escopo } : {}),
        ...filtroDeMercado(mercados),
      },
      select: {
        id: true,
        stage: true,
        meetingAt: true,
        meetingUrl: true,
        pausedUntil: true,
        updatedAt: true,
        value: true,
        name: true,
        company: true,
        phone: true,
        productCode: true,
        contactId: true,
        assignedSellerId: true,
        // A nota que o SDR escreveu ao passar o lead (`transferir()`, result
        // `passou_closer`) morava aqui sem ninguém buscar de volta — o closer nunca via
        // o que o SDR quis dizer. `fila()` do SDR já busca o mesmo campo; faltava só
        // deste lado (19/08/2026).
        activities: {
          select: { id: true, type: true, result: true, notes: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
      take: 500,
    });

    // A ficha do contato manda no nome. `Opportunity` não declara relação com
    // `Contact` — só guarda o id — então a ficha vem numa segunda consulta em LOTE,
    // nunca uma por negócio (mesmo padrão da fila do SDR).
    //
    // Sem isto o painel do closer lia só o `company` da oportunidade, e um negócio
    // importado antes de 17/08/2026 mostra aqui um nome de empresa diferente do que a
    // fila do SDR mostra para a mesma pessoa.
    const contactIds = [...new Set(negocios.map((n) => n.contactId).filter(Boolean) as string[])];
    const fichas = contactIds.length
      ? await this.prisma.contact.findMany({
          where: { tenantId, id: { in: contactIds } },
          select: { id: true, company: true, name: true },
        })
      : [];
    const porId = new Map(fichas.map((f) => [f.id, f]));

    return agruparPorBloco(
      negocios.map((n) => {
        const ficha = n.contactId ? porId.get(n.contactId) : undefined;
        return {
          ...n,
          company: empresaDoNegocio(ficha?.company, n.company),
          name: ficha?.name ?? n.name,
        };
      }),
    );
  }

  /**
   * Material APROVADO do mercado (ADR 037, módulo 3 fechado em 19/08/2026): o mesmo
   * roteiro/portfólio validado que o SDR já enxerga na mesa de trabalho. O closer
   * herda o negócio de um mercado que às vezes nunca trabalhou como SDR — sem isto,
   * ele chegava na reunião sem saber o que a campanha prometeu.
   */
  async materialAprovadoDoMercado(tenantId: string, productCode: string, user?: Usuario) {
    if (!productCode) return [];
    assertMercado(await this.marketScope.mercadosDoUsuario(tenantId, user), productCode);
    return this.marketAssets.listarAprovados(tenantId, productCode);
  }

  /// Registra a proposta com o valor estimado. `value` já existia no schema — é valor
  /// de pipeline, não dinheiro devido: sem ele o relatório só diz "fechou 3", sem
  /// distinguir 3 de R$ 200 de 3 de R$ 50.000.
  async registrarProposta(
    tenantId: string,
    user: Usuario,
    id: string,
    valor: number,
    notes?: string,
  ) {
    const atual = await this.doEscopo(tenantId, user, id);
    return this.mudarEtapa(tenantId, user, atual, 'proposal', {
      data: { value: valor },
      resultado: 'enviado',
      motivo: 'proposta enviada',
      notes,
    });
  }

  /// Reagenda a reunião. Continua em `qualified` de propósito: remarcar não é avanço
  /// de etapa, e mexer na etapa aqui sujaria o funil com movimento que não é progresso.
  async reagendar(
    tenantId: string,
    user: Usuario,
    id: string,
    meetingAt: Date,
    meetingUrl?: string,
    notes?: string,
  ) {
    await this.doEscopo(tenantId, user, id);
    await this.registrarAtividade(tenantId, user, id, 'note', 'agendou_retorno', notes);
    return this.prisma.opportunity.update({
      where: { id },
      data: { meetingAt, ...(meetingUrl ? { meetingUrl } : {}) },
    });
  }

  /**
   * Ganhou. Marca a etapa E estampa `Contact.customerSince` na mesma transação.
   *
   * O `customerSince` é o que fecha um vazamento que só apareceria em produção: um
   * contrato assinado hoje não está no TMS depois de amanhã, então a peneira da
   * importação deixaria o cliente novo receber campanha fria do produto que ele
   * acabou de comprar — de outro SDR, na mesma semana.
   *
   * Não existe coluna de "data de fechamento": o `OpportunityStageHistory` já grava
   * quando foi para `won`, com data. Uma coluna seria um segundo lugar dizendo o
   * mesmo, e os dois divergem no dia em que alguém escrever só num.
   */
  async ganhou(tenantId: string, user: Usuario, id: string, valor?: number, notes?: string) {
    const atual = await this.doEscopo(tenantId, user, id);
    return this.mudarEtapa(tenantId, user, atual, 'won', {
      data: valor !== undefined ? { value: valor } : {},
      resultado: 'outro',
      motivo: 'ganho',
      notes,
      marcarCliente: true,
    });
  }

  /// Perdeu de vez. Motivo obrigatório no DTO — perda sem motivo é a pergunta "a lista
  /// era ruim ou a abordagem era?" ficando sem resposta para sempre.
  async perdeu(tenantId: string, user: Usuario, id: string, motivo: string, notes?: string) {
    const atual = await this.doEscopo(tenantId, user, id);
    return this.mudarEtapa(tenantId, user, atual, 'lost', {
      data: { discardReason: motivo },
      resultado: 'outro',
      motivo,
      notes,
    });
  }

  /// Perda por timing: congela com data de volta em vez de matar. "Sem orçamento
  /// agora" não é "sem perfil" — o primeiro é lead pra chamar em três meses.
  async adiar(
    tenantId: string,
    user: Usuario,
    id: string,
    voltarEm: Date,
    motivo: string,
    notes?: string,
  ) {
    const atual = await this.doEscopo(tenantId, user, id);
    return this.mudarEtapa(tenantId, user, atual, 'paused', {
      data: { pausedUntil: voltarEm, discardReason: motivo },
      resultado: 'agendou_retorno',
      motivo,
      notes,
    });
  }

  /// Etapa + histórico + atividade sempre juntos. Etapa sem histórico deixa o funil
  /// sem como explicar de onde o movimento veio.
  private async mudarEtapa(
    tenantId: string,
    user: Usuario,
    atual: { id: string; stage: string; contactId: string | null; assignedSellerId: string | null },
    novaEtapa: string,
    opts: {
      data: Record<string, unknown>;
      resultado: string;
      motivo: string;
      notes?: string;
      marcarCliente?: boolean;
    },
  ) {
    await this.registrarAtividade(
      tenantId,
      user,
      atual.id,
      'note',
      opts.resultado,
      opts.notes,
    );

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.opportunity.update({
        where: { id: atual.id },
        data: { stage: novaEtapa, ...opts.data },
      });

      if (opts.marcarCliente && atual.contactId) {
        // `updateMany` com `customerSince: null` no filtro é o que faz o comentário
        // virar verdade (21/08/2026). O `update` daqui carimbava SEMPRE: o segundo
        // contrato do mesmo cliente apagava a data do primeiro, e a data que vale é
        // a da primeira venda.
        //
        // Não é só histórico bonito. A peneira da importação usa `customerSince`
        // para não mandar campanha fria a quem já comprou; movê-la para frente a
        // cada venda é reescrever a resposta de "desde quando ele é cliente" — e
        // relatório de safra passa a mentir sem ninguém perceber.
        await tx.contact.updateMany({
          where: { id: atual.contactId, customerSince: null },
          data: { customerSince: new Date() },
        });
      }

      await tx.opportunityStageHistory.create({
        data: {
          opportunityId: atual.id,
          fromStage: atual.stage,
          toStage: novaEtapa,
          reason: opts.motivo,
        },
      });

      return atualizada;
    });
  }

  private async registrarAtividade(
    tenantId: string,
    user: Usuario,
    opportunityId: string,
    type: string,
    result: string,
    notes?: string,
  ) {
    // A cadência para ANTES do `if (sellerId)`: quem agiu foi gente, mesmo quando é um
    // admin sem vínculo de vendedor e a atividade não é gravada. O robô não pode
    // continuar mandando follow-up num negócio que alguém acabou de trabalhar só
    // porque quem trabalhou não tem KPI. Mesma regra do SDR (21/08/2026).
    await this.pararCadencia(tenantId, opportunityId);

    const sellerId = user.sellerId;
    // Admin sem vínculo de vendedor age no painel sem gerar atividade: atribuir o
    // esforço a um vendedor qualquer estragaria o KPI dele em silêncio.
    if (!sellerId) return null;
    return this.prisma.sellerActivity.create({
      data: { tenantId, sellerId, opportunityId, type, result, notes: notes ?? null },
    });
  }

  /**
   * Cala a cadência automática do lead que acabou de ser trabalhado.
   *
   * Best-effort: falhar aqui não pode derrubar o registro da proposta ou do
   * fechamento, que é o que o closer veio fazer. Mas some do log NUNCA (REGRA 3).
   */
  private async pararCadencia(tenantId: string, opportunityId: string): Promise<void> {
    try {
      const o = await this.prisma.opportunity.findFirst({
        where: { id: opportunityId, tenantId },
        select: { phone: true },
      });
      if (o?.phone) {
        await this.followup.stopByPhone(tenantId, o.phone, 'closer trabalhou o negócio');
      }
    } catch (e) {
      this.logger.warn(
        `Não consegui parar a cadência do negócio ${opportunityId}: ${(e as Error).message}`,
      );
    }
  }

  /// Escopo no service, não só na tela: closer não alcança negócio de outro por
  /// adivinhar o id (R5).
  private async doEscopo(tenantId: string, user: Usuario, id: string) {
    const escopo = escopoDeVendedor(user);
    // O mercado entra AQUI e não só na listagem: sem isto, esconder o negócio do painel
    // e continuar aceitando agir nele por id seria trocar a fechadura e deixar a chave.
    const mercados = await this.marketScope.mercadosDoUsuario(tenantId, user);
    const o = await this.prisma.opportunity.findFirst({
      where: { id, tenantId, ...(escopo ? { assignedSellerId: escopo } : {}), ...filtroDeMercado(mercados) },
      select: { id: true, stage: true, contactId: true, assignedSellerId: true },
    });
    // 404 e não 403, igual ao resto: para quem não tem escopo o negócio não existe —
    // um 403 confirmaria que o id é válido.
    if (!o) throw new NotFoundException('Negócio não encontrado.');
    return o;
  }
}
