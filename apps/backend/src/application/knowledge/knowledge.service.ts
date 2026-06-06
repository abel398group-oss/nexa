import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PaginationQueryDto, Paginated } from '@/shared/dto/pagination.dto';
import { ConnectorsService } from '@/application/connectors/connectors.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger('KnowledgeService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorsService,
  ) {}

  async findAll(tenantId: string, q: PaginationQueryDto): Promise<Paginated<any>> {
    const where: any = { tenantId };
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { content: { contains: q.search, mode: 'insensitive' } },
        { topic: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.aiKnowledgeBase.findMany({
        where,
        take: q.limit,
        skip: q.offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.aiKnowledgeBase.count({ where }),
    ]);
    return { items, total };
  }

  // Recupera os KB mais relevantes p/ uma pergunta (retrieval p/ a Lia).
  // Scoring textual simples (título>tags>tópico>conteúdo). pgvector entra depois.
  async retrieve(tenantId: string, query: string, topN = 3) {
    const all = await this.prisma.aiKnowledgeBase.findMany({ where: { tenantId } });
    const terms = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .split(/\W+/)
      .filter((t) => t.length >= 3);
    if (terms.length === 0) return [];

    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const scored = all
      .map((kb) => {
        const title = norm(kb.title);
        const content = norm(kb.content);
        const topic = norm(`${kb.topic} ${kb.category}`);
        const tags = norm((kb.tags ?? []).join(' '));
        let score = 0;
        for (const t of terms) {
          if (title.includes(t)) score += 3;
          if (tags.includes(t)) score += 2;
          if (topic.includes(t)) score += 2;
          if (content.includes(t)) score += 1;
        }
        return { kb, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    return scored.map((x) => ({
      id: x.kb.id,
      title: x.kb.title,
      content: x.kb.content,
      category: x.kb.category,
      score: x.score,
    }));
  }

  async findOne(tenantId: string, id: string) {
    const kb = await this.prisma.aiKnowledgeBase.findFirst({
      where: { id, tenantId },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!kb) throw new NotFoundException('Conhecimento não encontrado');
    return kb;
  }

  // cria KB + versão 1 (não aprovada — passa pela curadoria humana)
  async create(tenantId: string, dto: CreateKnowledgeDto, author = 'system') {
    return this.prisma.aiKnowledgeBase.create({
      data: {
        tenantId,
        productCode: dto.productCode,
        topic: dto.topic,
        category: dto.category,
        title: dto.title,
        content: dto.content,
        tags: dto.tags ?? [],
        versions: {
          create: { version: 1, content: dto.content, approved: false, author },
        },
      },
      include: { versions: true },
    });
  }

  // Importa conhecimento de um produto conectado (TMS) → idempotente por (tenant, title)
  async importFromConnector(tenantId: string, productCode: string) {
    const connector = this.connectors.get(productCode);
    const items = await connector.getKnowledge();
    let created = 0;
    let updated = 0;
    for (const it of items) {
      const existing = await this.prisma.aiKnowledgeBase.findFirst({
        where: { tenantId, title: it.title },
      });
      if (existing) {
        // novo conteúdo → nova versão (não aprovada) se mudou
        if (existing.content !== it.content) {
          const last = await this.prisma.aiKnowledgeVersion.findFirst({
            where: { knowledgeId: existing.id },
            orderBy: { version: 'desc' },
          });
          await this.prisma.aiKnowledgeVersion.create({
            data: {
              knowledgeId: existing.id,
              version: (last?.version ?? 0) + 1,
              content: it.content,
              approved: false,
              author: `connector:${productCode}`,
            },
          });
          updated++;
        }
        continue;
      }
      await this.create(tenantId, { ...it, productCode }, `connector:${productCode}`);
      created++;
    }
    this.logger.log(`Import ${productCode}: ${created} novos, ${updated} atualizados (${items.length} recebidos)`);
    return { source: productCode, received: items.length, created, updated };
  }

  async addVersion(tenantId: string, id: string, content: string, author = 'human') {
    await this.findOne(tenantId, id);
    const last = await this.prisma.aiKnowledgeVersion.findFirst({
      where: { knowledgeId: id },
      orderBy: { version: 'desc' },
    });
    return this.prisma.aiKnowledgeVersion.create({
      data: {
        knowledgeId: id,
        version: (last?.version ?? 0) + 1,
        content,
        approved: false,
        author,
      },
    });
  }

  // Aprova uma versão → vira o conteúdo "fonte de verdade" do KB (ADR 011)
  async approveVersion(tenantId: string, versionId: string, reviewer = 'human') {
    const version = await this.prisma.aiKnowledgeVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('Versão não encontrada');
    const kb = await this.prisma.aiKnowledgeBase.findFirst({
      where: { id: version.knowledgeId, tenantId },
    });
    if (!kb) throw new NotFoundException('Conhecimento não encontrado');

    const [approved] = await this.prisma.$transaction([
      this.prisma.aiKnowledgeVersion.update({
        where: { id: versionId },
        data: { approved: true, reviewer, approvedAt: new Date() },
      }),
      this.prisma.aiKnowledgeBase.update({
        where: { id: kb.id },
        data: { content: version.content },
      }),
    ]);
    return approved;
  }
}
