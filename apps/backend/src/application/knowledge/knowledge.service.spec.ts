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
