import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StaleLeadService } from './stale-lead.service';

const AGORA = new Date('2026-08-10T12:00:00Z');
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 24 * 60 * 60 * 1000);

function makePrisma() {
  return {
    opportunity: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    sellerActivity: { findMany: vi.fn().mockResolvedValue([]) },
  } as any;
}
const makeNotif = () => ({ create: vi.fn().mockResolvedValue({}) }) as any;
const makeLock = () => ({ acquire: vi.fn().mockResolvedValue(async () => {}) }) as any;

const lead = (over: any = {}) => ({
  id: 'o1', tenantId: 't1', name: 'Fulano', company: 'Transportadora ABC',
  phone: '5511', assignedSellerId: 's1', updatedAt: diasAtras(5), ...over,
});

describe('StaleLeadService', () => {
  let prisma: any, notif: any, svc: StaleLeadService;
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, STALE_LEAD_DAYS: '3' };
    prisma = makePrisma(); notif = makeNotif();
    svc = new StaleLeadService(prisma, notif, makeLock());
  });

  it('so olha estagios abertos e leads sem mexida ha mais que o corte', async () => {
    await svc.varrer(AGORA);
    const where = prisma.opportunity.findMany.mock.calls[0][0].where;
    expect(where.stage).toEqual({ in: ['new', 'qualified', 'proposal'] });
    expect(where.updatedAt.lt.getTime()).toBe(diasAtras(3).getTime());
  });

  it('avisa o lead parado e carimba para nao repetir', async () => {
    prisma.opportunity.findMany.mockResolvedValue([lead()]);
    const r = await svc.varrer(AGORA);

    expect(r.avisados).toBe(1);
    expect(notif.create).toHaveBeenCalledWith('t1', expect.objectContaining({ link: '/fila' }));
    expect(notif.create.mock.calls[0][1].title).toContain('5 dias');
    expect(notif.create.mock.calls[0][1].body).toContain('Transportadora ABC');
    expect(prisma.opportunity.updateMany.mock.calls[0][0].data.staleNotifiedAt).toEqual(AGORA);
  });

  // O relogio é da acao do VENDEDOR: registrar ligacao nao mexe no updatedAt da
  // oportunidade, entao sem o cruzamento ele levaria cobranca tendo trabalhado.
  it('quem recebeu ligacao registrada dentro do periodo NAO e cobrado', async () => {
    prisma.opportunity.findMany.mockResolvedValue([lead({ id: 'ligou' }), lead({ id: 'esquecido' })]);
    prisma.sellerActivity.findMany.mockResolvedValue([{ opportunityId: 'ligou' }]);

    const r = await svc.varrer(AGORA);

    expect(r.avisados).toBe(1);
    expect(notif.create).toHaveBeenCalledTimes(1);
    expect(prisma.opportunity.updateMany.mock.calls[0][0].where.id.in).toEqual(['esquecido']);
  });

  it('nada parado: nao notifica nem carimba', async () => {
    prisma.opportunity.findMany.mockResolvedValue([]);
    const r = await svc.varrer(AGORA);
    expect(r.avisados).toBe(0);
    expect(notif.create).not.toHaveBeenCalled();
    expect(prisma.opportunity.updateMany).not.toHaveBeenCalled();
  });

  it('todos os candidatos tinham atividade: nao notifica', async () => {
    prisma.opportunity.findMany.mockResolvedValue([lead({ id: 'a' })]);
    prisma.sellerActivity.findMany.mockResolvedValue([{ opportunityId: 'a' }]);
    const r = await svc.varrer(AGORA);
    expect(r.avisados).toBe(0);
    expect(prisma.opportunity.updateMany).not.toHaveBeenCalled();
  });

  it('respeita STALE_LEAD_DAYS customizado', async () => {
    process.env.STALE_LEAD_DAYS = '7';
    await svc.varrer(AGORA);
    expect(prisma.opportunity.findMany.mock.calls[0][0].where.updatedAt.lt.getTime())
      .toBe(diasAtras(7).getTime());
  });

  it('lead sem nome nem empresa cai no telefone', async () => {
    prisma.opportunity.findMany.mockResolvedValue([lead({ name: null, company: null, phone: '5512999' })]);
    await svc.varrer(AGORA);
    expect(notif.create.mock.calls[0][1].body).toContain('5512999');
  });

  it('tick nao roda quando outra replica ja tem o lock', async () => {
    const lockOcupado = { acquire: vi.fn().mockResolvedValue(null) } as any;
    const s = new StaleLeadService(prisma, notif, lockOcupado);
    await s.tick();
    expect(prisma.opportunity.findMany).not.toHaveBeenCalled();
  });

  it('falha no banco nao derruba o cron', async () => {
    prisma.opportunity.findMany.mockRejectedValue(new Error('db fora'));
    await expect(svc.tick()).resolves.toBeUndefined();
  });
});

/**
 * Lead órfão e lead parado são problemas diferentes — e mandá-los para o mesmo
 * lugar quebrava os dois avisos.
 *
 * `/fila` esconde quem não tem dono (`sdr.service.ts`), então o SDR que clicasse
 * num aviso de órfão caía numa lista onde aquele lead não está. Aviso que leva a
 * lugar nenhum ensina a ignorar aviso.
 */
describe('StaleLeadService — órfão vai para quem pode distribuir', () => {
  function cenario(oportunidades: any[]) {
    const notifications = { create: vi.fn().mockResolvedValue({}) };
    const prisma: any = {
      opportunity: {
        findMany: vi.fn().mockResolvedValue(oportunidades),
        updateMany: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
      sellerActivity: { findMany: vi.fn().mockResolvedValue([]) },
      leadBatch: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const svc = new StaleLeadService(prisma, notifications as any, {} as any);
    return { svc, notifications, prisma };
  }

  const velho = new Date('2026-08-01T10:00:00Z');
  const agora = new Date('2026-08-20T10:00:00Z');

  it('lead COM dono é cobrança do dono, e aponta para a fila', async () => {
    const { svc, notifications } = cenario([
      { id: 'o1', tenantId: 't1', company: 'Transportes Silva', assignedSellerId: 's1', updatedAt: velho },
    ]);

    await svc.varrer(agora);

    const aviso = notifications.create.mock.calls[0][1];
    expect(aviso.title).toMatch(/Lead parado/);
    expect(aviso.link).toBe('/fila');
  });

  it('lead SEM dono vira pedido de distribuição, e aponta para onde se atribui', async () => {
    const { svc, notifications } = cenario([
      { id: 'o1', tenantId: 't1', company: 'Ouro Cargo', assignedSellerId: null, updatedAt: velho },
    ]);

    await svc.varrer(agora);

    const aviso = notifications.create.mock.calls[0][1];
    expect(aviso.title).toMatch(/sem vendedor/);
    // O texto NÃO manda "retomar": quem nunca recebeu o lead não tem o que retomar.
    expect(aviso.body).toMatch(/[Dd]istribua/);
    expect(aviso.link).toBe('/opportunities');
  });

  // Um pedido, uma notificação. Cinco órfãos não são cinco avisos do mesmo assunto.
  it('vários órfãos viram UM aviso com a contagem', async () => {
    const { svc, notifications } = cenario([
      { id: 'o1', tenantId: 't1', company: 'A', assignedSellerId: null, updatedAt: velho },
      { id: 'o2', tenantId: 't1', company: 'B', assignedSellerId: null, updatedAt: velho },
      { id: 'o3', tenantId: 't1', company: 'C', assignedSellerId: null, updatedAt: velho },
    ]);

    await svc.varrer(agora);

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create.mock.calls[0][1].title).toMatch(/3 lead/);
  });

  it('lote importado e não distribuído é avisado pela causa, com link do lote', async () => {
    const { svc, notifications, prisma } = cenario([]);
    prisma.opportunity.findMany.mockResolvedValue([
      { id: 'o1', tenantId: 't1', company: 'X', assignedSellerId: 's1', updatedAt: velho },
    ]);
    prisma.leadBatch.findMany.mockResolvedValue([
      { id: 'b1', tenantId: 't1', name: 'Feira ago/26', createdAt: velho },
    ]);
    prisma.opportunity.count.mockResolvedValue(42);

    await svc.varrer(agora);

    const doLote = notifications.create.mock.calls.find((c: any[]) => /sem distribuir/.test(c[1].title));
    expect(doLote).toBeTruthy();
    expect(doLote![1].body).toMatch(/42 lead/);
    expect(doLote![1].link).toBe('/lead-batches');
  });
});
