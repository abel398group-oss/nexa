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

  it('manda o resumo com visitas, únicos, origem e página', async () => {
    const d = makeDeps();
    await make(d).enviar();

    const [assunto, corpo, opts] = d.alerta.notifyAdmin.mock.calls[0];
    expect(assunto).toContain('hipertms.com.br');
    expect(assunto).toContain('07/08');
    expect(corpo).toContain('Visitas: 143');
    expect(corpo).toContain('Visitantes únicos: 98');
    expect(corpo).toContain('instagram (54)');
    expect(corpo).toContain('/ (89)');
    // 📊 e não ⚠️: informação de rotina não pode se disfarçar de alerta.
    expect(opts.icon).toBe('📊');
  });

  // Silêncio é informação. Mandar "0 visitas" todo dia treina o leitor a ignorar.
  it('dia sem visita NÃO manda nada', async () => {
    const d = makeDeps({ dia: '2026-08-07', visitas: 0, unicos: 0, visitasDiaAnterior: 10, topOrigem: null, topPagina: null });
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
    it('omite o percentual com base pequena', async () => {
      const d = comBase(2, 1);
      await make(d).enviar();
      expect(d.alerta.notifyAdmin.mock.calls[0][1]).toBe('Visitas: 2\nVisitantes únicos: 2');
    });

    it('sem dia anterior não divide por zero', async () => {
      const d = comBase(10, 0);
      await make(d).enviar();
      expect(d.alerta.notifyAdmin.mock.calls[0][1]).not.toContain('%');
      expect(d.alerta.notifyAdmin.mock.calls[0][1]).not.toContain('Infinity');
    });
  });
});
