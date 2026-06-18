import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { SenderService } from './sender.service';

// As regras puras nao usam as dependencias — instancia com mocks vazios.
function makeSvc(): SenderService {
  return new SenderService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
}

// ── helpers para testes de status WhatsApp (ADR-026) ────────────────────────
// Monta um SenderService com prisma e waha mockados para testar o tick() de status.
function makeStatusSvc(overrides: {
  statusCampaign?: Partial<any> | null;
  wahaResult?: { sent: boolean; postId?: string; reason?: string };
}) {
  const campaign = overrides.statusCampaign !== undefined
    ? overrides.statusCampaign
      ? { id: 'c1', tenantId: 't1', name: 'Test Status', type: 'status', template: 'Texto do status', mediaUrl: null, scheduledAt: null, statusPostedAt: null, ...overrides.statusCampaign }
      : null
    : null;

  const wahaResult = overrides.wahaResult ?? { sent: true, postId: 'pid123' };

  const prisma = {
    campaignTarget: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    campaign: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockImplementation(({ where }: any) => {
        // 1ª chamada: findFirst do status campaign (type:'status') → retorna o mock
        // 2ª chamada (se chegou): findFirst de campanha message → null
        if (where?.type === 'status') return Promise.resolve(campaign);
        return Promise.resolve(null);
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    senderSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    senderNumber: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'n1', tenantId: 't1', phone: '551199', active: true,
        dailyLimit: 30, sentToday: 0, dayStamp: null,
        hourlyLimit: 8, sentThisHour: 0, hourStamp: null, warmupStage: 3,
      }),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
  };

  const waha = {
    sendStatusText: vi.fn().mockResolvedValue(wahaResult),
    sendStatusImage: vi.fn().mockResolvedValue(wahaResult),
  };

  const svc = new SenderService(prisma as any, {} as any, {} as any, {} as any, waha as any, {} as any);
  return { svc, prisma, waha };
}

afterEach(() => vi.useRealTimers());

// helper: fixa o relogio num horario UTC (os metodos calculam Brasilia = UTC-3)
function setUtc(hour: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.UTC(2026, 5, 13, hour, 0, 0)));
}

describe('SenderService — regras de negocio', () => {
  describe('effectiveDailyLimit (G7 — aquecimento)', () => {
    const svc = makeSvc();
    it('respeita a fase de warmup (0->10, 1->15, 2->20, 3->30)', () => {
      expect(svc.effectiveDailyLimit({ dailyLimit: 100, warmupStage: 0 })).toBe(10);
      expect(svc.effectiveDailyLimit({ dailyLimit: 100, warmupStage: 1 })).toBe(15);
      expect(svc.effectiveDailyLimit({ dailyLimit: 100, warmupStage: 2 })).toBe(20);
      expect(svc.effectiveDailyLimit({ dailyLimit: 100, warmupStage: 3 })).toBe(30);
    });
    it('fase acima do maximo fica no teto (30)', () => {
      expect(svc.effectiveDailyLimit({ dailyLimit: 100, warmupStage: 9 })).toBe(30);
    });
    it('nunca passa do dailyLimit configurado', () => {
      expect(svc.effectiveDailyLimit({ dailyLimit: 5, warmupStage: 3 })).toBe(5);
    });
  });

  describe('greeting (G3 — saudacao por horario, Brasilia)', () => {
    it('manha -> Bom dia', () => {
      setUtc(13); // 10h BRT
      expect(SenderService.greeting()).toBe('Bom dia');
    });
    it('tarde -> Boa tarde', () => {
      setUtc(18); // 15h BRT
      expect(SenderService.greeting()).toBe('Boa tarde');
    });
    it('noite -> Boa noite', () => {
      setUtc(23); // 20h BRT
      expect(SenderService.greeting()).toBe('Boa noite');
    });
    it('madrugada -> Boa noite', () => {
      setUtc(4); // 1h BRT
      expect(SenderService.greeting()).toBe('Boa noite');
    });
  });

  describe('withinWaWindow (janela WhatsApp por tenant; default 7h-19h Brasilia)', () => {
    // prisma mockado sem settings salvos -> cai nos defaults de env (7-19)
    function svcWithPrisma(): SenderService {
      const prisma = { senderSettings: { findUnique: vi.fn().mockResolvedValue(null) } };
      return new SenderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    }
    const within = () => (svcWithPrisma() as any).withinWaWindow('default') as Promise<boolean>;
    it('dentro do horario comercial -> true', async () => {
      setUtc(13); // 10h BRT
      expect(await within()).toBe(true);
    });
    it('antes das 7h -> false', async () => {
      setUtc(9); // 6h BRT
      expect(await within()).toBe(false);
    });
    it('depois das 19h -> false', async () => {
      setUtc(23); // 20h BRT
      expect(await within()).toBe(false);
    });
  });

  describe('render (G1 — opt-out LGPD + placeholders)', () => {
    const render = (tpl: string, name?: string | null) => (makeSvc() as any).render(tpl, name) as string;

    it('substitui {{nome}} pelo primeiro nome', () => {
      expect(render('Ola {{nome}}!', 'Joao Silva')).toContain('Ola Joao!');
    });
    it('sem nome usa "tudo bem"', () => {
      expect(render('Ola {{nome}}!')).toContain('Ola tudo bem!');
    });
    it('anexa o rodape de opt-out quando falta (LGPD)', () => {
      const out = render('Mensagem qualquer', 'Ana');
      expect(out).toContain('Responda SAIR');
    });
    it('NAO duplica o rodape se ja houver "Responda SAIR"', () => {
      const tpl = 'Promo! Responda SAIR para sair.';
      const out = render(tpl, 'Ana');
      expect(out.match(/Responda SAIR/g)?.length).toBe(1);
    });
    it('substitui {{saudacao}} pela saudacao do horario', () => {
      setUtc(13); // Bom dia
      expect(render('{{saudacao}}, {{nome}}', 'Ana')).toContain('Bom dia, Ana');
    });
  });
});

// ============================================================================
// Canal Status WhatsApp — ADR-026
// ============================================================================
describe('SenderService — Canal Status WhatsApp (ADR-026)', () => {
  beforeEach(() => {
    // garante horario dentro da janela comercial (10h BRT = 13h UTC)
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 5, 18, 13, 0, 0)));
  });
  afterEach(() => vi.useRealTimers());

  it('envia texto de status sem targets e grava statusPostedAt + status done', async () => {
    const { svc, prisma, waha } = makeStatusSvc({ statusCampaign: {}, wahaResult: { sent: true, postId: 'pid1' } });
    await svc.tick();
    expect(waha.sendStatusText).toHaveBeenCalledOnce();
    expect(waha.sendStatusImage).not.toHaveBeenCalled();
    expect(prisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'done', statusPostId: 'pid1' }),
      }),
    );
  });

  it('envia imagem de status quando mediaUrl esta preenchida', async () => {
    const { svc, waha } = makeStatusSvc({
      statusCampaign: { mediaUrl: 'https://cdn.example.com/banner.jpg' },
      wahaResult: { sent: true, postId: 'pid2' },
    });
    await svc.tick();
    expect(waha.sendStatusImage).toHaveBeenCalledWith('https://cdn.example.com/banner.jpg', expect.anything());
    expect(waha.sendStatusText).not.toHaveBeenCalled();
  });

  it('pausa a campanha se o WAHA rejeitar o envio', async () => {
    const { svc, prisma } = makeStatusSvc({ statusCampaign: {}, wahaResult: { sent: false, reason: 'waha_500' } });
    await svc.tick();
    expect(prisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'paused' }) }),
    );
  });

  it('nao processa targets em um tick que ja executou campanha de status', async () => {
    const { svc, prisma } = makeStatusSvc({ statusCampaign: {}, wahaResult: { sent: true, postId: 'pid3' } });
    await svc.tick();
    // findFirst de campanha message (tipo 'running' com targets) nao deve ser chamado
    const callsForMessageCampaign = (prisma.campaign.findFirst as any).mock.calls.filter(
      (c: any[]) => !c[0]?.where?.type,
    );
    expect(callsForMessageCampaign).toHaveLength(0);
  });

  it('nao dispara campanha de status fora da janela comercial (antes das 7h BRT)', async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 5, 18, 9, 0, 0))); // 6h BRT
    const { svc, waha } = makeStatusSvc({ statusCampaign: {} });
    await svc.tick();
    expect(waha.sendStatusText).not.toHaveBeenCalled();
    expect(waha.sendStatusImage).not.toHaveBeenCalled();
  });

  it('nao dispara quando nao ha campanha de status pendente', async () => {
    const { svc, waha } = makeStatusSvc({ statusCampaign: null });
    await svc.tick();
    expect(waha.sendStatusText).not.toHaveBeenCalled();
  });
});
