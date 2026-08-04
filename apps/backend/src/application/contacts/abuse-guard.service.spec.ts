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
    process.env = { ...OLD_ENV, ABUSE_BAN_THRESHOLD: '3' };
  });

  it('abaixo do teto: conta mas não bane', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.upsert.mockResolvedValue({ id: 'r1', strikeCount: 2, bannedAt: null });
    const alert = makeAlert();
    const svc = new AbuseGuardService(prisma, alert);

    const r = await svc.recordStrike('t1', '5511999999999', ['preco_nao_autorizado'], 'R$ 1,00');

    expect(r).toEqual({ banned: false, strikeCount: 2 });
    expect(alert.notifyAdmin).not.toHaveBeenCalled();
  });

  it('atinge o teto: bane e avisa o admin', async () => {
    const prisma = makePrisma();
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

  it('já banido: não bane de novo nem reenvia o alerta', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.upsert.mockResolvedValue({ id: 'r1', strikeCount: 4, bannedAt: new Date() });
    const alert = makeAlert();
    const svc = new AbuseGuardService(prisma, alert);

    const r = await svc.recordStrike('t1', '5511999999999', ['linguagem_ofensiva'], 'x');

    expect(r.banned).toBe(true);
    expect(alert.notifyAdmin).not.toHaveBeenCalled();
  });

  it('respeita ABUSE_BAN_THRESHOLD customizado', async () => {
    process.env.ABUSE_BAN_THRESHOLD = '1';
    const prisma = makePrisma();
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
    expect(prisma.contactAbuseRecord.upsert).not.toHaveBeenCalled();
  });

  it('falha no banco não lança — o aceno seguro já foi decidido antes disso', async () => {
    const prisma = makePrisma();
    prisma.contactAbuseRecord.upsert.mockRejectedValue(new Error('db fora'));
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
