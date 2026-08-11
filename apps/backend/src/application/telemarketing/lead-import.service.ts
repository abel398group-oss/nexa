import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';
import { parseCsvDeLeads, type LinhaCsv } from './lead-csv';
import {
  contarLote,
  podeForcar,
  preencherSemSobrescrever,
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
}

export interface RelatorioImportacao {
  batchId: string;
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
      descartes: linhas
        .filter((l) => l.descarte)
        .map((l) => ({
          linha: l.linha,
          motivo: l.descarte as MotivoDescarte,
          forcavel: podeForcar(l.descarte as MotivoDescarte),
        })),
    };
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

      // Ordem de precedência, e ela importa: `cliente` ganha de `já na base` porque
      // é mais informativo e, ao contrário dele, não é forçável. Reportar o motivo
      // frouxo deixaria o operador achar que dá pra forçar.
      const ehCliente =
        !!existente?.customerSince ||
        (!!linha.phone && noTms.has(TmsLookupService.normalize(linha.phone)));
      if (ehCliente) {
        linha.descarte = 'cliente';
        continue;
      }

      if (existente?.optOutAt || existente?.status === 'opted_out') {
        linha.descarte = 'opt_out'; // LGPD, e `podeForcar` recusa
        continue;
      }

      // Hard bounce NÃO descarta o lead: endereço morto não invalida o WhatsApp do
      // mesmo contato (ver comentário de `emailBouncedAt` no schema). Só apaga o
      // e-mail desta importação — e se o e-mail era o único canal, a linha cai.
      if (existente?.emailBouncedAt && linha.email) {
        linha.email = null;
        if (!linha.phone) {
          linha.descarte = 'email_invalido';
          continue;
        }
      }

      if (existente) {
        if (!forcarJaNaBase || !podeForcar('ja_na_base')) {
          linha.descarte = 'ja_na_base';
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
      const atual = phone
        ? await tx.contact.findUnique({
            where: { tenantId_phone: { tenantId, phone } },
          })
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
