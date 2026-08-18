/**
 * market-assets.service.ts — material de campanha do mercado (ADR 037).
 *
 * O plano de campanha nasce fora do Nexa: alguém escreve `.md` numa pasta, por eixo
 * (cotações, pneus, financeiro). Até aqui esse arquivo não tinha lugar no sistema —
 * quem montava a campanha abria fora, copiava o texto e colava na tela de Mensagens.
 * O plano, que é a FONTE, ficava de fora, e a Lia nunca via.
 *
 * Regra central: material sobe em `pending` e não vale nada até alguém aprovar. Não é
 * burocracia — é a mesma ideia da trava de liberação do mercado. Texto que entra já
 * valendo é texto que ninguém leu, falando com o lead.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

/** Teto do ROTEIRO. Os planos reais têm 5–15 KB; 512 KB é folga, não convite. */
export const TAMANHO_MAXIMO = 512 * 1024;

/// Roteiro é texto e mora na linha. PDF chega pelo outro caminho (`subirPortfolio`),
/// porque binário numa coluna `text` só quebra na hora de mostrar.
const EXTENSOES = ['.md', '.txt', '.markdown'];

export interface SubirAssetInput {
  name: string;
  content: string;
}

/**
 * Portfólio já gravado em disco pelo multer — a rota entrega o caminho relativo.
 *
 * Relativo, e não a URL inteira: o endereço público é montado no envio com
 * MEDIA_PUBLIC_BASE, e gravar o domínio aqui congelaria no banco um valor que muda
 * de ambiente. Mesma regra do anexo da campanha.
 */
export interface SubirPortfolioInput {
  name: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class MarketAssetsService {
  private readonly logger = new Logger('MarketAssets');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Material do mercado, pendente primeiro.
   *
   * O que precisa de ação vem no topo: a lista existe para ser trabalhada até zerar,
   * e enterrar o pendente embaixo do aprovado é como ele fica lá para sempre.
   *
   * `content` sai FORA da listagem. São sete arquivos de até 15 KB; mandar todos em
   * toda abertura da tela é ~100 KB por render para exibir nome e tamanho.
   */
  async listar(tenantId: string, productCode: string, kind?: 'plan' | 'portfolio') {
    return this.prisma.marketAsset.findMany({
      where: { tenantId, productCode, ...(kind ? { kind } : {}) },
      select: {
        id: true,
        name: true,
        kind: true,
        fileUrl: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        approvedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      // `desc` para o pendente vir primeiro: a ordenação é alfabética e "pending" >
      // "approved". Escrito assim porque é o que o Postgres faz — a intenção fica no
      // teste, que afirma a ORDEM na tela e não o parâmetro.
      orderBy: [{ status: 'desc' }, { name: 'asc' }],
    });
  }

  /** O texto de um arquivo — só quando alguém abre para revisar. */
  async ler(tenantId: string, id: string) {
    const asset = await this.prisma.marketAsset.findFirst({ where: { id, tenantId } });
    if (!asset) throw new NotFoundException('Material não encontrado');
    return asset;
  }

  /**
   * Sobe (ou atualiza) um arquivo de texto.
   *
   * Mesmo nome no mesmo mercado é CORREÇÃO, não cópia: o operador ajusta o plano e
   * arrasta de novo. Sem isso a lista acumula duas versões do mesmo nome e ninguém
   * sabe qual a Lia está lendo.
   *
   * E a atualização DERRUBA a aprovação. É o ponto todo da aprovação: aprovar o
   * conteúdo antigo e deixar o novo entrar por baixo seria pior que não ter aprovação
   * nenhuma — daria a garantia sem cumpri-la.
   */
  async subir(tenantId: string, productCode: string, input: SubirAssetInput) {
    const market = await this.prisma.product.findUnique({ where: { code: productCode } });
    if (!market) throw new NotFoundException('Mercado não encontrado');

    const name = input.name.trim();
    if (!name) throw new BadRequestException('O arquivo precisa de um nome.');

    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    if (!EXTENSOES.includes(ext)) {
      throw new BadRequestException(
        `Só aceito texto por enquanto (${EXTENSOES.join(', ')}). "${name}" ficou de fora.`,
      );
    }

    const content = input.content;
    // Medido em BYTES, não em caracteres: acento ocupa 2, e um plano cheio de "ç" e
    // "ã" passaria batido por uma checagem de `length` e estouraria no banco.
    const sizeBytes = Buffer.byteLength(content, 'utf8');
    if (sizeBytes === 0) throw new BadRequestException(`"${name}" está vazio.`);
    if (sizeBytes > TAMANHO_MAXIMO) {
      throw new BadRequestException(
        `"${name}" tem ${Math.round(sizeBytes / 1024)} KB — o limite é ${TAMANHO_MAXIMO / 1024} KB.`,
      );
    }

    const asset = await this.prisma.marketAsset.upsert({
      where: { tenantId_productCode_name: { tenantId, productCode, name } },
      create: { tenantId, productCode, name, kind: 'plan', content, sizeBytes, status: 'pending' },
      update: { content, sizeBytes, status: 'pending', approvedAt: null, approvedBy: null },
    });

    this.logger.log(`Roteiro "${name}" (${sizeBytes}B) em ${productCode} — aguardando aprovação`);
    return asset;
  }

  /**
   * Registra um portfólio que o multer já gravou em disco.
   *
   * Mesma regra do roteiro: nasce pendente, e reenviar o mesmo nome derruba a
   * aprovação. Substituir o folder por uma versão nova sem revisar seria o mesmo furo
   * do texto, só que mais difícil de notar — ninguém relê um PDF por acidente.
   */
  async subirPortfolio(tenantId: string, productCode: string, input: SubirPortfolioInput) {
    const market = await this.prisma.product.findUnique({ where: { code: productCode } });
    if (!market) throw new NotFoundException('Mercado não encontrado');

    const name = input.name.trim();
    if (!name) throw new BadRequestException('O arquivo precisa de um nome.');

    const asset = await this.prisma.marketAsset.upsert({
      where: { tenantId_productCode_name: { tenantId, productCode, name } },
      create: {
        tenantId, productCode, name, kind: 'portfolio',
        fileUrl: input.fileUrl, mimeType: input.mimeType, sizeBytes: input.sizeBytes,
        status: 'pending',
      },
      update: {
        kind: 'portfolio',
        fileUrl: input.fileUrl, mimeType: input.mimeType, sizeBytes: input.sizeBytes,
        // Some o texto se a linha era um roteiro com o mesmo nome — o tipo mudou.
        content: null,
        status: 'pending', approvedAt: null, approvedBy: null,
      },
    });

    this.logger.log(`Portfólio "${name}" (${input.sizeBytes}B) em ${productCode} — aguardando aprovação`);
    return asset;
  }

  /**
   * Aprova. A partir daqui a Lia pode usar o texto e o vendedor o enxerga.
   *
   * Guarda QUEM aprovou: quando um número errado chegar ao lead, a pergunta vai ser
   * quem leu isto e disse que estava certo.
   */
  async aprovar(tenantId: string, id: string, userId?: string) {
    const asset = await this.prisma.marketAsset.findFirst({ where: { id, tenantId } });
    if (!asset) throw new NotFoundException('Material não encontrado');
    if (asset.status === 'approved') return asset;

    const atualizado = await this.prisma.marketAsset.update({
      where: { id },
      data: { status: 'approved', approvedAt: new Date(), approvedBy: userId ?? null },
    });
    this.logger.log(`Material "${asset.name}" aprovado em ${asset.productCode}`);
    return atualizado;
  }

  /** Volta para pendente — some da Lia sem perder o texto. */
  async reprovar(tenantId: string, id: string) {
    const asset = await this.prisma.marketAsset.findFirst({ where: { id, tenantId } });
    if (!asset) throw new NotFoundException('Material não encontrado');

    return this.prisma.marketAsset.update({
      where: { id },
      data: { status: 'pending', approvedAt: null, approvedBy: null },
    });
  }

  async remover(tenantId: string, id: string) {
    const asset = await this.prisma.marketAsset.findFirst({ where: { id, tenantId } });
    if (!asset) throw new NotFoundException('Material não encontrado');

    await this.prisma.marketAsset.delete({ where: { id } });
    this.logger.warn(`Material "${asset.name}" removido de ${asset.productCode}`);
    return { ok: true, id };
  }
}
