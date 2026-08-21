import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { escopoDeVendedor, type UsuarioComEscopo } from '@/shared/auth/seller-scope';
import { MarketScopeService, filtroDeMercado, assertMercado } from '@/shared/auth/market-scope.service';
import { MarketAssetsService } from '@/application/markets/market-assets.service';
import { FollowUpService } from '@/application/followup/followup.service';
import { agruparPorContato, ordenarFila } from './sdr-queue';
import { naoAusente } from './seller-availability';

/// Etapas em que o lead ainda é trabalho do SDR. `qualified` em diante é do closer.
const ETAPAS_DO_SDR = ['new'];

@Injectable()
export class SdrService {
  private readonly logger = new Logger('Sdr');

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketScope: MarketScopeService,
    private readonly marketAssets: MarketAssetsService,
    private readonly followup: FollowUpService,
  ) {}

  /**
   * A fila do SDR, numa chamada só: oportunidade + contato + lote + histórico.
   *
   * Cinco requisições por lead, quarenta leads por dia, é meio segundo de espera a
   * cada troca — e é aí que aparece a planilha do lado da ferramenta.
   */
  async fila(tenantId: string, user: UsuarioComEscopo) {
    const escopo = escopoDeVendedor(user);
    // Segunda dimensão, composta com a do dono: o SDR do Agabê vê os leads de Agabê que
    // são dele. Sem escopo de mercado devolve `{}` e nada muda.
    const mercados = await this.marketScope.mercadosDoUsuario(tenantId, user);

    // ATENÇÃO: aqui NÃO se usa `filtroDeDono`. Naquele filtro, lead sem dono aparece
    // pra todos — correto em Contatos, errado aqui. O módulo 1 decidiu que sem dono o
    // lead não existe pra ninguém: dois SDRs ligando pro mesmo lead é briga de
    // comissão e o lead achando que é telemarketing.
    const oportunidades = await this.prisma.opportunity.findMany({
      where: {
        tenantId,
        stage: { in: ETAPAS_DO_SDR },
        ...(escopo ? { assignedSellerId: escopo } : {}),
        ...filtroDeMercado(mercados),
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
        // Termômetro do lead. Era calculado pela IA, gravado no banco e SUMIA aqui:
        // o `select` não o trazia, então a fila mostrava tentativa e prioridade sem
        // nunca dizer quanto o lead vale (20/08/2026).
        interestScore: true,
        // A chave da aba Conversa do cockpit. Sem ela a tela não tem o que abrir —
        // é null no lead que veio de CSV e ainda não recebeu campanha.
        conversationId: true,
        // O que o SDR descobriu na ligação. Vem na fila (e não numa segunda chamada)
        // porque a tela precisa dele já preenchido ao abrir o lead — buscar depois
        // faria as caixas piscarem de vazio para marcado a cada troca.
        qualification: true,
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
            // Temperatura e marcação que a operação já mantinha no contato e que a
            // mesa nunca mostrou — o SDR abria a ficha sem saber se aquele lead já
            // tinha sido classificado.
            leadStatus: true,
            tags: true,
            batch: { select: { id: true, name: true, source: true } },
          },
        })
      : [];
    const porId = new Map(contatos.map((c) => [c.id, c]));

    // Agrupar ANTES de ordenar: a prioridade tem que ser calculada sobre o total de
    // tentativas do contato, não sobre uma das linhas dele. Ver `agruparPorContato`.
    return ordenarFila(
      agruparPorContato(
        oportunidades.map((o) => ({
          ...o,
          contact: o.contactId ? porId.get(o.contactId) ?? null : null,
          tentativas: o._count.activities,
        })),
      ),
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
      /// Versão do roteiro que estava NA TELA no momento da ação. Sem o carimbo, o
      /// versionamento não responde "o texto novo converteu melhor?" — e ligação
      /// registrada sem ele é dado perdido para sempre.
      scriptVersion?: number;
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

    const atividade = await this.prisma.sellerActivity.create({
      data: {
        tenantId,
        sellerId,
        opportunityId: oportunidade.id,
        type: dados.type,
        result: dados.result ?? null,
        notes: dados.notes ?? null,
        durationSec: dados.durationSec ?? null,
        scriptVersion: dados.scriptVersion ?? null,
      },
    });

    /**
     * O vendedor assumiu — o robô cala (20/08/2026).
     *
     * A cadência automática só parava quando o LEAD respondia. O SDR ligar, conversar
     * e registrar não parava nada: no dia seguinte o follow-up mandava "passando pra
     * saber se você viu minha mensagem", como se ninguém tivesse falado com ele.
     *
     * Desligar a Lia nunca cobriu isso: `followup.service` não consulta a autonomia,
     * é um relógio à parte. Enquanto a operação é manual, quem decide o próximo toque
     * é quem falou com a pessoa.
     *
     * Best-effort de propósito: falhar aqui não pode derrubar o registro da atividade,
     * que é o esforço do vendedor e a base da comissão. Mas some do log NUNCA (REGRA 3).
     */
    if (oportunidade.phone) {
      await this.followup
        .stopByPhone(tenantId, oportunidade.phone, `SDR registrou ${dados.type}`)
        .catch((e) =>
          this.logger.warn(
            `Não consegui parar a cadência de ${oportunidade.phone} ` +
              `(oportunidade ${oportunidade.id}): ${(e as Error).message}`,
          ),
        );
    }

    return atividade;
  }

  /**
   * O SDR grava o que descobriu na ligação (21/08/2026).
   *
   * Antes disto o único registro era o texto livre da anotação: "quantos leads com
   * decisor na mesa?" não tinha resposta, porque a informação existia só em prosa.
   *
   * PATCH de verdade — campo ausente não é tocado. O SDR marca "decisor" durante a
   * ligação e escreve a observação depois de desligar; se o segundo salvamento
   * apagasse o primeiro, ele aprenderia a preencher tudo de uma vez ou a não
   * preencher nada.
   */
  async qualificar(
    tenantId: string,
    user: UsuarioComEscopo & { sellerId?: string | null },
    opportunityId: string,
    dados: {
      decisor?: boolean;
      frotaPropria?: boolean;
      temOrcamento?: boolean;
      observacao?: string;
    },
  ) {
    const atual = await this.doEscopo(tenantId, user, opportunityId);
    const anterior = ((atual as any).qualification ?? {}) as Record<string, unknown>;

    const qualification = {
      ...anterior,
      ...(dados.decisor !== undefined ? { decisor: dados.decisor } : {}),
      ...(dados.frotaPropria !== undefined ? { frotaPropria: dados.frotaPropria } : {}),
      ...(dados.temOrcamento !== undefined ? { temOrcamento: dados.temOrcamento } : {}),
      ...(dados.observacao !== undefined ? { observacao: dados.observacao.trim() } : {}),
      // Quem avaliou e quando. É o que responde "esta qualificação ainda vale?" seis
      // meses depois, e o que distingue o lead avaliado do nunca olhado.
      avaliadoEm: new Date().toISOString(),
      avaliadoPor: user.sellerId ?? null,
    };

    return this.prisma.opportunity.update({
      where: { id: opportunityId },
      data: { qualification: qualification as any },
    });
  }

  /**
   * O SDR recalibra o score do lead (20/08/2026).
   *
   * O `interestScore` era escrito só pela IA, a partir do texto que o lead mandou.
   * Quem falou com a pessoa por telefone sabe mais que o modelo: o lead que escreveu
   * "manda mais informação" pode ter dito na ligação que decide na semana que vem, e
   * nada disso passa por um classificador de mensagem.
   *
   * A mudança grava uma atividade junto, com o de-para no texto. Sem esse registro o
   * número muda e ninguém sabe quem mexeu nem por quê — e a comparação entre a
   * calibragem humana e a da IA, que é o que dá para aprender disto, fica impossível.
   */
  async ajustarScore(
    tenantId: string,
    user: UsuarioComEscopo & { sellerId?: string | null },
    opportunityId: string,
    score: number,
  ) {
    const atual = await this.doEscopo(tenantId, user, opportunityId);

    // Fora da faixa não é ajuste, é engano — e um score de 250 estragaria em silêncio
    // toda ordenação e todo corte de "lead quente" daqui para a frente.
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      throw new ForbiddenException('O score precisa ser um número inteiro de 0 a 100.');
    }

    const anterior = (atual as any).interestScore ?? 0;
    if (anterior === score) return atual;

    const atualizada = await this.prisma.opportunity.update({
      where: { id: opportunityId },
      data: { interestScore: score },
    });

    // A atividade é o registro de quem mexeu. Best-effort: se o vendedor não tem
    // vínculo, o ajuste vale do mesmo jeito — recusar a recalibragem por causa do
    // histórico seria proteger o registro contra o próprio trabalho.
    await this.registrarAtividade(tenantId, user, {
      opportunityId,
      type: 'note',
      result: 'outro',
      notes: `Score ajustado de ${anterior} para ${score} pelo vendedor.`,
    }).catch(() => null);

    this.logger.log(
      `Score da oportunidade ${opportunityId}: ${anterior} → ${score} (vendedor ${user.sellerId ?? '—'})`,
    );
    return atualizada;
  }

  /// "Ligar depois" com data: sai da fila até o prazo. A atividade fica registrada
  /// junto, senão o retorno agendado não conta como tentativa.
  async pausar(
    tenantId: string,
    user: UsuarioComEscopo & { sellerId?: string | null },
    opportunityId: string,
    retornoEm: Date,
    notes?: string,
    scriptVersion?: number,
  ) {
    await this.doEscopo(tenantId, user, opportunityId);
    await this.registrarAtividade(tenantId, user, {
      opportunityId,
      type: 'call',
      result: 'agendou_retorno',
      notes,
      scriptVersion,
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
    scriptVersion?: number,
  ) {
    const atual = await this.doEscopo(tenantId, user, opportunityId);
    await this.registrarAtividade(tenantId, user, {
      opportunityId,
      type: 'call',
      result: 'sem_interesse',
      notes,
      scriptVersion,
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

  /**
   * Material de consulta do mercado (módulo 1, item 7).
   *
   * É a base de conhecimento que já existe, filtrada por `productCode` — construir um
   * segundo acervo seria a duplicação que a ADR 037 evitou para mercado.
   *
   * Rota própria e só leitura, em vez de mandar o SDR na API de conhecimento: aquela
   * está atrás da permissão `knowledge`, que dá poder de EDITAR o acervo. Ele precisa
   * consultar durante a ligação, não reescrever o que a Lia responde.
   */
  async materialDoMercado(
    tenantId: string,
    productCode: string,
    busca?: string,
    user?: UsuarioComEscopo,
  ) {
    if (!productCode) return [];
    // `productCode` vem da query: aqui a decisão é permitir/negar, não filtrar. Sem o
    // assert, bastava trocar o parâmetro na URL para ler o acervo de outro mercado.
    assertMercado(await this.marketScope.mercadosDoUsuario(tenantId, user), productCode);

    const where: any = { tenantId, productCode, approved: true };
    if (busca?.trim()) {
      const q = busca.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
        { topic: { contains: q, mode: 'insensitive' } },
      ];
    }

    return this.prisma.aiKnowledgeBase.findMany({
      where,
      select: { id: true, title: true, content: true, category: true, topic: true },
      orderBy: { title: 'asc' },
      // Teto baixo de propósito: isto é consulta no meio de uma ligação. Cem resultados
      // não ajudam quem tem quinze segundos para achar o preço.
      take: 25,
    });
  }

  /**
   * Material APROVADO do mercado (ADR 037, módulo 2 fechado em 19/08/2026): o roteiro
   * em `.md` e o portfólio que alguém validou no painel de Validação de Campanha.
   *
   * Diferente de `materialDoMercado()`: aquele é a base de conhecimento antiga
   * (`ai_knowledge_base`), este é o `market_assets` que a esteira nova produz. As
   * duas fontes convivem até a operação migrar o conteúdo de uma pra outra.
   */
  async materialAprovadoDoMercado(
    tenantId: string,
    productCode: string,
    user?: UsuarioComEscopo,
  ) {
    if (!productCode) return [];
    assertMercado(await this.marketScope.mercadosDoUsuario(tenantId, user), productCode);
    return this.marketAssets.listarAprovados(tenantId, productCode);
  }

  /// Closers elegíveis para um mercado. É a lista que o SDR escolhe — e a mesma que
  /// valida a escolha no `transferir`, senão um lead de pneus cai num closer que só
  /// vende TMS (R8).
  async closersDoMercado(
    tenantId: string,
    productCode: string,
    excluirSellerId?: string | null,
    user?: UsuarioComEscopo,
  ) {
    // Mesma razão do material: o mercado chega pela query e decide o que é devolvido.
    assertMercado(await this.marketScope.mercadosDoUsuario(tenantId, user), productCode);
    const vinculos = await this.prisma.sellerMarket.findMany({
      where: { tenantId, productCode },
      select: { sellerId: true, role: true },
    });
    // Ele mesmo fora da lista: ninguém passa lead pra si próprio, e ver o próprio nome
    // ali sugere que passar pra si é uma jogada válida. Não se filtra por `role` porque
    // `seller | lead` não distingue SDR de closer — esse conceito não existe no banco.
    const ids = vinculos
      .map((v) => v.sellerId)
      .filter((id) => !excluirSellerId || id !== excluirSellerId);
    if (!ids.length) return [];

    return this.prisma.seller.findMany({
      // Ausente não recebe: passar um lead quente para quem está de férias é o lead
      // esfriando duas semanas sem ninguém perceber.
      where: { id: { in: ids }, tenantId, active: true, ...naoAusente() },
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
    dados: {
      closerId: string;
      meetingAt?: Date;
      meetingUrl?: string;
      notes?: string;
      scriptVersion?: number;
    },
  ) {
    const atual = await this.doEscopo(tenantId, user, opportunityId);

    // Mercado do lead manda: closer fora dele não recebe. Sem esta checagem, a
    // separação por mercado do módulo 1 vira decoração.
    // Passar para si mesmo tem mensagem PRÓPRIA. Sem ela, quem manda o próprio id (pela
    // API ou por um select antigo em cache) recebe "não trabalha este mercado" — que é
    // falso, e manda o suporte investigar vínculo de mercado por meia hora.
    if (user.sellerId && dados.closerId === user.sellerId) {
      throw new ForbiddenException('Você não pode passar o lead para você mesmo.');
    }

    // Mesma exclusão da lista que a tela mostrou: se ele não pode se ver na lista, não
    // pode passar pra si mandando o próprio id na mão.
    const elegiveis = atual.productCode
      ? await this.closersDoMercado(tenantId, atual.productCode, user.sellerId)
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
      scriptVersion: dados.scriptVersion,
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
    // O mercado entra AQUI e não só na fila: sem isto, esconder o lead da lista e
    // continuar aceitando agir nele por id seria trocar a fechadura e deixar a chave.
    const mercados = await this.marketScope.mercadosDoUsuario(tenantId, user);
    const o = await this.prisma.opportunity.findFirst({
      where: {
        id: opportunityId,
        tenantId,
        ...(escopo ? { assignedSellerId: escopo } : {}),
        ...filtroDeMercado(mercados),
      },
      select: {
        id: true,
        stage: true,
        assignedSellerId: true,
        contactId: true,
        productCode: true,
        // Usado para calar a cadência automática quando o vendedor assume o lead
        // (ver `registrarAtividade`). O `FollowUp` é indexado por telefone, e não por
        // oportunidade — lead de CSV não tem conversa até a campanha disparar.
        phone: true,
      },
    });
    if (!o) throw new NotFoundException('Oportunidade não encontrada.');
    return o;
  }
}
