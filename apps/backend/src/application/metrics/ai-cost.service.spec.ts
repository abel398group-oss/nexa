import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiCostService } from './ai-cost.service';

function makePrisma(linhas: any[] = [], tenants: any[] = []) {
  return {
    aiMessage: { groupBy: vi.fn().mockResolvedValue(linhas) },
    tenant: { findMany: vi.fn().mockResolvedValue(tenants) },
  } as any;
}

const makeAlert = () => ({ notifyAdmin: vi.fn().mockResolvedValue({ whatsapp: true, email: true }) }) as any;

/** Linha do groupBy do Prisma. */
const linha = (tenantId: string, custo: number, msgs: number) => ({
  tenantId,
  _sum: { estimatedCostUsd: custo, tokensIn: 1000, tokensOut: 500 },
  _count: { _all: msgs },
});

describe('AiCostService.report', () => {
  it('soma por tenant e resolve o nome', async () => {
    const svc = new AiCostService(
      makePrisma([linha('t1', 12.5, 500)], [{ id: 't1', name: 'Transportadora X' }]),
      makeAlert(),
    );

    const r = await svc.report(new Date('2026-08-01'));

    expect(r.totalUsd).toBe(12.5);
    expect(r.tenants[0]).toMatchObject({ tenantName: 'Transportadora X', messages: 500 });
  });

  it('ordena do mais caro para o mais barato', async () => {
    // A pergunta que se faz é "quem está caro?" — o caro tem que vir primeiro.
    const svc = new AiCostService(
      makePrisma(
        [linha('t1', 2, 100), linha('t2', 40, 90), linha('t3', 9, 300)],
        [
          { id: 't1', name: 'A' },
          { id: 't2', name: 'B' },
          { id: 't3', name: 'C' },
        ],
      ),
      makeAlert(),
    );

    const r = await svc.report(new Date('2026-08-01'));
    expect(r.tenants.map((t) => t.tenantName)).toEqual(['B', 'C', 'A']);
  });

  it('custo por mensagem denuncia gasto anormal', async () => {
    // Mesmo gasto total, volumes MUITO diferentes: quem queima muito em poucas
    // mensagens é o padrão de conversa em loop.
    const svc = new AiCostService(
      makePrisma(
        [linha('grande', 20, 4000), linha('loop', 20, 40)],
        [
          { id: 'grande', name: 'Cliente grande' },
          { id: 'loop', name: 'Suspeito' },
        ],
      ),
      makeAlert(),
    );

    const r = await svc.report(new Date('2026-08-01'));
    const grande = r.tenants.find((t) => t.tenantName === 'Cliente grande')!;
    const loop = r.tenants.find((t) => t.tenantName === 'Suspeito')!;

    expect(grande.costPerMessageUsd).toBeCloseTo(0.005, 4);
    expect(loop.costPerMessageUsd).toBeCloseTo(0.5, 4);
  });

  it('sem mensagens não divide por zero', async () => {
    const svc = new AiCostService(makePrisma([linha('t1', 0, 0)], [{ id: 't1', name: 'A' }]), makeAlert());
    const r = await svc.report(new Date('2026-08-01'));
    expect(r.tenants[0].costPerMessageUsd).toBe(0);
  });

  it('período sem gasto devolve relatório vazio, não erro', async () => {
    const svc = new AiCostService(makePrisma([], []), makeAlert());
    const r = await svc.report(new Date('2026-08-01'));
    expect(r).toMatchObject({ totalUsd: 0, tenants: [] });
  });

  it('tenant sem nome cadastrado cai para o id em vez de quebrar', async () => {
    const svc = new AiCostService(makePrisma([linha('orfao', 1, 10)], []), makeAlert());
    const r = await svc.report(new Date('2026-08-01'));
    expect(r.tenants[0].tenantName).toBe('orfao');
  });
});

describe('AiCostService.dailyDigest', () => {
  it('manda o resumo no WhatsApp e no e-mail do admin', async () => {
    const alert = makeAlert();
    const svc = new AiCostService(
      makePrisma([linha('t1', 7.25, 300)], [{ id: 't1', name: 'Transportadora X' }]),
      alert,
    );

    await svc.dailyDigest();

    expect(alert.notifyAdmin).toHaveBeenCalledTimes(1);
    const [assunto, corpo] = alert.notifyAdmin.mock.calls[0];
    expect(assunto).toContain('7.25');
    expect(corpo).toContain('Transportadora X');
  });

  it('dia sem gasto não gera aviso — alerta diário sem novidade ninguém lê', async () => {
    const alert = makeAlert();
    await new AiCostService(makePrisma([], []), alert).dailyDigest();
    expect(alert.notifyAdmin).not.toHaveBeenCalled();
  });

  it('falha no relatório não derruba o scheduler', async () => {
    const prisma = makePrisma();
    prisma.aiMessage.groupBy.mockRejectedValue(new Error('db fora'));
    await expect(new AiCostService(prisma, makeAlert()).dailyDigest()).resolves.toBeUndefined();
  });
});

describe('AiCostService.checkSpikes', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, AI_COST_ALERT_TENANT_USD: '15', AI_COST_ALERT_PER_MSG_USD: '0.05' };
  });

  it('avisa quando o gasto do dia passa do limiar', async () => {
    const alert = makeAlert();
    await new AiCostService(
      makePrisma([linha('t1', 20, 4000)], [{ id: 't1', name: 'Cliente grande' }]),
      alert,
    ).checkSpikes();

    expect(alert.notifyAdmin).toHaveBeenCalledTimes(1);
    expect(alert.notifyAdmin.mock.calls[0][1]).toContain('Cliente grande');
  });

  it('avisa por custo POR MENSAGEM mesmo com gasto total baixo', async () => {
    // US$ 5 no dia não dispara pelo total, mas US$ 0,10/mensagem é anormal.
    const alert = makeAlert();
    await new AiCostService(
      makePrisma([linha('t1', 5, 50)], [{ id: 't1', name: 'Suspeito' }]),
      alert,
    ).checkSpikes();

    expect(alert.notifyAdmin).toHaveBeenCalledTimes(1);
    expect(alert.notifyAdmin.mock.calls[0][1]).toMatch(/loop/i);
  });

  it('amostra pequena não dispara alerta de custo por mensagem', async () => {
    // 3 mensagens caras podem ser só um anexo grande — não é padrão, é ruído.
    const alert = makeAlert();
    await new AiCostService(makePrisma([linha('t1', 1, 3)], [{ id: 't1', name: 'A' }]), alert).checkSpikes();
    expect(alert.notifyAdmin).not.toHaveBeenCalled();
  });

  it('não repete o mesmo aviso a cada hora', async () => {
    const alert = makeAlert();
    const svc = new AiCostService(
      makePrisma([linha('t1', 20, 4000)], [{ id: 't1', name: 'A' }]),
      alert,
    );

    await svc.checkSpikes();
    await svc.checkSpikes();
    await svc.checkSpikes();

    // O cron roda de hora em hora; sem a trava o admin receberia o mesmo aviso
    // 24 vezes no dia e pararia de ler.
    expect(alert.notifyAdmin).toHaveBeenCalledTimes(1);
  });

  it('gasto normal não incomoda ninguém', async () => {
    const alert = makeAlert();
    await new AiCostService(makePrisma([linha('t1', 2, 400)], [{ id: 't1', name: 'A' }]), alert).checkSpikes();
    expect(alert.notifyAdmin).not.toHaveBeenCalled();
  });
});
