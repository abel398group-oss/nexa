import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';
import { parseCsvDeLeads, type LinhaCsv } from './lead-csv';
import { naoAusente } from './seller-availability';
import { decidirDonos } from './lead-distribution';
import {
  contarLote,
  empresaDoNegocio,
  podeForcar,
  preencherSemSobrescrever,
  vereditoDeBanco,
  violaProtecao,
  type ContadoresLote,
  type LinhaAvaliada,
  type MotivoDescarte,
} from './lead-import';

export interface ImportarLoteInput {
  /// Mercado que recebe o lote (ADR 037). O roteiro do SDR vive no mercado, então a
  /// lista precisa declarar o dela.
  productCode: string;
  name: string;
  source?: string;
  sourceDetail?: string;
  /// Base legal LGPD deste lote. Guardado por lote pra exposição ficar visível.
  consentBasis?: string;
  /// Importa também os "já na base". Único motivo forçável — `podeForcar()` é a
  /// autoridade, este flag só pede.
  forcarJaNaBase?: boolean;
  uploadedByUserId?: string;
  /// Prévia: roda a peneira inteira e devolve o relatório sem escrever nada. É o
  /// ponto do módulo 1 — o operador vê o que a lista vale ANTES de ela entrar. Sem
  /// isso ele descobre que a lista era ruim depois que ela já está dentro.
  dryRun?: boolean;
  /// A coluna `nome` desta lista é nome fantasia da empresa — ver `OpcoesDeParse`.
  /// Numa base exportada da Receita, todo "nome" é da empresa, e sem esta marca o
  /// disparo cumprimenta o lead de "Boa tarde, PEQLOG!".
  nomeEhDaEmpresa?: boolean;
}

export interface RelatorioImportacao {
  /// `null` em prévia: não existe lote, porque nada foi gravado.
  batchId: string | null;
  contadores: ContadoresLote;
  colunasIgnoradas: string[];
  /// Linhas descartadas com o número da linha no arquivo, pro operador achar no Excel.
  descartes: { linha: number; motivo: MotivoDescarte; forcavel: boolean }[];
}

type Linha = LinhaCsv & LinhaAvaliada;

@Injectable()
export class LeadImportService {
  private readonly logger = new Logger('LeadImport');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tms: TmsLookupService,
  ) {}

  async importar(
    tenantId: string,
    input: ImportarLoteInput,
    csv: string,
  ): Promise<RelatorioImportacao> {
    // O mercado precisa existir ANTES de qualquer coisa — inclusive da prévia. Um typo
    // no productCode gravaria a lista inteira (paga, mil linhas) apontando para um
    // mercado que não leva a nada: sem roteiro para o SDR, invisível na tela do
    // mercado certo, e o disparo por lote barrado pela trava. Mesma regra do
    // market-gate no disparo e do modelo de mensagem.
    const mercado = await this.prisma.product.findUnique({
      where: { code: input.productCode },
      select: { code: true },
    });
    if (!mercado) {
      throw new BadRequestException(
        `Mercado "${input.productCode}" não existe. Confira o código na tela de Mercados.`,
      );
    }

    const { linhas, colunasIgnoradas } = parseCsvDeLeads(csv, {
      nomeEhDaEmpresa: input.nomeEhDaEmpresa,
    });

    // A peneira de arquivo já rodou no parser (duplicado, sem canal utilizável).
    // Aqui entram os motivos que só o banco sabe.
    await this.peneiraDeBanco(tenantId, linhas, input.forcarJaNaBase === true);

    const contadores = contarLote(linhas);

    // Prévia: sai aqui, antes da primeira escrita. Tudo acima é leitura — parser,
    // consulta de contatos e lookup no TMS.
    if (input.dryRun) {
      return {
        batchId: null,
        contadores,
        colunasIgnoradas,
        descartes: this.descartesDe(linhas),
      };
    }

    // O lote nasce antes dos contatos: se a importação morrer no meio, o operador vê
    // um lote com contadores parciais em vez de nada — e sabe que precisa reimportar.
    const batch = await this.prisma.leadBatch.create({
      data: {
        tenantId,
        productCode: input.productCode,
        name: input.name,
        source: input.source ?? null,
        sourceDetail: input.sourceDetail ?? null,
        consentBasis: input.consentBasis ?? null,
        uploadedByUserId: input.uploadedByUserId ?? null,
        status: 'draft',
      },
    });

    const validas = linhas.filter((l) => !l.descarte);
    let gravados = 0;

    // Em blocos, e uma transação por lead — não uma transação gigante. Transação
    // interativa do Prisma tem timeout curto (5s por padrão): um lote de 1.000 leads
    // num único $transaction estoura e perde tudo, inclusive as 900 linhas que já
    // tinham dado certo.
    for (const bloco of blocos(validas, 50)) {
      for (const linha of bloco) {
        try {
          await this.gravarLead(tenantId, batch.id, input.productCode, linha);
          gravados += 1;
        } catch (e: any) {
          // Uma linha ruim não derruba o lote. Loga com o número da linha — sem isso
          // o operador vê "980 de 1000" e não tem como descobrir quais faltaram.
          this.logger.warn(
            `linha ${linha.linha} não gravada (lote ${batch.id}): ${e?.message ?? e}`,
          );
        }
      }
    }

    await this.prisma.leadBatch.update({
      where: { id: batch.id },
      data: {
        receivedCount: contadores.received,
        duplicateCount: contadores.duplicate,
        invalidCount: contadores.invalid,
        validCount: gravados, // o que entrou de fato, não o que era elegível
        noNameCount: contadores.noName,
        status: 'active',
      },
    });

    if (gravados !== contadores.valid) {
      this.logger.warn(
        `lote ${batch.id}: ${contadores.valid} elegíveis, ${gravados} gravados`,
      );
    }

    return {
      batchId: batch.id,
      contadores: { ...contadores, valid: gravados },
      colunasIgnoradas,
      descartes: this.descartesDe(linhas),
    };
  }

  /// Descartes com o número da linha no arquivo — é o que o operador vê no Excel. Sem
  /// isso, "linha inválida" manda ele contar na mão.
  private descartesDe(linhas: Linha[]) {
    return linhas
      .filter((l) => l.descarte)
      .map((l) => ({
        linha: l.linha,
        motivo: l.descarte as MotivoDescarte,
        forcavel: podeForcar(l.descarte as MotivoDescarte),
      }));
  }

  /**
   * Distribui os leads do lote entre os SDRs escolhidos.
   *
   * Sem isso o lote fica sem dono, e lead sem dono **não aparece para ninguém** na fila
   * do SDR — de propósito: dois SDRs no mesmo lead é briga de comissão e o lead achando
   * que é call center. Então a importação sozinha não coloca ninguém para trabalhar; é
   * este passo que faz isso.
   *
   * Reparte em rodízio pela ordem da lista. Não por "quem tem menos": no primeiro lote
   * do dia todo mundo tem zero, e balancear carga histórica faria um SDR receber tudo
   * porque estava de férias na semana passada.
   */
  async distribuir(
    tenantId: string,
    batchId: string,
    sellerIds: string[],
  ): Promise<{
    distribuidos: number;
    porVendedor: Record<string, number>;
    /// Quantos ficaram com o dono que o contato já tinha, fora do rodízio. É o que
    /// explica repartição desigual sem ser defeito.
    mantidosComDonoAtual: number;
  }> {
    if (!sellerIds.length) {
      throw new BadRequestException('Escolha ao menos um vendedor.');
    }

    const lote = await this.prisma.leadBatch.findFirst({ where: { id: batchId, tenantId } });
    if (!lote) throw new NotFoundException('Lote não encontrado.');

    // Só vendedor deste tenant, ativo, e vinculado ao mercado do lote: distribuir para
    // quem não trabalha o mercado entrega lead de pneus para quem só vende TMS.
    const vinculados = await this.prisma.sellerMarket.findMany({
      where: { tenantId, productCode: lote.productCode, sellerId: { in: sellerIds } },
      select: { sellerId: true },
    });
    const validos = await this.prisma.seller.findMany({
      // Ausente fica de fora: distribuir para quem está de férias é o lote inteiro
      // parado na mão dele até voltar, e ninguém descobre até cobrarem o resultado.
      where: {
        id: { in: vinculados.map((v) => v.sellerId) },
        tenantId,
        active: true,
        ...naoAusente(),
      },
      select: { id: true },
    });
    if (!validos.length) {
      throw new BadRequestException(
        'Nenhum dos vendedores escolhidos trabalha este mercado e está disponível hoje.',
      );
    }
    const alvos = validos.map((v) => v.id);

    // Filtra pelo lote DA OPORTUNIDADE, não pelo do contato. `Contact.batchId` guarda a
    // primeira lista que trouxe a pessoa e não muda: procurar por ele fazia a segunda
    // aparição do mesmo contato ficar de fora da distribuição do lote novo — sem dono e
    // invisível para todo SDR.
    //
    // Só o que ainda não tem dono. Redistribuir por engano tiraria lead da mão de quem
    // já começou a trabalhar nele.
    const fila = await this.prisma.opportunity.findMany({
      where: { tenantId, assignedSellerId: null, stage: 'new', batchId },
      select: { id: true, contactId: true },
      orderBy: { createdAt: 'asc' },
    });

    const contactIds = [...new Set(fila.map((f) => f.contactId).filter(Boolean) as string[])];
    const donoDoContato = await this.donosJaExistentes(tenantId, contactIds);
    // Quem saiu da empresa não segura carteira: o lead volta pro rodízio em vez de
    // ficar preso a um cadastro inativo. Ausência (férias) NÃO entra aqui de propósito
    // — ver `decidirDonos`.
    const donosCitados = [...new Set([...donoDoContato.values()].filter(Boolean) as string[])];
    const aindaNaCasa = new Set(
      (
        await this.prisma.seller.findMany({
          where: { id: { in: donosCitados }, tenantId, active: true },
          select: { id: true },
        })
      ).map((s) => s.id),
    );

    const destinos = decidirDonos(fila, { alvos, donoDoContato, aindaNaCasa });
    const porVendedor: Record<string, number> = Object.fromEntries(alvos.map((a) => [a, 0]));
    let respeitados = 0;

    // Uma transação por lead, como na importação: um $transaction único com centenas de
    // leads estoura o timeout de 5s do Prisma e desfaz o que já tinha dado certo.
    for (const d of destinos) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.opportunity.update({
            where: { id: d.id },
            data: { assignedSellerId: d.dono },
          });
          // Os dois campos de posse juntos: sem isso a resposta do lead no WhatsApp cai
          // num inbox e o trabalho fica em outro.
          //
          // Só quando a carteira estava vaga. Gravar sempre era o que trocava o dono do
          // contato pelo sorteado do lote novo, deixando a oportunidade antiga com o
          // dono antigo — o estado partido que punha dois SDRs no mesmo lead.
          if (d.contactId && d.carteiraVaga) {
            await tx.contact.update({
              where: { id: d.contactId },
              data: { ownerSellerId: d.dono },
            });
          }
        });
        porVendedor[d.dono] = (porVendedor[d.dono] ?? 0) + 1;
        if (!d.carteiraVaga) respeitados += 1;
      } catch (e: any) {
        this.logger.warn(`lead ${d.id} não distribuído: ${e?.message ?? e}`);
      }
    }

    const distribuidos = Object.values(porVendedor).reduce((a, b) => a + b, 0);
    // `respeitados` explica repartição desigual: lead que já tinha dono não passa pelo
    // rodízio. Sem o número no log, a diferença parece defeito da distribuição.
    this.logger.log(
      `lote ${batchId}: ${distribuidos} leads distribuídos entre ${alvos.length}` +
        (respeitados ? ` (${respeitados} mantidos com o dono que já tinham)` : ''),
    );
    return { distribuidos, porVendedor, mantidosComDonoAtual: respeitados };
  }

  /**
   * Dono que cada contato já tem. Duas fontes porque as duas existem no banco: o
   * `ownerSellerId` do contato e o `assignedSellerId` de uma oportunidade anterior.
   * Elas podem divergir — foi justamente o que o bug de sobrescrita produziu — então
   * ler só uma deixaria passar metade dos casos.
   */
  private async donosJaExistentes(
    tenantId: string,
    contactIds: string[],
  ): Promise<Map<string, string | null>> {
    const mapa = new Map<string, string | null>();
    if (!contactIds.length) return mapa;

    const contatos = await this.prisma.contact.findMany({
      where: { tenantId, id: { in: contactIds } },
      select: { id: true, ownerSellerId: true },
    });
    for (const c of contatos) if (c.ownerSellerId) mapa.set(c.id, c.ownerSellerId);

    const anteriores = await this.prisma.opportunity.findMany({
      where: { tenantId, contactId: { in: contactIds }, assignedSellerId: { not: null } },
      select: { contactId: true, assignedSellerId: true },
      orderBy: { createdAt: 'asc' },
    });
    // A mais ANTIGA vence: é quem começou a trabalhar o lead. `orderBy asc` + só
    // preencher o que falta faz isso sem comparar datas aqui.
    for (const a of anteriores) {
      if (a.contactId && !mapa.get(a.contactId)) mapa.set(a.contactId, a.assignedSellerId);
    }

    return mapa;
  }

  /// Histórico de lotes com os contadores. É o que responde "qual lista presta" —
  /// meses depois, comparando `Feira agosto` com `Lista comprada`.
  async listar(tenantId: string, productCode?: string) {
    return this.prisma.leadBatch.findMany({
      // Filtro por mercado: comparar "Feira agosto" (TMS) com uma lista de pneus não
      // responde nada — listas de mercados diferentes têm taxas que não se comparam.
      where: { tenantId, ...(productCode ? { productCode } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /// Motivos que dependem do banco: já na base, cliente, opt-out. Escreve o veredito
  /// direto nas linhas — em lote, nunca uma query por lead.
  private async peneiraDeBanco(
    tenantId: string,
    linhas: Linha[],
    forcarJaNaBase: boolean,
  ): Promise<void> {
    const candidatas = linhas.filter((l) => !l.descarte);
    if (!candidatas.length) return;

    const fones = [...new Set(candidatas.map((l) => l.phone).filter(Boolean))] as string[];
    const emails = [...new Set(candidatas.map((l) => l.email).filter(Boolean))] as string[];

    const existentes = await this.prisma.contact.findMany({
      where: {
        tenantId,
        OR: [
          fones.length ? { phone: { in: fones } } : undefined,
          emails.length ? { email: { in: emails } } : undefined,
        ].filter(Boolean) as any[],
      },
      select: {
        id: true,
        phone: true,
        email: true,
        status: true,
        optOutAt: true,
        emailBouncedAt: true,
        customerSince: true,
      },
    });

    const porFone = new Map(existentes.map((c) => [c.phone, c]));
    const porEmail = new Map(
      existentes.filter((c) => c.email).map((c) => [c.email as string, c]),
    );

    // A3 da auditoria: o unique de contacts é (tenantId, phone) e phone não é nullable,
    // então só existe UMA vaga para contato novo sem telefone ('' como chave). Antes, o
    // segundo lead só-de-e-mail estourava o unique e sumia num log de servidor — o
    // relatório dizia que ele tinha entrado. Agora a vaga é checada aqui e o excedente
    // vira descarte visível ('sem_telefone').
    const vagaSemFoneLivre =
      (await this.prisma.contact.findUnique({
        where: { tenantId_phone: { tenantId, phone: '' } },
        select: { id: true },
      })) === null;
    let vagaConsumida = false;

    // TMS: 2 queries pro lote inteiro, e Map indexado por telefone SEM o 55.
    //
    // Fail-CLOSED desde 16/08/2026. Antes seguia sem o TMS "porque travar a importação é
    // pior" — mas o que entra aqui vira lead na fila do SDR, e cliente pagante importado
    // como lead é alguém ligando para vender o produto que a pessoa já assina. A peneira
    // frouxa não é mais frouxa: é errada, e o erro só aparece na ligação.
    //
    // TMS não configurado continua passando: ali não há peneira a aplicar, e barrar
    // travaria ambiente que roda sem conector de propósito.
    const tms = await this.tms.batchLookupVerificado(fones);
    if (tms.falhou) {
      this.logger.error(`Importação recusada: consulta ao TMS indisponível (${tms.motivo})`);
      throw new BadRequestException(
        'Não foi possível consultar a base do HiperTMS para separar quem já é cliente. ' +
        'A lista não foi importada — sem essa checagem, clientes pagantes entrariam como ' +
        'lead novo na fila do SDR. Tente novamente em alguns minutos.',
      );
    }
    const noTms = tms.clientes;

    for (const linha of candidatas) {
      const existente =
        (linha.phone ? porFone.get(linha.phone) : undefined) ??
        (linha.email ? porEmail.get(linha.email) : undefined);

      // A decisão em si vive em `vereditoDeBanco` (puro, testado). Aqui só se junta
      // os fatos: o que o banco respondeu e o que o TMS respondeu.
      const veredito = vereditoDeBanco({
        temFone: !!linha.phone,
        temEmail: !!linha.email,
        existente: existente
          ? {
              optOutAt: existente.optOutAt,
              status: existente.status,
              emailBouncedAt: existente.emailBouncedAt,
              customerSince: existente.customerSince,
            }
          : null,
        // A chave do Map do TMS é o telefone SEM o 55 — por isso normaliza de novo
        // com o mesmo método que o `batchLookup` usou internamente. Duas
        // normalizações diferentes aqui e a peneira erra em silêncio: ou nenhum
        // cliente é pego, ou a lista inteira é descartada como cliente.
        estaNoTms: !!linha.phone && noTms.has(TmsLookupService.normalize(linha.phone)),
        forcarJaNaBase,
      });

      if (veredito.descartarEmail) linha.email = null;
      linha.descarte = veredito.descarte;

      // Lead válido sem telefone que NÃO atualiza um contato existente precisa da vaga
      // única de phone ''. O primeiro consome; os demais caem com motivo visível.
      if (!linha.descarte && !linha.phone && !existente) {
        if (vagaSemFoneLivre && !vagaConsumida) {
          vagaConsumida = true;
        } else {
          linha.descarte = 'sem_telefone';
        }
      }
    }
  }

  /// Contato + oportunidade de um lead, numa transação pequena. Reimportação preenche
  /// campo vazio e nunca sobrescreve — R2, o risco mais grave da feature.
  private async gravarLead(
    tenantId: string,
    batchId: string,
    productCode: string,
    linha: Linha,
  ): Promise<void> {
    // Sem telefone não existe chave: o unique do contato é (tenantId, phone). Lead só
    // de e-mail entra com o telefone vazio e o operador completa depois.
    const phone = linha.phone ?? '';

    await this.prisma.$transaction(async (tx) => {
      // Sem telefone, a chave de reencontro é o e-mail: sem esta busca, reimportar um
      // lead só-de-e-mail (ex.: com forcarJaNaBase) tentaria CRIAR de novo e estouraria
      // o unique de phone '' — o caso A3 da auditoria.
      const atual = phone
        ? await tx.contact.findUnique({
            where: { tenantId_phone: { tenantId, phone } },
          })
        : linha.email
          ? await tx.contact.findFirst({ where: { tenantId, email: linha.email } })
          : null;

      let contactId: string;

      if (atual) {
        const delta = preencherSemSobrescrever(atual as any, {
          name: linha.name,
          company: linha.company,
          email: linha.email,
          fleetSize: linha.fleetSize,
        } as any);

        // Guarda de segundo nível: se algum caminho futuro montar o delta de outro
        // jeito, isto derruba a escrita em vez de apagar dado da Lia em silêncio.
        const violados = violaProtecao(atual as any, delta);
        if (violados.length) {
          throw new Error(`R2: tentativa de sobrescrever ${violados.join(', ')}`);
        }

        contactId = atual.id;
        await tx.contact.update({
          where: { id: atual.id },
          // batchId só se ainda não tem: o lote de origem é o primeiro que trouxe.
          data: { ...delta, ...(atual.batchId ? {} : { batchId }) },
        });
      } else {
        const criado = await tx.contact.create({
          data: {
            tenantId,
            phone,
            name: linha.name,
            company: linha.company,
            email: linha.email, // null, nunca '' (ADR 021)
            fleetSize: linha.fleetSize,
            nameSource: linha.name ? 'lead' : null,
            source: 'lead_batch',
            batchId,
          },
        });
        contactId = criado.id;
      }

      // A ficha do contato manda no nome da empresa.
      //
      // `preencherSemSobrescrever` acima protege o que a ficha já tem — de propósito,
      // pra planilha não apagar o que a Lia levantou na conversa. Mas a oportunidade
      // era criada com o valor da PLANILHA sempre, então quando os dois discordavam a
      // ficha ficava com um nome e o negócio com outro. Na base real: o contato
      // b79373e6 é "Hipervias (teste interno)" na ficha e "Log Minas Transportes" nas
      // oportunidades — a fila do SDR lê a ficha, a tela de Oportunidades lê o negócio,
      // e a mesma empresa aparece com dois nomes.
      //
      // Herdar da ficha quando ela já tem valor faz os dois nascerem iguais.
      const empresaDoRegistro = empresaDoNegocio(atual?.company, linha.company);

      // Uma oportunidade por lead válido: é o que dá base ao funil por lote. Sem ela,
      // "qual lista presta" não tem de onde contar.
      await tx.opportunity.create({
        data: {
          tenantId,
          contactId,
          productCode,
          // O lote fica AQUI, não só no contato: é esta coluna que a distribuição usa, e
          // é o que faz a segunda aparição do mesmo contato ser encontrada pelo lote
          // novo em vez de sumir.
          batchId,
          phone: phone || null,
          name: linha.name,
          company: empresaDoRegistro,
          stage: 'new',
        },
      });
    });
  }
}

function* blocos<T>(itens: readonly T[], tamanho: number): Generator<T[]> {
  for (let i = 0; i < itens.length; i += tamanho) {
    yield itens.slice(i, i + tamanho);
  }
}
