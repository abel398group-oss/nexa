import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AbuseGuardService } from './abuse-guard.service';

function makePrisma() {
  return {
    contactAbuseRecord: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
  } as any;
}

const makeAlert = () => ({ notifyAdmin: vi.fn().mockResolvedValue({ whatsapp: true, email: true }) }) as any;

describe('AbuseGuardService.isBanned', () => {
  it('telefone nunca visto não está banido', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.findUnique.mockResolvedValue(null);
    const svc = new AbuseGuardService(prisma, makeAlert());
    expect(await svc.isBanned('t1', '5511999999999')).toBe(false);
  });

  it('registro com bannedAt preenchido está banido', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.findUnique.mockResolvedValue({ bannedAt: new Date() });
    const svc = new AbuseGuardService(prisma, makeAlert());
    expect(await svc.isBanned('t1', '5511999999999')).toBe(true);
  });

  it('registro com strikes mas sem bannedAt não está banido', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.findUnique.mockResolvedValue({ bannedAt: null });
    const svc = new AbuseGuardService(prisma, makeAlert());
    expect(await svc.isBanned('t1', '5511999999999')).toBe(false);
  });

  it('telefone vazio nunca bane — evita banir "todo mundo" por engano', async () => {
    const prisma = makePrisma();
    const svc = new AbuseGuardService(prisma, makeAlert());
    expect(await svc.isBanned('t1', '')).toBe(false);
    expect(prisma.contactAbuseRecord.findUnique).not.toHaveBeenCalled();
  });

  it('falha no banco não derruba a checagem — atende em vez de travar', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.findUnique.mockRejectedValue(new Error('db fora'));
    const svc = new AbuseGuardService(prisma, makeAlert());
    expect(await svc.isBanned('t1', '5511999999999')).toBe(false);
  });
});

describe('AbuseGuardService.recordStrike', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, ABUSE_BAN_THRESHOLD: '3', ABUSE_STRIKE_WINDOW_HOURS: '24' };
  });

  const HORA = 60 * 60 * 1000;
  const agora = () => new Date();
  const horasAtras = (h: number) => new Date(Date.now() - h * HORA);

  it('primeira tentativa (sem registro anterior): conta 1, não bane', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.findUnique.mockResolvedValue(null);
    prisma.contactAbuseRecord.upsert.mockResolvedValue({ id: 'r1', strikeCount: 1, bannedAt: null });
    const alert = makeAlert();
    const svc = new AbuseGuardService(prisma, alert);

    const r = await svc.recordStrike('t1', '5511999999999', ['preco_nao_autorizado'], 'R$ 1,00');

    expect(r).toEqual({ banned: false, strikeCount: 1 });
    expect(prisma.contactAbuseRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ strikeCount: 1 }) }),
    );
    expect(alert.notifyAdmin).not.toHaveBeenCalled();
  });

  it('segunda tentativa DENTRO da janela: soma (1 → 2), não bane', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.findUnique.mockResolvedValue({ strikeCount: 1, lastAt: horasAtras(2), bannedAt: null });
    prisma.contactAbuseRecord.upsert.mockResolvedValue({ id: 'r1', strikeCount: 2, bannedAt: null });
    const alert = makeAlert();
    const svc = new AbuseGuardService(prisma, alert);

    const r = await svc.recordStrike('t1', '5511999999999', ['preco_nao_autorizado'], 'R$ 1,00');

    expect(r).toEqual({ banned: false, strikeCount: 2 });
    expect(prisma.contactAbuseRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ strikeCount: 2 }) }),
    );
    expect(alert.notifyAdmin).not.toHaveBeenCalled();
  });

  // O achado do Gemini (2026-08-05): sem isto, um cliente comum que erra 3 vezes
  // espalhadas em 6 meses seria banido igual a um atacante insistindo em minutos.
  it('tentativa FORA da janela: reinicia em 1 em vez de somar', async () => {
    const prisma = makePrisma();
    // Tinha 2 strikes, mas o último foi há 30h — janela padrão é 24h.
    prisma.contactAbuseRecord.findUnique.mockResolvedValue({ strikeCount: 2, lastAt: horasAtras(30), bannedAt: null });
    prisma.contactAbuseRecord.upsert.mockResolvedValue({ id: 'r1', strikeCount: 1, bannedAt: null });
    const svc = new AbuseGuardService(prisma, makeAlert());

    const r = await svc.recordStrike('t1', '5511999999999', ['preco_nao_autorizado'], 'R$ 1,00');

    expect(r).toEqual({ banned: false, strikeCount: 1 });
    expect(prisma.contactAbuseRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ strikeCount: 1 }) }),
    );
  });

  it('exatamente no limite da janela ainda soma (o corte é "maior que", não "maior ou igual")', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.findUnique.mockResolvedValue({ strikeCount: 1, lastAt: horasAtras(24), bannedAt: null });
    prisma.contactAbuseRecord.upsert.mockResolvedValue({ id: 'r1', strikeCount: 2, bannedAt: null });
    const svc = new AbuseGuardService(prisma, makeAlert());

    await svc.recordStrike('t1', '5511999999999', ['preco_nao_autorizado'], 'x');

    expect(prisma.contactAbuseRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ strikeCount: 2 }) }),
    );
  });

  it('respeita ABUSE_STRIKE_WINDOW_HOURS customizado', async () => {
    process.env.ABUSE_STRIKE_WINDOW_HOURS = '1';
    const prisma = makePrisma();
    // Só 2h atrás, mas a janela customizada é de 1h — deve reiniciar.
    prisma.contactAbuseRecord.findUnique.mockResolvedValue({ strikeCount: 5, lastAt: horasAtras(2), bannedAt: null });
    prisma.contactAbuseRecord.upsert.mockResolvedValue({ id: 'r1', strikeCount: 1, bannedAt: null });
    const svc = new AbuseGuardService(prisma, makeAlert());

    await svc.recordStrike('t1', '5511999999999', ['preco_nao_autorizado'], 'x');

    expect(prisma.contactAbuseRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ strikeCount: 1 }) }),
    );
  });

  it('atinge o teto dentro da janela: bane e avisa o admin', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.findUnique.mockResolvedValue({ strikeCount: 2, lastAt: horasAtras(1), bannedAt: null });
    prisma.contactAbuseRecord.upsert.mockResolvedValue({ id: 'r1', strikeCount: 3, bannedAt: null });
    prisma.contactAbuseRecord.update.mockResolvedValue({});
    const alert = makeAlert();
    const svc = new AbuseGuardService(prisma, alert);

    const r = await svc.recordStrike('t1', '5511999999999', ['vazamento_de_dados'], 'e-mail de terceiro: x@y.com');

    expect(r.banned).toBe(true);
    expect(prisma.contactAbuseRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: expect.objectContaining({ bannedAt: expect.any(Date) }) }),
    );
    expect(alert.notifyAdmin).toHaveBeenCalledTimes(1);
    expect(alert.notifyAdmin.mock.calls[0][0]).toContain('5511999999999');
  });

  it('a janela expirada NÃO livra quem já está banido — ban é sticky até desbanir manual', async () => {
    const prisma = makePrisma();
    // Banido há muito tempo; lastAt também antigo (fora da janela).
    prisma.contactAbuseRecord.findUnique.mockResolvedValue({
      strikeCount: 3,
      lastAt: horasAtras(200),
      bannedAt: horasAtras(200),
    });
    prisma.contactAbuseRecord.upsert.mockResolvedValue({ id: 'r1', strikeCount: 1, bannedAt: horasAtras(200) });
    const alert = makeAlert();
    const svc = new AbuseGuardService(prisma, alert);

    // Na prática isBanned() já teria cortado antes de chegar aqui — este teste
    // cobre a defesa em profundidade citada no comentário do código.
    const r = await svc.recordStrike('t1', '5511999999999', ['linguagem_ofensiva'], 'x');

    expect(r.banned).toBe(true);
    expect(alert.notifyAdmin).not.toHaveBeenCalled();
  });

  it('respeita ABUSE_BAN_THRESHOLD customizado', async () => {
    process.env.ABUSE_BAN_THRESHOLD = '1';
    const prisma = makePrisma();
    prisma.contactAbuseRecord.findUnique.mockResolvedValue(null);
    prisma.contactAbuseRecord.upsert.mockResolvedValue({ id: 'r1', strikeCount: 1, bannedAt: null });
    prisma.contactAbuseRecord.update.mockResolvedValue({});
    const svc = new AbuseGuardService(prisma, makeAlert());

    const r = await svc.recordStrike('t1', '5511999999999', ['preco_nao_autorizado'], 'x');
    expect(r.banned).toBe(true);
  });

  it('telefone vazio não grava nada', async () => {
    const prisma = makePrisma();
    const svc = new AbuseGuardService(prisma, makeAlert());
    const r = await svc.recordStrike('t1', '', ['preco_nao_autorizado'], 'x');
    expect(r).toEqual({ banned: false, strikeCount: 0 });
    expect(prisma.contactAbuseRecord.findUnique).not.toHaveBeenCalled();
    expect(prisma.contactAbuseRecord.upsert).not.toHaveBeenCalled();
  });

  it('falha no banco não lança — o aceno seguro já foi decidido antes disso', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.findUnique.mockRejectedValue(new Error('db fora'));
    const svc = new AbuseGuardService(prisma, makeAlert());
    await expect(svc.recordStrike('t1', '5511999999999', ['preco_nao_autorizado'], 'x')).resolves.toEqual({
      banned: false,
      strikeCount: 0,
    });
  });
});

describe('AbuseGuardService.unban', () => {
  it('zera strikes e remove o banimento', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.updateMany.mockResolvedValue({ count: 1 });
    const svc = new AbuseGuardService(prisma, makeAlert());

    const r = await svc.unban('t1', '5511999999999');

    expect(r.ok).toBe(true);
    expect(prisma.contactAbuseRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bannedAt: null, strikeCount: 0 } }),
    );
  });

  it('telefone não encontrado devolve ok:false', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.updateMany.mockResolvedValue({ count: 0 });
    const svc = new AbuseGuardService(prisma, makeAlert());
    expect((await svc.unban('t1', '0000')).ok).toBe(false);
  });
});
