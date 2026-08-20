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
import { KnowledgeService } from '@/application/knowledge/knowledge.service';

/** Teto do ROTEIRO. Os planos reais têm 5–15 KB; 512 KB é folga, não convite. */
export const TAMANHO_MAXIMO = 512 * 1024;

/**
 * Teto do que o roteiro publica na base de conhecimento. É o mesmo teto do artigo
 * escrito à mão (CreateKnowledgeDto): o conteúdo recuperado entra INTEIRO no
 * contexto da Lia a cada consulta — um plano de 512 KB viraria custo de token e
 * resposta pior em toda conversa do mercado.
 */
const TETO_PUBLICACAO_LIA = 50_000;

/** O elo entre o material e o artigo derivado dele na base de conhecimento. */
const tagDoAsset = (assetId: string) => `asset:${assetId}`;

/**
 * Resolve o `/uploads/...` gravado no banco para a URL que o NAVEGADOR alcança.
 *
 * O banco guarda o caminho relativo de propósito (o domínio muda por ambiente),
 * e o DISPARO já monta a URL com MEDIA_PUBLIC_BASE na hora do envio — mas as
 * telas recebiam o relativo cru. Em dev funciona (o Vite faz proxy de /uploads
 * para o backend); em produção o nginx do frontend não conhece /uploads e
 * devolve o index.html do app — o operador via o Nexa DENTRO do quadro de
 * pré-visualização no lugar do PDF que subiu. Mesma base, mesmo comportamento
 * do anexo de campanha: se um chega, o outro chega.
 */
export function urlPublicaDoArquivo(fileUrl: string | null): string | null {
  if (!fileUrl || fileUrl.startsWith('http')) return fileUrl;
  const base = (process.env.MEDIA_PUBLIC_BASE || process.env.NEXA_PUBLIC_URL || '').replace(/\/$/, '');
  if (!base) return fileUrl; // dev: o proxy do Vite resolve o relativo
  return base + (fileUrl.startsWith('/') ? '' : '/') + fileUrl;
}

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
  ) {}

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
    const linhas = await this.prisma.marketAsset.findMany({
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
    return linhas.map((l: any) => ({ ...l, fileUrl: urlPublicaDoArquivo(l.fileUrl) }));
  }

  /**
   * Material JÁ APROVADO do mercado — o que o SDR e o closer podem ver.
   *
   * Diferente de `listar()`: aqui o `content` vem junto. São poucos arquivos por
   * mercado (um roteiro, um punhado de portfólios) e quem chama precisa LER o
   * roteiro na tela, não só listar nome e tamanho.
   */
  async listarAprovados(tenantId: string, productCode: string) {
    const linhas = await this.prisma.marketAsset.findMany({
      where: { tenantId, productCode, status: 'approved' },
      select: {
        id: true, name: true, kind: true, content: true, fileUrl: true,
        mimeType: true, sizeBytes: true, approvedAt: true,
      },
      orderBy: { name: 'asc' },
    });
    return linhas.map((l: any) => ({ ...l, fileUrl: urlPublicaDoArquivo(l.fileUrl) }));
  }

  /** O texto de um arquivo — só quando alguém abre para revisar. */
  async ler(tenantId: string, id: string) {
    const asset = await this.prisma.marketAsset.findFirst({ where: { id, tenantId } });
    if (!asset) throw new NotFoundException('Material não encontrado');
    return { ...asset, fileUrl: urlPublicaDoArquivo(asset.fileUrl) };
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

    // Se já existia aprovado, o artigo derivado sai da Lia ANTES do texto novo
    // entrar — versão nova pendente com a antiga ainda respondendo é o mesmo furo
    // do "aprovar ontem, trocar hoje".
    const anterior = await this.prisma.marketAsset.findFirst({
      where: { tenantId, productCode, name },
      select: { id: true },
    });
    if (anterior) await this.tirarDaLia(tenantId, anterior.id);

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

    // Mesmo cuidado do roteiro: se um plan aprovado de mesmo nome vira portfólio,
    // o artigo derivado dele não pode ficar respondendo pela Lia.
    const anterior = await this.prisma.marketAsset.findFirst({
      where: { tenantId, productCode, name },
      select: { id: true },
    });
    if (anterior) await this.tirarDaLia(tenantId, anterior.id);

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
   * Corrige um material sem sair da revisão.
   *
   * É o caso comum: lendo para aprovar, aparece um erro de digitação, um número
   * errado, um nome de arquivo confuso. Mandar a pessoa voltar ao computador, editar
   * o `.md` e arrastar de novo é o caminho que faz ela aprovar assim mesmo.
   *
   * Editar DERRUBA a aprovação, pelo mesmo motivo que reenviar derruba: o que foi
   * lido e o que está gravado precisam ser a mesma coisa. Quem corrige está com o
   * texto na frente, então reaprovar é um clique — e não perde a garantia.
   *
   * Portfólio só aceita renomear: os bytes do PDF não se editam por aqui, e trocar o
   * arquivo é subir de novo.
   */
  async editar(
    tenantId: string,
    id: string,
    dto: { name?: string; content?: string },
  ) {
    const asset = await this.prisma.marketAsset.findFirst({ where: { id, tenantId } });
    if (!asset) throw new NotFoundException('Material não encontrado');

    const data: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('O nome não pode ficar vazio.');

      // A extensão continua mandando no tipo: um roteiro renomeado para `.pdf` viraria
      // um texto que a tela tenta abrir num visualizador de PDF.
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
      if (asset.kind === 'plan' && !EXTENSOES.includes(ext)) {
        throw new BadRequestException(`Roteiro precisa terminar em ${EXTENSOES.join(', ')}.`);
      }
      if (name !== asset.name) {
        const jaExiste = await this.prisma.marketAsset.findFirst({
          where: { tenantId, productCode: asset.productCode, name },
          select: { id: true },
        });
        // Checado antes do update: o unique devolveria P2002, que sem tratamento vira
        // 500 — e quem renomeou precisa saber que o nome já é de outro arquivo.
        if (jaExiste) throw new BadRequestException(`Já existe "${name}" neste mercado.`);
      }
      data.name = name;
    }

    if (dto.content !== undefined) {
      if (asset.kind !== 'plan') {
        throw new BadRequestException('Portfólio não se edita por aqui — suba o arquivo novo.');
      }
      const sizeBytes = Buffer.byteLength(dto.content, 'utf8');
      if (sizeBytes === 0) throw new BadRequestException('O texto não pode ficar vazio.');
      if (sizeBytes > TAMANHO_MAXIMO) {
        throw new BadRequestException(
          `O texto tem ${Math.round(sizeBytes / 1024)} KB — o limite é ${TAMANHO_MAXIMO / 1024} KB.`,
        );
      }
      data.content = dto.content;
      data.sizeBytes = sizeBytes;
    }

    if (!Object.keys(data).length) return asset;

    // Editar derruba a aprovação — então o artigo derivado sai da Lia junto.
    await this.tirarDaLia(tenantId, id);

    // Renomear também derruba: o nome é o que o operador reconhece na lista, e um
    // "aprovado" carimbado num nome que mudou depois diz menos do que parece.
    const atualizado = await this.prisma.marketAsset.update({
      where: { id },
      data: { ...data, status: 'pending', approvedAt: null, approvedBy: null },
    });
    this.logger.log(`Material "${asset.name}" editado — voltou para aprovação`);
    return atualizado;
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

    // A publicação vem ANTES do carimbo, de propósito. "Aprovado" na tela sempre
    // prometeu "a Lia usa" — e até 19/08/2026 nada cumpria: o aprovado só chegava
    // às telas do SDR e do closer, e a Lia seguia lendo apenas a base de
    // conhecimento. Se a publicação falhar (embedding fora do ar), o material fica
    // pendente e o erro aparece — melhor que um "aprovado" que a Lia não vê.
    await this.publicarParaLia(tenantId, asset, userId);

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

    // Da Lia primeiro, do carimbo depois: se a limpeza falhar, nada muda — pior
    // que a falha seria um artigo aprovado sobrando de um material pendente.
    await this.tirarDaLia(tenantId, id);

    return this.prisma.marketAsset.update({
      where: { id },
      data: { status: 'pending', approvedAt: null, approvedBy: null },
    });
  }

  async remover(tenantId: string, id: string) {
    const asset = await this.prisma.marketAsset.findFirst({ where: { id, tenantId } });
    if (!asset) throw new NotFoundException('Material não encontrado');

    await this.tirarDaLia(tenantId, id);
    await this.prisma.marketAsset.delete({ where: { id } });
    this.logger.warn(`Material "${asset.name}" removido de ${asset.productCode}`);
    return { ok: true, id };
  }

  /**
   * Publica o roteiro aprovado na base de conhecimento — o que a Lia de fato lê.
   *
   * Um artigo por arquivo, amarrado pela tag `asset:<id>`: reaprovar o mesmo
   * roteiro atualiza o artigo (e o embedding) em vez de acumular cópias.
   * Categoria `vendas` porque é a trilha que o agente de vendas consulta
   * (knowledge-tracks.const.ts) — fora dela o artigo existiria e a Lia não o
   * alcançaria, que é o mesmo furo com outra roupa. Portfólio não entra: PDF e
   * imagem são para o vendedor mostrar, não para a Lia citar.
   */
  private async publicarParaLia(
    tenantId: string,
    asset: { id: string; kind: string; name: string; content: string | null; productCode: string },
    userId?: string,
  ) {
    if (asset.kind !== 'plan' || !asset.content) return;

    let content = asset.content;
    if (Buffer.byteLength(content, 'utf8') > TETO_PUBLICACAO_LIA) {
      // Truncar avisando é melhor que recusar: o roteiro gigante continua íntegro
      // no material — só o que vai ao contexto da Lia é cortado.
      content = content.slice(0, TETO_PUBLICACAO_LIA);
      this.logger.warn(
        `Roteiro "${asset.name}" passa de ${TETO_PUBLICACAO_LIA / 1000} mil caracteres — publicado truncado para a Lia`,
      );
    }

    const title = `Roteiro de campanha — ${asset.name}`;
    const existente = await this.prisma.aiKnowledgeBase.findFirst({
      where: { tenantId, tags: { has: tagDoAsset(asset.id) } },
      select: { id: true },
    });

    if (existente) {
      await this.knowledge.update(tenantId, existente.id, { title, content });
    } else {
      await this.knowledge.create(
        tenantId,
        {
          topic: 'campanha',
          category: 'vendas',
          title,
          content,
          productCode: asset.productCode,
          tags: [tagDoAsset(asset.id), 'roteiro-campanha'],
        },
        userId ?? 'validacao-campanha',
        true, // já foi lido e aprovado por uma pessoa — é exatamente o que autoApprove pede
      );
    }
    this.logger.log(`Roteiro "${asset.name}" publicado para a Lia (${asset.productCode})`);
  }

  /** Remove o artigo derivado — chamado sempre que o material deixa de valer. */
  private async tirarDaLia(tenantId: string, assetId: string) {
    const existente = await this.prisma.aiKnowledgeBase.findFirst({
      where: { tenantId, tags: { has: tagDoAsset(assetId) } },
      select: { id: true },
    });
    if (existente) await this.knowledge.remove(tenantId, existente.id);
  }
}
