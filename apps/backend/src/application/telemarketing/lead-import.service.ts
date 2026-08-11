import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';
import { parseCsvDeLeads, type LinhaCsv } from './lead-csv';
import { naoAusente } from './seller-availability';
import {
  contarLote,
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
    const { linhas, colunasIgnoradas } = parseCsvDeLeads(csv);

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
  ): Promise<{ distribuidos: number; porVendedor: Record<string, number> }> {
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

    // `Opportunity` não declara relação com `Contact` — só guarda `contactId`. Então o
    // recorte "leads deste lote" vem dos contatos, e a oportunidade é filtrada por id.
    const contatosDoLote = await this.prisma.contact.findMany({
      where: { tenantId, batchId },
      select: { id: true },
    });
    if (!contatosDoLote.length) return { distribuidos: 0, porVendedor: {} };

    // Só o que ainda não tem dono. Redistribuir por engano tiraria lead da mão de quem
    // já começou a trabalhar nele.
    const fila = await this.prisma.opportunity.findMany({
      where: {
        tenantId,
        assignedSellerId: null,
        stage: 'new',
        contactId: { in: contatosDoLote.map((c) => c.id) },
      },
      select: { id: true, contactId: true },
      orderBy: { createdAt: 'asc' },
    });

    const porVendedor: Record<string, number> = Object.fromEntries(alvos.map((a) => [a, 0]));

    // Uma transação por lead, como na importação: um $transaction único com centenas de
    // leads estoura o timeout de 5s do Prisma e desfaz o que já tinha dado certo.
    for (let i = 0; i < fila.length; i += 1) {
      const dono = alvos[i % alvos.length];
      const o = fila[i];
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.opportunity.update({
            where: { id: o.id },
            data: { assignedSellerId: dono },
          });
          // Os dois campos de posse juntos: sem isso a resposta do lead no WhatsApp cai
          // num inbox e o trabalho fica em outro.
          if (o.contactId) {
            await tx.contact.update({
              where: { id: o.contactId },
              data: { ownerSellerId: dono },
            });
          }
        });
        porVendedor[dono] += 1;
      } catch (e: any) {
        this.logger.warn(`lead ${o.id} não distribuído: ${e?.message ?? e}`);
      }
    }

    const distribuidos = Object.values(porVendedor).reduce((a, b) => a + b, 0);
    this.logger.log(`lote ${batchId}: ${distribuidos} leads distribuídos entre ${alvos.length}`);
    return { distribuidos, porVendedor };
  }

  /// Histórico de lotes com os contadores. É o que responde "qual lista presta" —
  /// meses depois, comparando `Feira agosto` com `Lista comprada`.
  async listar(tenantId: string) {
    return this.prisma.leadBatch.findMany({
      where: { tenantId },
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
    const noTms = await this.tms
      .batchLookup(fones)
      .catch((e: any) => {
        // TMS fora do ar não pode travar importação: sem ele a peneira fica mais
        // frouxa, e isso é melhor que o operador não conseguir subir lista nenhuma.
        this.logger.warn(`lookup TMS falhou, seguindo sem ele: ${e?.message ?? e}`);
        return new Map<string, unknown>();
      });

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

      // Uma oportunidade por lead válido: é o que dá base ao funil por lote. Sem ela,
      // "qual lista presta" não tem de onde contar.
      await tx.opportunity.create({
        data: {
          tenantId,
          contactId,
          productCode,
          phone: phone || null,
          name: linha.name,
          company: linha.company,
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
