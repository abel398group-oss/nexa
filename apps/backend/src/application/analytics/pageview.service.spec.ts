import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PageviewService } from './pageview.service';

function makeDeps(site: any = { tenantId: 't1', domain: 'hipertms.com.br', isActive: true }) {
  const prisma = {
    website: { findUnique: vi.fn().mockResolvedValue(site) },
    pageView: { create: vi.fn().mockResolvedValue({ id: 'pv1' }) },
  } as any;
  return { prisma };
}

const UA_GENTE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const ctx = (over: Partial<{ ip: string; userAgent: string; origin: string | null }> = {}) => ({
  ip: '203.0.113.9',
  userAgent: UA_GENTE,
  origin: 'https://hipertms.com.br',
  ...over,
});
const input = { websiteKey: 'chave-publica', url: '/signup?utm_source=meta' };

describe('PageviewService — ingest', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: PageviewService;

  beforeEach(() => {
    process.env.ANALYTICS_HASH_SECRET = 'segredo-de-teste';
    deps = makeDeps();
    svc = new PageviewService(deps.prisma);
  });

  it('grava o pageview do caminho felizim', async () => {
    expect(await svc.ingest(input, ctx())).toBe('gravado');

    const data = deps.prisma.pageView.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 't1', path: '/signup', utmSource: 'meta', device: 'desktop' });
    expect(data.visitorHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // NUNCA persistir IP cru — é o requisito de LGPD que dispensa banner de cookie.
  it('não grava o IP em lugar nenhum', async () => {
    await svc.ingest(input, ctx());
    const json = JSON.stringify(deps.prisma.pageView.create.mock.calls[0][0].data);
    expect(json).not.toContain('203.0.113.9');
  });

  it('bot é descartado antes de qualquer query ao banco', async () => {
    const r = await svc.ingest(input, ctx({ userAgent: 'Googlebot/2.1' }));
    expect(r).toBe('bot');
    expect(deps.prisma.website.findUnique).not.toHaveBeenCalled();
    expect(deps.prisma.pageView.create).not.toHaveBeenCalled();
  });

  it('chave desconhecida não grava', async () => {
    deps = makeDeps(null);
    svc = new PageviewService(deps.prisma);
    expect(await svc.ingest(input, ctx())).toBe('chave_invalida');
    expect(deps.prisma.pageView.create).not.toHaveBeenCalled();
  });

  it('site desativado não grava', async () => {
    deps = makeDeps({ tenantId: 't1', domain: 'hipertms.com.br', isActive: false });
    svc = new PageviewService(deps.prisma);
    expect(await svc.ingest(input, ctx())).toBe('chave_invalida');
  });

  // CORS não protege aqui: impede o navegador de LER a resposta, não impede um curl
  // de postar. A conferência do Origin no servidor é o que dificulta poluir a métrica.
  describe('origem', () => {
    it('domínio autorizado e seus subdomínios passam', async () => {
      for (const o of ['https://hipertms.com.br', 'https://www.hipertms.com.br', 'https://staging.hipertms.com.br']) {
        deps = makeDeps(); svc = new PageviewService(deps.prisma);
        expect(await svc.ingest(input, ctx({ origin: o }))).toBe('gravado');
      }
    });

    it('domínio de terceiro é recusado', async () => {
      expect(await svc.ingest(input, ctx({ origin: 'https://site-do-atacante.com' }))).toBe('origem_nao_autorizada');
      expect(deps.prisma.pageView.create).not.toHaveBeenCalled();
    });

    it('sufixo parecido não passa (hipertms.com.br.atacante.com)', async () => {
      expect(await svc.ingest(input, ctx({ origin: 'https://hipertms.com.br.atacante.com' }))).toBe('origem_nao_autorizada');
    });

    it('Origin ausente é recusado — o navegador sempre manda em cross-origin', async () => {
      expect(await svc.ingest(input, ctx({ origin: null }))).toBe('origem_nao_autorizada');
    });
  });

  it('a chave é resolvida UMA vez e depois vem do cache', async () => {
    await svc.ingest(input, ctx());
    await svc.ingest(input, ctx());
    await svc.ingest(input, ctx());
    expect(deps.prisma.website.findUnique).toHaveBeenCalledTimes(1);
  });

  // Sem cache negativo, um flood com chave inexistente custaria uma query por
  // requisição — exatamente o que um atacante faria de graça.
  it('chave inválida também é cacheada', async () => {
    deps = makeDeps(null);
    svc = new PageviewService(deps.prisma);
    await svc.ingest(input, ctx());
    await svc.ingest(input, ctx());
    expect(deps.prisma.website.findUnique).toHaveBeenCalledTimes(1);
  });

  // O visitante não pode sentir a landing travar por causa de analytics.
  it('erro no banco não lança — devolve "erro"', async () => {
    deps.prisma.pageView.create.mockRejectedValue(new Error('db fora'));
    await expect(svc.ingest(input, ctx())).resolves.toBe('erro');
  });

  it('screen fora do formato NxN é descartado', async () => {
    await svc.ingest({ ...input, screen: 'DROP TABLE' } as any, ctx());
    expect(deps.prisma.pageView.create.mock.calls[0][0].data.screen).toBeNull();

    deps = makeDeps(); svc = new PageviewService(deps.prisma);
    await svc.ingest({ ...input, screen: '1920x1080' } as any, ctx());
    expect(deps.prisma.pageView.create.mock.calls[0][0].data.screen).toBe('1920x1080');
  });

  it('país fica nulo na Fase 1 (sem base GeoIP), mas a coluna existe', async () => {
    await svc.ingest(input, ctx());
    const data = deps.prisma.pageView.create.mock.calls[0][0].data;
    expect(data.country ?? null).toBeNull();
  });
});
