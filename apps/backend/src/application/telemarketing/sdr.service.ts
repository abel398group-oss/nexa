import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { escopoDeVendedor, type UsuarioComEscopo } from '@/shared/auth/seller-scope';
import { ordenarFila } from './sdr-queue';

/// Etapas em que o lead ainda é trabalho do SDR. `qualified` em diante é do closer.
const ETAPAS_DO_SDR = ['new'];

@Injectable()
export class SdrService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A fila do SDR, numa chamada só: oportunidade + contato + lote + histórico.
   *
   * Cinco requisições por lead, quarenta leads por dia, é meio segundo de espera a
   * cada troca — e é aí que aparece a planilha do lado da ferramenta.
   */
  async fila(tenantId: string, user: UsuarioComEscopo) {
    const escopo = escopoDeVendedor(user);

    // ATENÇÃO: aqui NÃO se usa `filtroDeDono`. Naquele filtro, lead sem dono aparece
    // pra todos — correto em Contatos, errado aqui. O módulo 1 decidiu que sem dono o
    // lead não existe pra ninguém: dois SDRs ligando pro mesmo lead é briga de
    // comissão e o lead achando que é telemarketing.
    const oportunidades = await this.prisma.opportunity.findMany({
      where: {
        tenantId,
        stage: { in: ETAPAS_DO_SDR },
        ...(escopo ? { assignedSellerId: escopo } : {}),
      },
      select: {
        id: true,
        productCode: true,
        pausedUntil: true,
        createdAt: true,
        name: true,
        company: true,
        phone: true,
        assignedSellerId: true,
        // `Opportunity` não declara relação com `Contact` — só guarda `contactId`.
        // Então a ficha vem numa segunda query em lote, nunca uma por lead.
        contactId: true,
        activities: {
          select: { id: true, type: true, result: true, notes: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: { select: { activities: true } },
      },
      // Teto: a fila é pra trabalhar hoje, não pra paginar 5.000 leads na tela.
      take: 500,
    });

    const contactIds = oportunidades
      .map((o) => o.contactId)
      .filter((id): id is string => !!id);

    const contatos = contactIds.length
      ? await this.prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: {
            id: true,
            name: true,
            company: true,
            phone: true,
            email: true,
            fleetSize: true,
            batch: { select: { id: true, name: true, source: true } },
          },
        })
      : [];
    const porId = new Map(contatos.map((c) => [c.id, c]));

    return ordenarFila(
      oportunidades.map((o) => ({
        ...o,
        contact: o.contactId ? porId.get(o.contactId) ?? null : null,
        tentativas: o._count.activities,
      })),
    );
  }

  /// Registra a tentativa. É o único lugar que grava esforço do SDR — não existe
  /// coluna de contador, a contagem é sempre COUNT destas linhas.
  async registrarAtividade(
    tenantId: string,
    user: UsuarioComEscopo & { sellerId?: string | null },
    dados: {
      opportunityId: string;
      type: string;
      result?: string;
      notes?: string;
      durationSec?: number;
    },
  ) {
    const oportunidade = await this.doEscopo(tenantId, user, dados.opportunityId);

    // Quem grava é o vendedor logado; se ele não tem vínculo, cai no dono da
    // oportunidade. Sem nenhum dos dois não há a quem atribuir o esforço, e gravar
    // atividade órfã estragaria o KPI de vendedor em silêncio.
    const sellerId = user.sellerId ?? oportunidade.assignedSellerId;
    if (!sellerId) {
      throw new ForbiddenException(
        'Sem vendedor vinculado: a atividade não teria a quem ser atribuída.',
      );
    }

    return this.prisma.sellerActivity.create({
      data: {
        tenantId,
        sellerId,
        opportunityId: oportunidade.id,
        type: dados.type,
        result: dados.result ?? null,
        notes: dados.notes ?? null,
        durationSec: dados.durationSec ?? null,
      },
    });
  }

  /// "Ligar depois" com data: sai da fila até o prazo. A atividade fica registrada
  /// junto, senão o retorno agendado não conta como tentativa.
  async pausar(
    tenantId: string,
    user: UsuarioComEscopo & { sellerId?: string | null },
    opportunityId: string,
    retornoEm: Date,
    notes?: string,
  ) {
    await this.doEscopo(tenantId, user, opportunityId);
    await this.registrarAtividade(tenantId, user, {
      opportunityId,
      type: 'call',
      result: 'agendou_retorno',
      notes,
    });
    return this.prisma.opportunity.update({
      where: { id: opportunityId },
      data: { pausedUntil: retornoEm },
    });
  }

  /// Descarte com motivo. O motivo é obrigatório no DTO: descarte sem motivo é dado
  /// perdido — depois ninguém sabe se a lista era ruim ou a abordagem.
  async descartar(
    tenantId: string,
    user: UsuarioComEscopo & { sellerId?: string | null },
    opportunityId: string,
    motivo: string,
    notes?: string,
  ) {
    const atual = await this.doEscopo(tenantId, user, opportunityId);
    await this.registrarAtividade(tenantId, user, {
      opportunityId,
      type: 'call',
      result: 'sem_interesse',
      notes,
    });

    // Transação: etapa e histórico juntos. Etapa sem histórico deixa o funil sem
    // como explicar de onde o descarte veio.
    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.opportunity.update({
        where: { id: opportunityId },
        data: { stage: 'discarded', discardReason: motivo },
      });
      await tx.opportunityStageHistory.create({
        data: {
          opportunityId,
          fromStage: atual.stage,
          toStage: 'discarded',
          reason: motivo,
        },
      });
      return atualizada;
    });
  }

  /// Closers elegíveis para um mercado. É a lista que o SDR escolhe — e a mesma que
  /// valida a escolha no `transferir`, senão um lead de pneus cai num closer que só
  /// vende TMS (R8).
  async closersDoMercado(tenantId: string, productCode: string) {
    const vinculos = await this.prisma.sellerMarket.findMany({
      where: { tenantId, productCode },
      select: { sellerId: true, role: true },
    });
    const ids = vinculos.map((v) => v.sellerId);
    if (!ids.length) return [];

    return this.prisma.seller.findMany({
      where: { id: { in: ids }, tenantId, active: true },
      select: { id: true, name: true, phone: true, email: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Passa o lead pro closer. Escolha direta: o SDR informa o `closerId`, e não há
   * round-robin aqui — `pickAndClaimSeller` foi o centro do incidente de 09/07 e não
   * se mexe nele para atender uma tela nova.
   *
   * Os DOIS campos de posse mudam juntos: `assignedSellerId` porque o trabalho é do
   * closer agora, e `Contact.ownerSellerId` porque senão a resposta do lead no
   * WhatsApp continua caindo no inbox do SDR e o closer fica cego no próprio negócio.
   *
   * O crédito do SDR não depende de campo congelado: fica no histórico de etapa e nas
   * linhas de `SellerActivity` que ele escreveu — as duas coisas imutáveis e datadas.
   */
  async transferir(
    tenantId: string,
    user: UsuarioComEscopo & { sellerId?: string | null },
    opportunityId: string,
    dados: { closerId: string; meetingAt?: Date; meetingUrl?: string; notes?: string },
  ) {
    const atual = await this.doEscopo(tenantId, user, opportunityId);

    // Mercado do lead manda: closer fora dele não recebe. Sem esta checagem, a
    // separação por mercado do módulo 1 vira decoração.
    const elegiveis = atual.productCode
      ? await this.closersDoMercado(tenantId, atual.productCode)
      : [];
    if (atual.productCode && !elegiveis.some((c) => c.id === dados.closerId)) {
      throw new ForbiddenException(
        'Este closer não trabalha o mercado deste lead.',
      );
    }

    // Atividade primeiro, enquanto o lead ainda é do SDR: depois da troca de posse o
    // escopo dele não alcança mais a oportunidade.
    await this.registrarAtividade(tenantId, user, {
      opportunityId,
      type: 'call',
      result: 'passou_closer',
      notes: dados.notes,
    });

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.opportunity.update({
        where: { id: opportunityId },
        data: {
          assignedSellerId: dados.closerId,
          // `qualified`, não uma etapa nova: as definições do funil no PRD contam
          // `qualified`, e inventar `meeting_scheduled` faria todo relatório que lê
          // essa etapa perder esses leads. A reunião mora em `meetingAt`.
          stage: 'qualified',
          ...(dados.meetingAt ? { meetingAt: dados.meetingAt } : {}),
          ...(dados.meetingUrl ? { meetingUrl: dados.meetingUrl } : {}),
        },
      });

      if (atual.contactId) {
        await tx.contact.update({
          where: { id: atual.contactId },
          data: { ownerSellerId: dados.closerId },
        });
      }

      await tx.opportunityStageHistory.create({
        data: {
          opportunityId,
          fromStage: atual.stage,
          toStage: 'qualified',
          // Quem saiu e pra quem foi, na própria linha: é o registro que sustenta
          // comissão depois, e não dá para reconstruir se não for gravado agora.
          reason: `passou_closer de ${atual.assignedSellerId ?? 'sem_dono'} para ${dados.closerId}`,
        },
      });

      return atualizada;
    });
  }

  /// Carrega a oportunidade já aplicando o escopo. Vendedor não alcança lead de
  /// outro por adivinhar o id — a checagem é no service, não só na tela (R5).
  private async doEscopo(
    tenantId: string,
    user: UsuarioComEscopo,
    opportunityId: string,
  ) {
    const escopo = escopoDeVendedor(user);
    const o = await this.prisma.opportunity.findFirst({
      where: {
        id: opportunityId,
        tenantId,
        ...(escopo ? { assignedSellerId: escopo } : {}),
      },
      select: {
        id: true,
        stage: true,
        assignedSellerId: true,
        contactId: true,
        productCode: true,
      },
    });
    if (!o) throw new NotFoundException('Oportunidade não encontrada.');
    return o;
  }
}
