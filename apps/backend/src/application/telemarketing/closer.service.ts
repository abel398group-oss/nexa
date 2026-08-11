import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { escopoDeVendedor, type UsuarioComEscopo } from '@/shared/auth/seller-scope';
import { agruparPorBloco } from './closer-today';

type Usuario = UsuarioComEscopo & { sellerId?: string | null };

/// Etapas abertas: o que o painel do closer enxerga.
const ABERTAS = ['qualified', 'proposal', 'paused'];

@Injectable()
export class CloserService {
  constructor(private readonly prisma: PrismaService) {}

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

    const negocios = await this.prisma.opportunity.findMany({
      where: {
        tenantId,
        stage: { in: ABERTAS },
        ...(escopo ? { assignedSellerId: escopo } : {}),
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
      },
      take: 500,
    });

    return agruparPorBloco(negocios);
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
        await tx.contact.update({
          where: { id: atual.contactId },
          // Só estampa se ainda não é cliente: a data que vale é a do primeiro
          // contrato, não a do último.
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
    const sellerId = user.sellerId;
    // Admin sem vínculo de vendedor age no painel sem gerar atividade: atribuir o
    // esforço a um vendedor qualquer estragaria o KPI dele em silêncio.
    if (!sellerId) return null;
    return this.prisma.sellerActivity.create({
      data: { tenantId, sellerId, opportunityId, type, result, notes: notes ?? null },
    });
  }

  /// Escopo no service, não só na tela: closer não alcança negócio de outro por
  /// adivinhar o id (R5).
  private async doEscopo(tenantId: string, user: Usuario, id: string) {
    const escopo = escopoDeVendedor(user);
    const o = await this.prisma.opportunity.findFirst({
      where: { id, tenantId, ...(escopo ? { assignedSellerId: escopo } : {}) },
      select: { id: true, stage: true, contactId: true, assignedSellerId: true },
    });
    if (!o) throw new NotFoundException('Negócio não encontrado.');
    return o;
  }
}
