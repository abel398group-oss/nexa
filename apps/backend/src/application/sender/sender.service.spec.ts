import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { SenderService } from './sender.service';

// As regras puras nao usam as dependencias — instancia com mocks vazios.
function makeSvc(): SenderService {
  return new SenderService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { acquire: async () => async () => {} } as any);
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

  const svc = new SenderService(prisma as any, {} as any, {} as any, {} as any, waha as any, {} as any, { acquire: async () => async () => {} } as any);
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
      return new SenderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, { acquire: async () => async () => {} } as any);
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

// ============================================================================
// Harness do caminho de envio de campanha de MENSAGEM (anti-ban/seguranca).
// Cobre o que faltava: recuperacao de travados, limites diario/horario, claim
// atomico (anti-duplicacao), skip de opt-out e o caminho feliz de envio.
// Rede de protecao para refatorar o worker (A4) sem quebrar essas garantias.
// ============================================================================
// Relogio fixo: 2026-07-09 15:30 UTC → 12h Brasilia (UTC-3), dentro da janela 7–19.
const MSG_NOW = new Date('2026-07-09T15:30:00Z');

// Reproduz today()/thisHour() do servico p/ casar os stamps do numero (evita reset).
function msgStamps() {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { today, thisHour: `${today}-${String(d.getHours()).padStart(2, '0')}` };
}

function msgNumber(over: Partial<any> = {}) {
  const { today, thisHour } = msgStamps();
  return {
    id: 'num1', tenantId: 't1', phone: '5511999999999', sessionName: 'default', active: true,
    dailyLimit: 30, sentToday: 0, dayStamp: today,
    hourlyLimit: 8, sentThisHour: 0, hourStamp: thisHour, warmupStage: 3, // cap efetivo = 30
    ...over,
  };
}

const MSG_CAMPAIGN = {
  id: 'camp1', tenantId: 't1', name: 'Campanha Teste', type: 'message', template: 'Ola {{nome}}',
  status: 'running', link: null, mediaUrl: null, mediaName: null, sendLimit: null, scheduledAt: null,
};
const MSG_TARGET = { id: 'tgt1', campaignId: 'camp1', tenantId: 't1', phone: '5511988887777', name: 'Ana', status: 'queued' };

describe('SenderService.tick() — envio de campanha de mensagem (harness)', () => {
  let prisma: any, contacts: any, conversations: any, followup: any, waha: any, tmsLookup: any;
  const makeService = () => new SenderService(prisma, contacts, conversations, followup, waha, tmsLookup, { acquire: async () => async () => {} } as any);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MSG_NOW);
    delete process.env.REDIS_URL; // sem Redis → estado anti-ban local (lastSentAt=0)

    prisma = {
      campaignTarget: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(MSG_TARGET),
        update: vi.fn().mockResolvedValue({}),
      },
      campaign: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        // 1a findFirst = status (null); 2a = campanha de mensagem
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(MSG_CAMPAIGN),
        update: vi.fn().mockResolvedValue({}),
      },
      senderSettings: { findUnique: vi.fn().mockResolvedValue(null) },
      senderNumber: {
        findFirst: vi.fn().mockResolvedValue(msgNumber()),
        create: vi.fn().mockResolvedValue(msgNumber()),
        update: vi.fn().mockImplementation(({ data }: any) => ({ ...msgNumber(), ...data })),
      },
      aiConversation: {
        findFirst: vi.fn().mockResolvedValue({ id: 'conv1', tenantId: 't1', phone: MSG_TARGET.phone, status: 'open' }),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    contacts = { create: vi.fn().mockResolvedValue({ id: 'c1', status: 'active' }) };
    conversations = { create: vi.fn().mockResolvedValue({ id: 'conv1' }), addMessage: vi.fn().mockResolvedValue({}) };
    followup = { schedule: vi.fn().mockResolvedValue({}) };
    waha = { sendText: vi.fn(), sendFile: vi.fn(), sendStatusText: vi.fn(), sendStatusImage: vi.fn() };
    tmsLookup = { batchLookup: vi.fn().mockResolvedValue(new Map()) };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('recupera alvos travados em "sending" no inicio do tick', async () => {
    prisma.campaign.findFirst = vi.fn().mockResolvedValue(null); // sem campanha → sai cedo
    await makeService().tick();
    const call = prisma.campaignTarget.updateMany.mock.calls[0][0];
    expect(call.where.status).toBe('sending');
    expect(call.data.status).toBe('queued');
  });

  it('NAO envia fora da janela comercial', async () => {
    prisma.senderSettings.findUnique.mockResolvedValue({ waStartHour: 20, waEndHour: 22 }); // 12h fora
    await makeService().tick();
    expect(prisma.campaignTarget.findFirst).not.toHaveBeenCalled();
    expect(conversations.addMessage).not.toHaveBeenCalled();
    expect(waha.sendText).not.toHaveBeenCalled();
  });

  it('NAO envia com o limite diario do numero atingido', async () => {
    prisma.senderNumber.findFirst.mockResolvedValue(msgNumber({ sentToday: 30 })); // cap=30
    await makeService().tick();
    expect(prisma.campaignTarget.findFirst).not.toHaveBeenCalled();
    expect(conversations.addMessage).not.toHaveBeenCalled();
  });

  it('NAO envia com o limite por hora atingido', async () => {
    prisma.senderNumber.findFirst.mockResolvedValue(msgNumber({ sentThisHour: 8 })); // hourlyLimit=8
    await makeService().tick();
    expect(prisma.campaignTarget.findFirst).not.toHaveBeenCalled();
    expect(conversations.addMessage).not.toHaveBeenCalled();
  });

  it('claim atomico perdido (outro tick pegou o alvo) → nao envia', async () => {
    prisma.campaignTarget.updateMany
      .mockResolvedValueOnce({ count: 1 }) // recuperacao
      .mockResolvedValueOnce({ count: 0 }); // claim perdido
    await makeService().tick();
    expect(conversations.addMessage).not.toHaveBeenCalled();
    expect(followup.schedule).not.toHaveBeenCalled();
  });

  it('pula contato opted_out (LGPD) → marca skipped e nao envia', async () => {
    contacts.create.mockResolvedValue({ id: 'c1', status: 'opted_out' });
    await makeService().tick();
    const skip = prisma.campaignTarget.update.mock.calls.find((c: any[]) => c[0]?.data?.status === 'skipped');
    expect(skip).toBeTruthy();
    expect(conversations.addMessage).not.toHaveBeenCalled();
  });

  it('caminho feliz: envia uma vez, carimba campaignId e agenda follow-up', async () => {
    await makeService().tick();
    expect(conversations.addMessage).toHaveBeenCalledTimes(1);
    const msg = conversations.addMessage.mock.calls[0][2];
    expect(msg.intent).toBe('outbound_campaign');
    expect(msg.metadata).toMatchObject({ campaignId: 'camp1' });
    expect(followup.schedule).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalled(); // incrementa contadores + marca sent
  });

  // ── sendLinkOnFirst no WhatsApp (2026-07-29, pré go-live) ──────────────────
  // Antes o link ia SEMPRE na 1ª mensagem (a flag só existia no e-mail).
  // Link em disparo frio de número não-oficial = padrão clássico de ban.

  it('link NAO vai na 1ª mensagem quando sendLinkOnFirst=false (default)', async () => {
    prisma.campaign.findFirst = vi.fn().mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...MSG_CAMPAIGN, link: 'https://hipertms.com.br/demo', sendLinkOnFirst: false });
    await makeService().tick();
    const msg = conversations.addMessage.mock.calls[0][2];
    expect(msg.content).not.toContain('https://hipertms.com.br/demo');
  });

  it('link VAI na 1ª mensagem quando sendLinkOnFirst=true (opt-in explícito)', async () => {
    prisma.campaign.findFirst = vi.fn().mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...MSG_CAMPAIGN, link: 'https://hipertms.com.br/demo', sendLinkOnFirst: true });
    await makeService().tick();
    const msg = conversations.addMessage.mock.calls[0][2];
    expect(msg.content).toContain('https://hipertms.com.br/demo');
  });
});

// ── Dedup ENTRE campanhas (2026-07-29, pré go-live de leads) ─────────────────
// O dedup interno só olha a própria lista; sem o bloco novo, o mesmo telefone
// em dois CSVs recebia a prospecção 2x. Quem já tem 'sent' em qualquer campanha
// do tenant entra como skipped/ja_enviado (visível no relatório).
describe('SenderService.createCampaign — dedup entre campanhas', () => {
  let prisma: any, contacts: any, tmsLookup: any;
  const makeService = () =>
    new SenderService(prisma, contacts, {} as any, {} as any, {} as any, tmsLookup, { acquire: async () => async () => {} } as any);

  beforeEach(() => {
    prisma = {
      campaignTarget: { findMany: vi.fn().mockResolvedValue([]) },
      campaign: {
        create: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'camp-new', ...data, _count: { targets: data.targets?.create?.length ?? 0 } })),
      },
      contact: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    contacts = {};
    tmsLookup = { batchLookup: vi.fn().mockResolvedValue(new Map()) };
  });

  const dto = (phones: string[]) => ({
    name: 'Lote 2', template: 'Ola {{nome}}',
    phones: phones.map((phone) => ({ phone })),
  });

  it('telefone com "sent" em campanha anterior → skipped/ja_enviado, fora da fila', async () => {
    prisma.campaignTarget.findMany.mockResolvedValue([{ phone: '5511900000001' }]);
    const r = await makeService().createCampaign('t1', dto(['5511900000001', '5511900000002']));
    expect(r.skippedAlreadySent).toBe(1);
    expect(r.included).toBe(1);
    const created = prisma.campaign.create.mock.calls[0][0].data.targets.create;
    const dup = created.find((t: any) => t.phone === '5511900000001');
    expect(dup).toMatchObject({ status: 'skipped', error: 'ja_enviado' });
    const ok = created.find((t: any) => t.phone === '5511900000002');
    expect(ok.status).toBeUndefined(); // default queued
  });

  it('a consulta só considera status=sent (failed/skipped não bloqueiam reenvio)', async () => {
    await makeService().createCampaign('t1', dto(['5511900000001']));
    const where = prisma.campaignTarget.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('sent');
    expect(where.tenantId).toBe('t1');
  });

  it('nenhum repetido → nada pulado, todos na fila', async () => {
    const r = await makeService().createCampaign('t1', dto(['5511900000001', '5511900000002']));
    expect(r.skippedAlreadySent).toBe(0);
    expect(r.included).toBe(2);
  });

  // Heurística de nome (2026-08-01): nome que bate com TMS concorrente não entra na fila
  it('nome de concorrente conhecido → skipped/suspeito_concorrente', async () => {
    const r = await makeService().createCampaign('t1', {
      name: 'Lote 3', template: 'Ola {{nome}}',
      phones: [
        { phone: '5511900000001', name: 'Equipe Bsoft TMS' },
        { phone: '5511900000002', name: 'Transportadora Silva' },
        { phone: '5511900000003' }, // sem nome: heurística não se aplica
      ],
    });
    expect(r.skippedSuspect).toBe(1);
    expect(r.included).toBe(2);
    const created = prisma.campaign.create.mock.calls[0][0].data.targets.create;
    const suspect = created.find((t: any) => t.phone === '5511900000001');
    expect(suspect).toMatchObject({ status: 'skipped', error: 'suspeito_concorrente' });
  });

  it('heurística não pega nome parecido mas legítimo (anti falso positivo)', async () => {
    const r = await makeService().createCampaign('t1', {
      name: 'Lote 4', template: 'Ola',
      phones: [
        { phone: '5511900000001', name: 'Analista Senior' },     // "senior" solto não bloqueia
        { phone: '5511900000002', name: 'ESL Transportes' },     // só "esl cloud" bloqueia
      ],
    });
    expect(r.skippedSuspect).toBe(0);
    expect(r.included).toBe(2);
  });

  // Blocklist (2026-08-01): concorrente com status='blocked' nunca entra na fila
  it('telefone na blocklist (status=blocked) → skipped/bloqueado, fora da fila', async () => {
    prisma.contact.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where?.status === 'blocked' ? [{ phone: '5511961688954' }] : []));
    const r = await makeService().createCampaign('t1', dto(['5511961688954', '5511900000002']));
    expect(r.skippedBlocked).toBe(1);
    expect(r.included).toBe(1);
    const created = prisma.campaign.create.mock.calls[0][0].data.targets.create;
    const blocked = created.find((t: any) => t.phone === '5511961688954');
    expect(blocked).toMatchObject({ status: 'skipped', error: 'bloqueado' });
  });
});
