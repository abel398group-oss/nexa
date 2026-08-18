import { describe, it, expect, vi } from 'vitest';
import { PageviewStatsService } from './pageview-stats.service';

/**
 * O recorte da visão geral (18/08/2026).
 *
 * O que estes testes guardam não é a soma — é a SEPARAÇÃO. A tela responde "a campanha
 * trouxe gente ao site?", e antes o número grande incluía o time entrando no painel
 * (19 de 40 visitas em 7 dias eram `/login`) e contava navegação interna como origem.
 */
function makeSvc(opts: {
  referrers?: { rotulo: string; visitas: number }[];
  dominios?: string[];
} = {}) {
  const contagens = [
    { visitas: 22n, unicos: 10n }, // site
    { visitas: 19n, unicos: 9n },  // app
    { visitas: 0n, unicos: 0n },   // campanha
    { visitas: 3n, unicos: 3n },   // cadastro
  ];
  let iContagem = 0;

  const prisma = {
    // `serieDiaria` e `contarIntervalo` usam template tag; a série vem primeiro.
    $queryRaw: vi.fn().mockImplementation(() => {
      if (iContagem === 0) {
        iContagem++;
        return Promise.resolve([{ dia: new Date('2026-08-18'), visitas: 41n, unicos: 15n }]);
      }
      return Promise.resolve([contagens[iContagem++ - 1] ?? { visitas: 0n, unicos: 0n }]);
    }),
    $queryRawUnsafe: vi.fn().mockImplementation((_sql: string, ..._a: unknown[]) => {
      const col = String(_sql).match(/SELECT (\w+) AS rotulo/)?.[1];
      if (col === 'referrer_domain') {
        return Promise.resolve(
          (opts.referrers ?? [
            { rotulo: 'google.com', visitas: 6 },
            { rotulo: 'hipertms.com.br', visitas: 4 },
          ]).map((r) => ({ rotulo: r.rotulo, visitas: BigInt(r.visitas) })),
        );
      }
      return Promise.resolve([]);
    }),
    website: {
      findMany: vi.fn().mockResolvedValue(
        (opts.dominios ?? ['hipertms.com.br']).map((domain) => ({ domain })),
      ),
    },
  };
  return { svc: new PageviewStatsService(prisma as any), prisma };
}

const periodo = { from: new Date('2026-08-12'), to: new Date('2026-08-19') };

describe('PageviewStatsService.visaoGeral — recorte site × app', () => {
  it('separa site, app, campanha e cadastro', async () => {
    const { svc } = makeSvc();

    const r = await svc.visaoGeral('t1', periodo);

    expect(r.visitasSite).toBe(22);
    expect(r.pessoasSite).toBe(10);
    expect(r.acessosApp).toBe(19);
    expect(r.deCampanha).toBe(0);
    expect(r.cadastros).toBe(3);
  });

  // `pessoasSite` é DISTINCT do período; `unicosPorDia` soma por dia e conta duas vezes
  // quem voltou. São números diferentes de propósito, e a tela usa o primeiro.
  it('pessoas do período não é a soma dos únicos por dia', async () => {
    const { svc } = makeSvc();

    const r = await svc.visaoGeral('t1', periodo);

    expect(r.pessoasSite).toBe(10);
    expect(r.unicosPorDia).toBe(15);
  });
});

describe('PageviewStatsService.visaoGeral — referrer do próprio domínio', () => {
  it('descarta o próprio site da lista de origens', async () => {
    const { svc } = makeSvc();

    const r = await svc.visaoGeral('t1', periodo);

    expect(r.topReferrers.map((x) => x.rotulo)).toEqual(['google.com']);
  });

  it('subdomínio próprio também é navegação interna', async () => {
    const { svc } = makeSvc({
      referrers: [{ rotulo: 'app.hipertms.com.br', visitas: 9 }, { rotulo: 'bing.com', visitas: 1 }],
    });

    const r = await svc.visaoGeral('t1', periodo);

    expect(r.topReferrers.map((x) => x.rotulo)).toEqual(['bing.com']);
  });

  // Tenant sem site cadastrado não pode perder as origens que tem: sem domínio para
  // comparar, nada é descartado.
  it('sem domínio cadastrado, nada é descartado', async () => {
    const { svc } = makeSvc({ dominios: [] });

    const r = await svc.visaoGeral('t1', periodo);

    expect(r.topReferrers).toHaveLength(2);
  });
});
