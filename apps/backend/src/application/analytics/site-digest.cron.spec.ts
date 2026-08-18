import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SiteDigestCron } from './site-digest.cron';

function makeDeps(resumo: any = null) {
  const prisma = {
    website: { findMany: vi.fn().mockResolvedValue([{ tenantId: 't1', domain: 'hipertms.com.br' }]) },
  } as any;
  const stats = {
    resumoDoDia: vi.fn().mockResolvedValue(
      resumo ?? {
        dia: '2026-08-07', visitas: 143, unicos: 98, visitasDiaAnterior: 128,
        acessosApp: 12, deCampanha: 54, topCampanha: { rotulo: 'frota-sp-agosto', visitas: 54 },
        cadastros: 7,
        topOrigem: { rotulo: 'instagram', visitas: 54 },
        topPagina: { rotulo: '/', visitas: 89 },
      },
    ),
  } as any;
  const alerta = { notifyAdmin: vi.fn().mockResolvedValue({ whatsapp: true, email: true }) } as any;
  const release = vi.fn().mockResolvedValue(undefined);
  const lock = { acquire: vi.fn().mockResolvedValue(release) } as any;
  return { prisma, stats, alerta, lock, release };
}

const make = (d: ReturnType<typeof makeDeps>) => new SiteDigestCron(d.prisma, d.stats, d.alerta, d.lock);

describe('SiteDigestCron', () => {
  beforeEach(() => { delete process.env.SITE_DIGEST_ENABLED; });

  it('responde campanha e cadastro, e separa o acesso do time', async () => {
    const d = makeDeps();
    await make(d).enviar();

    const [assunto, corpo, opts] = d.alerta.notifyAdmin.mock.calls[0];
    expect(assunto).toContain('hipertms.com.br');
    expect(assunto).toContain('07/08');
    expect(corpo).toContain('Site: 143 visitas, 98 pessoas');
    // A linha que a mensagem antiga não tinha — e é a pergunta que a tela existe
    // para responder.
    expect(corpo).toContain('Campanha: 54 visitas de "frota-sp-agosto"');
    expect(corpo).toContain('Cadastro: 7 em /signup');
    // O acesso do time aparece, mas fora do total do site.
    expect(corpo).toContain('App: 12 acessos do time');
    expect(corpo).not.toContain('Visitas: 155');
    // 📊 e não ⚠️: informação de rotina não pode se disfarçar de alerta.
    expect(opts.icon).toBe('📊');
  });

  // Silêncio é informação. Mandar "0 visitas" todo dia treina o leitor a ignorar.
  it('dia sem visita NÃO manda nada', async () => {
    const d = makeDeps({ dia: '2026-08-07', visitas: 0, unicos: 0, visitasDiaAnterior: 10, acessosApp: 9, deCampanha: 0, topCampanha: null, cadastros: 0, topOrigem: null, topPagina: null });
    await make(d).enviar();
    expect(d.alerta.notifyAdmin).not.toHaveBeenCalled();
  });

  it('SITE_DIGEST_ENABLED=false desliga sem redeploy', async () => {
    process.env.SITE_DIGEST_ENABLED = 'false';
    const d = makeDeps();
    await make(d).enviar();
    expect(d.alerta.notifyAdmin).not.toHaveBeenCalled();
    expect(d.lock.acquire).not.toHaveBeenCalled();
  });

  // Com mais de uma réplica, todas acordam no mesmo minuto.
  it('sem o lock, não envia (outra instância está enviando)', async () => {
    const d = makeDeps();
    d.lock.acquire.mockResolvedValue(null);
    await make(d).enviar();
    expect(d.alerta.notifyAdmin).not.toHaveBeenCalled();
  });

  it('solta o lock mesmo se o envio falhar', async () => {
    const d = makeDeps();
    d.stats.resumoDoDia.mockRejectedValue(new Error('db fora'));
    await make(d).enviar();
    expect(d.release).toHaveBeenCalled();
  });

  it('um site com erro não impede o resumo dos outros', async () => {
    const d = makeDeps();
    d.prisma.website.findMany.mockResolvedValue([
      { tenantId: 't1', domain: 'quebra.com.br' },
      { tenantId: 't2', domain: 'ok.com.br' },
    ]);
    d.stats.resumoDoDia
      .mockRejectedValueOnce(new Error('falhou'))
      .mockResolvedValueOnce({ dia: '2026-08-07', visitas: 5, unicos: 5, visitasDiaAnterior: 0, topOrigem: null, topPagina: null });

    await make(d).enviar();

    expect(d.alerta.notifyAdmin).toHaveBeenCalledTimes(1);
    expect(d.alerta.notifyAdmin.mock.calls[0][0]).toContain('ok.com.br');
  });

  describe('variação percentual', () => {
    const comBase = (visitas: number, base: number) => makeDeps({
      dia: '2026-08-07', visitas, unicos: visitas, visitasDiaAnterior: base, topOrigem: null, topPagina: null,
    });

    it('mostra o percentual quando há base', async () => {
      const d = comBase(143, 128);
      await make(d).enviar();
      expect(d.alerta.notifyAdmin.mock.calls[0][1]).toContain('+12%');
    });

    // "+100%" saindo de 1 visita para 2 é verdade e é inútil.
    //
    // Afirma a AUSÊNCIA do percentual, e não a mensagem inteira por igualdade: o texto
    // ganhou as linhas de campanha e cadastro em 18/08, e um `toBe` do corpo completo
    // quebra a cada ajuste de redação sem que nada da regra tenha mudado.
    it('omite o percentual com base pequena', async () => {
      const d = comBase(2, 1);
      await make(d).enviar();
      const corpo = d.alerta.notifyAdmin.mock.calls[0][1];
      expect(corpo).toContain('Site: 2 visitas');
      expect(corpo).not.toContain('%');
    });

    it('sem dia anterior não divide por zero', async () => {
      const d = comBase(10, 0);
      await make(d).enviar();
      expect(d.alerta.notifyAdmin.mock.calls[0][1]).not.toContain('%');
      expect(d.alerta.notifyAdmin.mock.calls[0][1]).not.toContain('Infinity');
    });
  });
});

// ─── Campanha e cadastro zerados (18/08/2026) ────────────────────────────────
//
// A mensagem antiga só listava o que existia: sem campanha, a linha sumia e o dono não
// distinguia "o disparo não trouxe ninguém" de "o resumo não fala sobre isso". Zero é
// resposta, e precisa aparecer.
describe('SiteDigestCron — a resposta quando é zero', () => {
  const semNada = {
    dia: '2026-08-17', visitas: 4, unicos: 3, visitasDiaAnterior: 3,
    acessosApp: 3, deCampanha: 0, topCampanha: null, cadastros: 0,
    topOrigem: { rotulo: 'diretorio', visitas: 2 }, topPagina: { rotulo: '/', visitas: 4 },
  };

  it('diz "nenhuma visita" de campanha em vez de omitir a linha', async () => {
    const d = makeDeps(semNada);
    await make(d).enviar();

    const [, corpo] = d.alerta.notifyAdmin.mock.calls[0];
    expect(corpo).toContain('Campanha: nenhuma visita');
    expect(corpo).toContain('Cadastro: nenhum');
  });

  it('uma pessoa só não vira "1 pessoas"', async () => {
    const d = makeDeps({ ...semNada, unicos: 1 });
    await make(d).enviar();

    expect(d.alerta.notifyAdmin.mock.calls[0][1]).toContain('1 pessoa');
    expect(d.alerta.notifyAdmin.mock.calls[0][1]).not.toContain('1 pessoas');
  });

  // Base pequena: a variação percentual continua escondida — "+33%" de 3 para 4 é
  // tecnicamente verdade e inútil.
  it('não mostra percentual com base menor que 5', async () => {
    const d = makeDeps(semNada);
    await make(d).enviar();

    expect(d.alerta.notifyAdmin.mock.calls[0][1]).not.toContain('%');
  });

  it('sem acesso do time, a linha do app não aparece', async () => {
    const d = makeDeps({ ...semNada, acessosApp: 0 });
    await make(d).enviar();

    expect(d.alerta.notifyAdmin.mock.calls[0][1]).not.toContain('App:');
  });
});
