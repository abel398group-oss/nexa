import { KnowledgeService } from './knowledge.service';

function mockPrisma(opts: {
  pgvectorRows?: any[] | null;
  pgvectorThrows?: boolean;
  total?: number;
  indexed?: number;
}) {
  const queryRawUnsafe = opts.pgvectorThrows
    ? vi.fn().mockRejectedValue(new Error('sem permissão'))
    : vi.fn().mockResolvedValue(opts.pgvectorRows ?? []);
  return {
    $queryRawUnsafe: queryRawUnsafe,
    aiKnowledgeBase: {
      count: vi.fn().mockImplementation(({ where }: any) =>
        where.embeddingModel ? Promise.resolve(opts.indexed ?? 0) : Promise.resolve(opts.total ?? 0),
      ),
    },
  } as any;
}

function mockEmbeddings(status: { configuredEnabled: boolean; modelLoaded: boolean; failed: boolean }) {
  return {
    getStatus: vi.fn().mockReturnValue({ model: 'Xenova/multilingual-e5-small', dim: 384, ...status }),
  } as any;
}

describe('KnowledgeService.getEmbeddingsStatus', () => {
  it('reports pgvector available and the indexed percentage of the tenant KB', async () => {
    const prisma = mockPrisma({ pgvectorRows: [{ extname: 'vector' }], total: 10, indexed: 8 });
    const embeddings = mockEmbeddings({ configuredEnabled: true, modelLoaded: true, failed: false });
    const svc = new KnowledgeService(prisma, {} as any, embeddings);

    const result = await svc.getEmbeddingsStatus('tenant-1');

    expect(result.pgvectorAvailable).toBe(true);
    expect(result.knowledgeBase).toEqual({ total: 10, indexed: 8, notIndexed: 2, indexedPct: 80 });
    expect(result.effectiveRetrievalMode).toBe('semantic');
  });

  it('reports pgvectorAvailable=false when the extension is not installed', async () => {
    const prisma = mockPrisma({ pgvectorRows: [], total: 5, indexed: 0 });
    const embeddings = mockEmbeddings({ configuredEnabled: true, modelLoaded: true, failed: false });
    const svc = new KnowledgeService(prisma, {} as any, embeddings);

    const result = await svc.getEmbeddingsStatus('tenant-1');

    expect(result.pgvectorAvailable).toBe(false);
  });

  it('reports pgvectorAvailable=null (unknown) when the check query fails instead of throwing', async () => {
    const prisma = mockPrisma({ pgvectorThrows: true, total: 5, indexed: 0 });
    const embeddings = mockEmbeddings({ configuredEnabled: true, modelLoaded: true, failed: false });
    const svc = new KnowledgeService(prisma, {} as any, embeddings);

    const result = await svc.getEmbeddingsStatus('tenant-1');

    expect(result.pgvectorAvailable).toBeNull();
  });

  it('falls back to textual retrieval mode when no items are indexed yet, even if the model loaded', async () => {
    const prisma = mockPrisma({ pgvectorRows: [{ extname: 'vector' }], total: 5, indexed: 0 });
    const embeddings = mockEmbeddings({ configuredEnabled: true, modelLoaded: true, failed: false });
    const svc = new KnowledgeService(prisma, {} as any, embeddings);

    const result = await svc.getEmbeddingsStatus('tenant-1');

    expect(result.effectiveRetrievalMode).toBe('textual');
  });

  it('falls back to textual retrieval mode when the embeddings model failed to load', async () => {
    const prisma = mockPrisma({ pgvectorRows: [{ extname: 'vector' }], total: 5, indexed: 3 });
    const embeddings = mockEmbeddings({ configuredEnabled: true, modelLoaded: false, failed: true });
    const svc = new KnowledgeService(prisma, {} as any, embeddings);

    const result = await svc.getEmbeddingsStatus('tenant-1');

    expect(result.effectiveRetrievalMode).toBe('textual');
  });

  it('computes indexedPct as 0 when the tenant has no knowledge base items', async () => {
    const prisma = mockPrisma({ pgvectorRows: [{ extname: 'vector' }], total: 0, indexed: 0 });
    const embeddings = mockEmbeddings({ configuredEnabled: true, modelLoaded: true, failed: false });
    const svc = new KnowledgeService(prisma, {} as any, embeddings);

    const result = await svc.getEmbeddingsStatus('tenant-1');

    expect(result.knowledgeBase.indexedPct).toBe(0);
  });
});

// ─── F8: separação de conhecimento por produto (2026-08-05) ──────────────────
// A base é uma só. Sem o filtro, um lead vindo da campanha de pneus perguntava
// "quanto custa?" e a Lia respondia sobre CT-e.

function mockPrismaRetrieve(rows: any[]) {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    aiKnowledgeBase: { findMany: vi.fn().mockResolvedValue(rows) },
  } as any;
}
const embeddingsOff = { enabled: false } as any;

describe('KnowledgeService.retrieve — separação por produto', () => {
  const artigo = (over: any = {}) => ({
    id: 'k1', title: 'Preço do plano', content: 'custa muito barato mesmo',
    category: 'comercial', topic: 'planos', tags: [], productCode: null, ...over,
  });

  it('sem productCode: busca em tudo (comportamento anterior preservado)', async () => {
    const prisma = mockPrismaRetrieve([artigo()]);
    const svc = new KnowledgeService(prisma, {} as any, embeddingsOff);

    await svc.retrieve('t1', 'quanto custa o plano', 3);

    expect(prisma.aiKnowledgeBase.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', approved: true });
  });

  it('com productCode: filtra NO BANCO pelo produto + genéricos', async () => {
    const prisma = mockPrismaRetrieve([artigo()]);
    const svc = new KnowledgeService(prisma, {} as any, embeddingsOff);

    await svc.retrieve('t1', 'quanto custa o pneu', 3, { productCode: 'pneus' });

    expect(prisma.aiKnowledgeBase.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      approved: true,
      OR: [{ productCode: 'pneus' }, { productCode: null }],
    });
  });

  // O filtro precisa ir no BANCO: com `take: 100` e a base do TMS muito maior
  // que a do parceiro, filtrar depois deixaria os artigos do parceiro fora do corte.
  it('o corte de 100 é aplicado JÁ filtrado, não antes', async () => {
    const prisma = mockPrismaRetrieve([artigo()]);
    const svc = new KnowledgeService(prisma, {} as any, embeddingsOff);

    await svc.retrieve('t1', 'pneu', 3, { productCode: 'pneus' });

    const chamada = prisma.aiKnowledgeBase.findMany.mock.calls[0][0];
    expect(chamada.take).toBe(100);
    expect(chamada.where.OR).toBeDefined();
  });

  it('produtos diferentes não compartilham cache', async () => {
    const prisma = mockPrismaRetrieve([artigo()]);
    const svc = new KnowledgeService(prisma, {} as any, embeddingsOff);

    await svc.retrieve('t1', 'quanto custa', 3, { productCode: 'hipertms' });
    await svc.retrieve('t1', 'quanto custa', 3, { productCode: 'pneus' });

    // duas leituras distintas — a segunda NÃO pode reaproveitar o cache da primeira
    expect(prisma.aiKnowledgeBase.findMany).toHaveBeenCalledTimes(2);
  });

  it('mesmo produto reaproveita o cache', async () => {
    const prisma = mockPrismaRetrieve([artigo()]);
    const svc = new KnowledgeService(prisma, {} as any, embeddingsOff);

    await svc.retrieve('t1', 'quanto custa', 3, { productCode: 'pneus' });
    await svc.retrieve('t1', 'outra pergunta qualquer', 3, { productCode: 'pneus' });

    expect(prisma.aiKnowledgeBase.findMany).toHaveBeenCalledTimes(1);
  });
});
