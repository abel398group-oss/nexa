import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PaginationQueryDto, Paginated } from '@/shared/dto/pagination.dto';
import { ConnectorsService } from '@/application/connectors/connectors.service';
import { EmbeddingsService, EMBEDDING_MODEL } from '@/shared/ai/embeddings.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';

// Cache em memória por tenantId — evita recarregar a base a cada mensagem recebida em pico
// TTL: 30s. Invalidado automaticamente após qualquer escrita (create/update/delete).
interface KbCacheEntry { items: any[]; expiresAt: number; }

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger('KnowledgeService');
  private readonly retrieveCache = new Map<string, KbCacheEntry>();
  private readonly CACHE_TTL_MS = 30_000; // 30 segundos

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorsService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  private invalidateCache(tenantId: string) {
    this.retrieveCache.delete(tenantId);
  }

  async findAll(tenantId: string, q: PaginationQueryDto, category?: string): Promise<Paginated<any>> {
    const where: any = { tenantId };
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { content: { contains: q.search, mode: 'insensitive' } },
        { topic: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (category) where.category = category;
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
  // 1ª opção: busca SEMÂNTICA (pgvector + embeddings e5-small) — entende sinônimo/paráfrase.
  // Fallback: scoring TEXTUAL (título>tags>tópico>conteúdo) se embeddings indisponível
  // ou se ainda não há vetores indexados (rodar reindex após a migração).
  async retrieve(tenantId: string, query: string, topN = 3, opts?: { excludeCategories?: string[] }) {
    const ex = opts?.excludeCategories ?? [];
    // ── BUSCA SEMÂNTICA ──────────────────────────────────────────────────────
    if (this.embeddings.enabled && query?.trim()) {
      try {
        const vec = await this.embeddings.embed(query, 'query');
        if (vec) {
          const lit = EmbeddingsService.toVectorLiteral(vec);
          const exClause = ex.length ? ' AND NOT (category = ANY($4::text[]))' : '';
          const params: any[] = ex.length ? [lit, tenantId, topN, ex] : [lit, tenantId, topN];
          const rows = (await this.prisma.$queryRawUnsafe(
            `SELECT id, title, content, category, 1 - (embedding <=> $1::vector) AS score
               FROM ai_knowledge_base
              WHERE tenant_id = $2 AND embedding IS NOT NULL${exClause}
              ORDER BY embedding <=> $1::vector
              LIMIT $3`,
            ...params,
          )) as any[];
          if (rows && rows.length > 0) {
            return rows.map((r: any) => ({
              id: r.id,
              title: r.title,
              content: r.content,
              category: r.category,
              score: Number(r.score),
            }));
          }
          // sem linhas com embedding ainda → cai no textual (precisa reindexar)
        }
      } catch (e: any) {
        this.logger.warn(`retrieve semântico falhou (${e?.message}) — usando textual`);
      }
    }

    // ── FALLBACK TEXTUAL ─────────────────────────────────────────────────────
    // Cache em memória 30s por tenantId — evita recarregar toda a base a cada mensagem.
    const now = Date.now();
    const cached = this.retrieveCache.get(tenantId);
    let all: any[];
    if (cached && cached.expiresAt > now) {
      all = cached.items;
    } else {
      all = await this.prisma.aiKnowledgeBase.findMany({
        where: { tenantId },
        take: 100,
        orderBy: { createdAt: 'desc' }, // prioriza artigos mais recentes no corte
      });
      this.retrieveCache.set(tenantId, { items: all, expiresAt: now + this.CACHE_TTL_MS });
    }
    const terms = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .split(/\W+/)
      .filter((t) => t.length >= 3);
    if (terms.length === 0) return [];

    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const exSet = new Set(ex);
    const pool = exSet.size ? all.filter((kb) => !exSet.has(kb.category)) : all;
    const scored = pool
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
    this.invalidateCache(tenantId);
    const created = await this.prisma.aiKnowledgeBase.create({
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
    await this.storeEmbedding(created.id, created.title, created.content);
    return created;
  }

  // edita o conteúdo do conhecimento direto (uso pelo painel)
  async update(
    tenantId: string,
    id: string,
    dto: { title?: string; content?: string; topic?: string; category?: string; tags?: string[] },
  ) {
    this.invalidateCache(tenantId);
    await this.findOne(tenantId, id);
    const updated = await this.prisma.aiKnowledgeBase.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.topic !== undefined ? { topic: dto.topic } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      },
    });
    // título/conteúdo mudaram → regenera o vetor semântico
    if (dto.title !== undefined || dto.content !== undefined) {
      await this.storeEmbedding(updated.id, updated.title, updated.content);
    }
    return updated;
  }

  async remove(tenantId: string, id: string) {
    this.invalidateCache(tenantId);
    await this.findOne(tenantId, id);
    await this.prisma.aiKnowledgeVersion.deleteMany({ where: { knowledgeId: id } });
    await this.prisma.aiKnowledgeBase.delete({ where: { id } });
    return { ok: true };
  }

  // Exclusão em lote de ITENS (não versões) — escopado por tenant.
  async deleteItems(tenantId: string, ids: string[]) {
    if (!ids?.length) return { deleted: 0 };
    this.invalidateCache(tenantId);
    // só apaga itens do próprio tenant
    const owned = await this.prisma.aiKnowledgeBase.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true },
    });
    const ownedIds = owned.map((o: any) => o.id);
    if (!ownedIds.length) return { deleted: 0 };
    await this.prisma.aiKnowledgeVersion.deleteMany({ where: { knowledgeId: { in: ownedIds } } });
    const r = await this.prisma.aiKnowledgeBase.deleteMany({ where: { id: { in: ownedIds }, tenantId } });
    return { deleted: r.count };
  }

  // Importa conhecimento de um produto conectado (TMS) → idempotente por (tenant, title)
  // P6 fix: substituído o findFirst dentro do loop (N queries seriais) por
  // um único findMany com map em memória O(1) — de N queries para 1.
  async importFromConnector(tenantId: string, productCode: string) {
    const connector = this.connectors.get(productCode);
    const items = await connector.getKnowledge();

    // 1 query busca todos os títulos existentes de uma vez
    const existingList = await this.prisma.aiKnowledgeBase.findMany({
      where: { tenantId, title: { in: items.map((i) => i.title) } },
      select: { id: true, title: true, content: true },
    });
    const existingMap = new Map(existingList.map((e: any) => [e.title, e]));

    let created = 0;
    let updated = 0;
    for (const it of items) {
      const existing = existingMap.get(it.title);
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
    this.invalidateCache(tenantId);
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
    this.invalidateCache(tenantId);
    // conteúdo "fonte de verdade" mudou → regenera o vetor semântico
    await this.storeEmbedding(kb.id, kb.title, version.content);
    return approved;
  }

  // ── EMBEDDINGS (RAG) ───────────────────────────────────────────────────────

  // Gera e grava o vetor de um item (título + conteúdo). No-op se embeddings indisponível.
  private async storeEmbedding(id: string, title: string, content: string) {
    if (!this.embeddings.enabled) return;
    const vec = await this.embeddings.embed(`${title}\n${content}`, 'passage');
    if (!vec) return;
    const lit = EmbeddingsService.toVectorLiteral(vec);
    await this.prisma
      .$executeRawUnsafe(
        `UPDATE ai_knowledge_base SET embedding = $1::vector, embedding_model = $2 WHERE id = $3`,
        lit,
        EMBEDDING_MODEL,
        id,
      )
      .catch((e: any) => this.logger.warn(`storeEmbedding(${id}) falhou: ${e?.message}`));
  }

  // Status de visibilidade do RAG (embeddings + pgvector) p/ o painel/diagnóstico.
  // "indexed" usa embeddingModel (coluna Prisma-friendly) como proxy de "tem vetor",
  // já que storeEmbedding() só grava embeddingModel junto com o vetor gravado via SQL
  // bruto (embedding é Unsupported("vector") — não filtrável pelo client normal).
  async getEmbeddingsStatus(tenantId: string) {
    const embeddingsStatus = this.embeddings.getStatus();

    const pgvectorRows = await this.prisma
      .$queryRawUnsafe(`SELECT 1 FROM pg_extension WHERE extname = 'vector'`)
      .catch((e: any) => {
        this.logger.warn(`Verificação da extensão pgvector falhou: ${e?.message}`);
        return null;
      });
    const pgvectorAvailable = Array.isArray(pgvectorRows) ? pgvectorRows.length > 0 : null;

    const [total, indexed] = await Promise.all([
      this.prisma.aiKnowledgeBase.count({ where: { tenantId } }),
      this.prisma.aiKnowledgeBase.count({ where: { tenantId, embeddingModel: { not: null } } }),
    ]);

    return {
      embeddings: embeddingsStatus,
      pgvectorAvailable, // null = não foi possível verificar (sem permissão na conexão, etc.)
      knowledgeBase: {
        total,
        indexed,
        notIndexed: total - indexed,
        indexedPct: total > 0 ? Math.round((indexed / total) * 1000) / 10 : 0,
      },
      // Caminho efetivamente usado pelo retrieve(): semântico só se embeddings.enabled
      // E houver pelo menos 1 item indexado; senão cai sempre no textual.
      effectiveRetrievalMode: embeddingsStatus.modelLoaded && !embeddingsStatus.failed && indexed > 0 ? 'semantic' : 'textual',
    };
  }

  // Backfill: (re)gera os vetores da KB do tenant. Rodar após a migração do pgvector
  // ou quando trocar de modelo. force=true reindexa tudo; senão só o que não tem vetor.
  async reindex(tenantId: string, force = false) {
    if (!this.embeddings.enabled) {
      return { ok: false, reason: 'embeddings desabilitado ou modelo indisponível', indexed: 0 };
    }
    const where = force ? `tenant_id = $1` : `tenant_id = $1 AND embedding IS NULL`;
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, title, content FROM ai_knowledge_base WHERE ${where}`,
      tenantId,
    )) as any[];
    let indexed = 0;
    for (const r of rows) {
      await this.storeEmbedding(r.id, r.title, r.content);
      indexed++;
    }
    this.invalidateCache(tenantId);
    this.logger.log(`reindex(${tenantId}): ${indexed} itens vetorizados (force=${force})`);
    return { ok: true, indexed };
  }
}
