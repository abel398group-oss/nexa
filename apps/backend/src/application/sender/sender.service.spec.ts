import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SenderService } from './sender.service';

// Lista de bloqueio (LGPD). Por padrao NINGUEM esta bloqueado — os testes que
// precisam simular alguem na lista sobrescrevem o mock.
// Funcoes simples de proposito: `vi.restoreAllMocks()` de outros blocos zerava
// a implementacao de vi.fn() e o mock passava a devolver undefined.
const OPTOUT_MOCK = {
  blockedPhones: async () => new Set<string>(),
  blockedEmails: async () => new Set<string>(),
  isBlocked: async () => false,
  register: async () => undefined,
} as any;

// As regras puras nao usam as dependencias — instancia com mocks vazios.
function makeSvc(): SenderService {
  return new SenderService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { acquire: async () => async () => {} } as any, OPTOUT_MOCK);
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

  const svc = new SenderService(prisma as any, {} as any, {} as any, {} as any, waha as any, {} as any, { acquire: async () => async () => {} } as any, OPTOUT_MOCK);
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
      return new SenderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, { acquire: async () => async () => {} } as any, OPTOUT_MOCK);
    }
    const within = () => (svcWithPrisma() as any).withinWaWindow('default') as Promise<boolean>;

    // Este bloco testa HORA, não dia da semana — a data fixa do helper `setUtc`
    // (13/06/2026) por acaso cai num sábado, e o gate de fim de semana (novo,
    // 21/08/2026) bloquearia os três testes abaixo por um motivo que não é o
    // deles. O fim de semana tem describe próprio, com datas explícitas.
    beforeEach(() => { process.env.SENDER_WA_WEEKEND = 'true'; });
    afterEach(() => { delete process.env.SENDER_WA_WEEKEND; });
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

  /**
   * Fim de semana (21/08/2026, paridade com o e-mail — ver
   * email-campaign-guards.spec.ts). Auditoria confirmou a assimetria: o e-mail já
   * bloqueava sábado/domingo por padrão, o WhatsApp não bloqueava nada — só a
   * hora do dia. É o canal com a pior consequência de erro (a denúncia de spam
   * do fim de semana é o gatilho clássico de ban de número).
   */
  describe('withinWaWindow — fim de semana', () => {
    function svcWithPrisma(): SenderService {
      const prisma = { senderSettings: { findUnique: vi.fn().mockResolvedValue(null) } };
      return new SenderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, { acquire: async () => async () => {} } as any, OPTOUT_MOCK);
    }
    const dentro = () => (svcWithPrisma() as any).withinWaWindow('default') as Promise<boolean>;

    afterEach(() => {
      delete process.env.SENDER_WA_WEEKEND;
    });

    it('dia útil às 10h: aberta', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-10T10:00:00-03:00')); // segunda
      expect(await dentro()).toBe(true);
    });

    it('sábado no meio do horário comercial: fechada', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-15T10:00:00-03:00'));
      expect(await dentro()).toBe(false);
    });

    it('domingo: fechada', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-16T10:00:00-03:00'));
      expect(await dentro()).toBe(false);
    });

    it('SENDER_WA_WEEKEND=true libera o fim de semana', async () => {
      process.env.SENDER_WA_WEEKEND = 'true';
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-15T10:00:00-03:00'));
      expect(await dentro()).toBe(true);
    });

    // A virada do dia é onde um deslocamento de fuso errado apareceria: 21h de
    // sábado em Brasília já é domingo em UTC. Sem subtrair as 3h primeiro, o
    // gate computaria o dia errado bem na hora em que mais importa acertar.
    it('sábado 22h BRT (já domingo em UTC): continua contando como sábado — fechada', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-15T22:00:00-03:00'));
      expect(await dentro()).toBe(false);
    });
  });

  describe('render (G1 — opt-out LGPD + placeholders)', () => {
    const render = (tpl: string, name?: string | null) => (makeSvc() as any).render(tpl, name) as string;

    it('substitui {{nome}} pelo primeiro nome', () => {
      expect(render('Ola {{nome}}!', 'Joao Silva')).toContain('Ola Joao!');
    });
    // 2026-08-01: o fallback ERA a string "tudo bem", o que produzia
    // "Ola tudo bem!" e, pior, "Bom dia tudo bem, tudo bem?" — em 1.666 dos
    // 3.097 leads (mais da metade da base entra sem nome). Agora o placeholder
    // some e a frase se recompõe. Ver SenderService.tidyMissingName.
    it('sem nome: o placeholder some e a frase fica limpa', () => {
      expect(render('Ola {{nome}}!')).toContain('Ola!');
      expect(render('Ola {{nome}}!')).not.toContain('tudo bem!');
    });
    it('sem nome: vírgula órfã e pontuação dupla não sobram', () => {
      expect(render('{{saudacao}} {{nome}}, tudo bem?')).toMatch(/^(Bom dia|Boa tarde|Boa noite), tudo bem\?/);
      expect(render('{{saudacao}}, {{nome}}. Sou a Lia.')).toMatch(/^(Bom dia|Boa tarde|Boa noite)\. Sou a Lia\./);
    });
    it('nome-lixo de lista raspada é tratado como sem nome', () => {
      expect(render('Ola {{nome}}!', '5511999998888')).toContain('Ola!');
      expect(render('Ola {{nome}}!', '🚛')).toContain('Ola!');
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
    // 3º arg (linha) vem undefined porque o fixture não declara `linha` na campanha.
    expect(waha.sendStatusImage).toHaveBeenCalledWith('https://cdn.example.com/banner.jpg', expect.anything(), undefined);
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
  const makeService = () => new SenderService(prisma, contacts, conversations, followup, waha, tmsLookup, { acquire: async () => async () => {} } as any, OPTOUT_MOCK);

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
    waha = {
      sendText: vi.fn(), sendFile: vi.fn(), sendStatusText: vi.fn(), sendStatusImage: vi.fn(),
      // DISP-022: o pré-voo do tick pergunta pela linha e pela sessão antes de
      // reivindicar alvo. O caso neutro do harness é "tudo configurado e no ar".
      linhaEstaConfigurada: vi.fn().mockReturnValue(true),
      getSessionStatus: vi.fn().mockResolvedValue({ status: 'WORKING', phone: null }),
    };
    tmsLookup = { batchLookup: vi.fn().mockResolvedValue(new Map()), batchLookupVerificado: vi.fn().mockResolvedValue({ clientes: new Map(), falhou: false }) };
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

  // ── Escopo da busca de conversa (16/08/2026) ──────────────────────────────
  // Dois bugs de produção moravam nesta única query, e os dois eram silenciosos:
  //
  //  • sem `sourceChannel`/ticket, a campanha reaproveitava a conversa do PORTAL de um
  //    cliente com chamado aberto. A copy fria era gravada dentro do chamado (visível
  //    para o cliente) e o despacho de portal marca ack=1 sem chamar o WAHA — a campanha
  //    dizia "enviada" sem ter enviado.
  //  • sem `wahaLine`, a campanha de vendas reaproveitava a thread da linha principal e
  //    saía pelo número errado, ainda reportando que rodou em vendas.
  //
  // Por isso se afirma o CONTEÚDO do `where`, não que "chamou o findFirst": a versão com
  // bug chamava exatamente o mesmo método.
  it('busca conversa só de WhatsApp, sem chamado e da linha da campanha', async () => {
    await makeService().tick();

    const { where } = prisma.aiConversation.findFirst.mock.calls[0][0];
    expect(where.sourceChannel).toBe('whatsapp');
    expect(where.ticketCategory).toBeNull();
    expect(where.ticketNumber).toBeNull();
    // Campanha sem `linha` é principal, e `null` é o estado de toda conversa anterior
    // à divisão de números — as duas precisam casar.
    expect(where.OR).toEqual([{ wahaLine: 'principal' }, { wahaLine: null }]);
  });

  it('campanha de vendas não enxerga a thread da linha principal', async () => {
    prisma.campaign.findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...MSG_CAMPAIGN, linha: 'vendas' });

    await makeService().tick();

    const { where } = prisma.aiConversation.findFirst.mock.calls[0][0];
    expect(where.wahaLine).toBe('vendas');
    // Sem OR: linha não-principal casa exata. Aceitar `null` aqui traria o bug de volta.
    expect(where.OR).toBeUndefined();
  });

  it('sem conversa naquela linha, cria uma nova já carimbada com a linha', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue(null);
    prisma.campaign.findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...MSG_CAMPAIGN, linha: 'vendas' });

    await makeService().tick();

    expect(conversations.create).toHaveBeenCalledWith('t1', expect.objectContaining({ wahaLine: 'vendas' }));
  });

  // ── DISP-022: pré-voo da linha antes de reivindicar alvo ──────────────────
  it('linha da campanha sem env → campanha PAUSADA, nenhum alvo consumido', async () => {
    prisma.campaign.findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...MSG_CAMPAIGN, linha: 'vendas' });
    waha.linhaEstaConfigurada.mockReturnValue(false);

    await makeService().tick();

    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp1' }, data: { status: 'paused' },
    });
    expect(prisma.campaignTarget.findFirst).not.toHaveBeenCalled();
    expect(conversations.addMessage).not.toHaveBeenCalled();
  });

  it('sessão fora do ar → tick segura sem queimar alvo (campanha continua running)', async () => {
    waha.getSessionStatus.mockResolvedValue({ status: 'FAILED', phone: null });

    await makeService().tick();

    // nada consumido, nada pausado: o próximo tick tenta de novo quando a sessão voltar
    expect(prisma.campaignTarget.findFirst).not.toHaveBeenCalled();
    expect(conversations.addMessage).not.toHaveBeenCalled();
    expect(prisma.campaign.update).not.toHaveBeenCalled();
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

  // ── Teto global do numero (NumberBudgetService) ────────────────────────────
  // Os dois limites acima contam so o que ESTE worker mandou. O mesmo chip
  // tambem responde lead, manda digest do Monitor e fecha conversa — nada disso
  // passava por contador nenhum, entao "0/30 hoje" podia significar 60 envios
  // reais. Quem cede quando o numero satura e a campanha, nunca o alerta.
  const comOrcamento = (budget: any) =>
    new SenderService(prisma, contacts, conversations, followup, waha, tmsLookup,
      { acquire: async () => async () => {} } as any, OPTOUT_MOCK, undefined, budget);

  it('NAO envia com o teto global do numero estourado, mesmo com o limite proprio folgado', async () => {
    // numero zerado para ESTE worker — o que estourou foi o trafego dos outros canais
    prisma.senderNumber.findFirst.mockResolvedValue(msgNumber({ sentToday: 0, sentThisHour: 0 }));
    const budget = {
      overCeiling: vi.fn().mockResolvedValue({
        over: true,
        reason: 'teto DIÁRIO do número atingido (250/250 somando todos os canais: monitor=240, lia=10)',
        snapshot: {},
      }),
      snapshot: vi.fn().mockResolvedValue({}),
    };

    await comOrcamento(budget).tick();

    expect(budget.overCeiling).toHaveBeenCalled();
    expect(prisma.campaignTarget.findFirst).not.toHaveBeenCalled();
    expect(conversations.addMessage).not.toHaveBeenCalled();
  });

  it('envia normalmente com o teto global folgado', async () => {
    const budget = {
      overCeiling: vi.fn().mockResolvedValue({ over: false, snapshot: {} }),
      snapshot: vi.fn().mockResolvedValue({}),
    };

    await comOrcamento(budget).tick();

    expect(conversations.addMessage).toHaveBeenCalled();
  });

  it('sem o servico de orcamento o worker segue como antes (nao quebra)', async () => {
    await makeService().tick(); // construido sem budget
    expect(conversations.addMessage).toHaveBeenCalled();
  });

  it('rotula o envio de campanha como origin "campaign" para o orcamento', async () => {
    await makeService().tick();
    const [, , dto] = conversations.addMessage.mock.calls[0];
    expect(dto.sendOrigin).toBe('campaign');
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

  // ── DISP-001 (auditoria 2026-08-02): 'sent' tem que significar ENTREGUE ─────
  // O addMessage engolia a recusa do WAHA (só logava) e o worker seguia direto
  // para o `sent`. Com o WhatsApp fora do ar a campanha era reportada como 100%
  // enviada sem nenhuma mensagem ter saído.

  it('exige entrega: pede requireDelivery ao addMessage', async () => {
    await makeService().tick();
    expect(conversations.addMessage.mock.calls[0][2].requireDelivery).toBe(true);
  });

  // ── DISP-014 (auditoria 2026-08-02): este worker é SÓ do WhatsApp ───────────
  // Sem o filtro de canal ele pegava campanha de e-mail (o worker de e-mail
  // filtra, este não filtrava) e tentava mandar WhatsApp pro telefone sintético
  // `email:<addr>` — consumindo o alvo e impedindo o envio real do e-mail.
  it('só considera campanhas do canal whatsapp (não rouba alvo de e-mail)', async () => {
    await makeService().tick();
    const whereCampanha = prisma.campaign.findFirst.mock.calls.at(-1)[0].where;
    expect(whereCampanha.channel).toBe('whatsapp');
    // recuperação de travados e fechamento de campanha também são escopados
    expect(prisma.campaignTarget.updateMany.mock.calls[0][0].where.campaign).toMatchObject({ channel: 'whatsapp' });
    expect(prisma.campaign.updateMany.mock.calls[0][0].where.channel).toBe('whatsapp');
  });

  // ── DISP-021 (incidente real, 2026-08-03) ──────────────────────────────────
  // O WAHA ENTREGOU a mensagem do Mateus mas estourou o timeout de 15s antes de
  // responder. O DISP-001 marcou 'failed', o operador clicou em "Reenviar
  // falhas" e o lead recebeu DUAS vezes (11:35 e 11:45).
  // Regra: recusa DEFINITIVA (4xx/sessão/allowlist) → falha, pode reenviar.
  // Timeout/rede/5xx → NÃO SABEMOS: conta como enviado e sai do reenvio.
  // Duplicata em prospecção fria é spam e risco de ban; pior que não confirmar.

  it('timeout do WAHA (entrega incerta) → NAO marca falha, para nao duplicar no reenvio', async () => {
    const err: any = new Error('whatsapp_nao_enviado: timeout_sem_confirmacao');
    err.definitive = false; // WAHA pode ter entregue
    conversations.addMessage.mockRejectedValue(err);

    await makeService().tick();

    const upd = prisma.campaignTarget.update.mock.calls.map((c: any[]) => c[0].data);
    expect(upd.some((d: any) => d.status === 'failed')).toBe(false);
    const marcado = upd.find((d: any) => d.status === 'sent');
    expect(marcado).toBeTruthy();
    expect(marcado.error).toBe('entrega_nao_confirmada'); // visível pro operador
  });

  it('recusa definitiva do WAHA → marca falha (reenvio e seguro)', async () => {
    const err: any = new Error('whatsapp_nao_enviado: waha_401');
    err.definitive = true; // o WAHA recusou; nao saiu
    conversations.addMessage.mockRejectedValue(err);

    await makeService().tick();

    const upd = prisma.campaignTarget.update.mock.calls.map((c: any[]) => c[0].data);
    expect(upd.some((d: any) => d.status === 'failed')).toBe(true);
    expect(upd.some((d: any) => d.status === 'sent')).toBe(false);
  });

  it('WAHA recusa o envio → alvo vira "failed" (nunca "sent") e sem follow-up', async () => {
    conversations.addMessage.mockRejectedValue(new Error('whatsapp_nao_enviado: waha_500'));
    await makeService().tick();

    const failed = prisma.campaignTarget.update.mock.calls.find((c: any[]) => c[0]?.data?.status === 'failed');
    expect(failed).toBeTruthy();
    expect(failed[0].data.error).toContain('waha_500');
    // o `sent` mora no $transaction — não pode ter acontecido
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(followup.schedule).not.toHaveBeenCalled();
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

  // ── DISP-017 (validado em produção 2026-08-03) ─────────────────────────────
  // O ANEXO ia sempre, ignorando o sendLinkOnFirst que o link já respeitava:
  // a 1ª mensagem fria saía com uma URL colada mesmo com a opção desmarcada.
  // Regra do negócio: primeiro contato é SÓ TEXTO; material vai depois que o
  // lead responde. Se este teste quebrar, a mensagem fria voltou a levar link.

  it('anexo NAO vai na 1ª mensagem quando sendLinkOnFirst=false', async () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://nexa.example.com';
    prisma.campaign.findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...MSG_CAMPAIGN, mediaUrl: '/uploads/material.pdf', mediaName: 'material.pdf', sendLinkOnFirst: false,
    });
    await makeService().tick();
    const msg = conversations.addMessage.mock.calls[0][2];
    expect(msg.content).not.toContain('/uploads/material.pdf');
    expect(msg.content).not.toContain('📎');
  });

  it('anexo VAI quando sendLinkOnFirst=true', async () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://nexa.example.com';
    prisma.campaign.findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...MSG_CAMPAIGN, mediaUrl: '/uploads/material.pdf', mediaName: 'material.pdf', sendLinkOnFirst: true,
    });
    await makeService().tick();
    const msg = conversations.addMessage.mock.calls[0][2];
    expect(msg.content).toContain('https://nexa.example.com/uploads/material.pdf');
  });
});

// ── DISP-002: retry de falhas (validado em produção 2026-08-03) ──────────────
// O Abel disparou, 1 alvo falhou, clicou em "Reenviar falhas" e o envio saiu.
// O risco de regressão aqui é reenviar para quem NÃO devia: 'skipped' guarda
// opt-out, blocklist, cliente TMS e telefone inválido — nunca pode voltar à fila.
describe('SenderService.retryFailed — só falhas voltam para a fila', () => {
  const makeSvc = (prisma: any) =>
    new SenderService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any,
      { acquire: async () => async () => {} } as any, OPTOUT_MOCK);

  it('recoloca apenas status=failed e limpa o erro', async () => {
    const prisma = {
      campaign: { findFirst: vi.fn().mockResolvedValue({ id: 'c1', name: 'X', status: 'running' }), update: vi.fn() },
      campaignTarget: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    } as any;

    const out = await makeSvc(prisma).retryFailed('t1', 'c1');

    expect(out).toMatchObject({ requeued: 2 });
    const call = prisma.campaignTarget.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ campaignId: 'c1', tenantId: 't1', status: 'failed' });
    expect(call.data).toMatchObject({ status: 'queued', error: null });
  });

  // Loop de bounce (21/08/2026): alvo `failed` com 'bounce …' é endereço morto
  // CONFIRMADO pelo servidor de destino. Reenfileirá-lo gera outro hard bounce, e
  // taxa de rejeição acima de 2% joga o domínio inteiro no spam.
  it('devolução permanente (bounce) NÃO volta para a fila', async () => {
    const prisma = {
      campaign: { findFirst: vi.fn().mockResolvedValue({ id: 'c1', name: 'X', status: 'running' }), update: vi.fn() },
      campaignTarget: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as any;

    await makeSvc(prisma).retryFailed('t1', 'c1');

    const { where } = prisma.campaignTarget.updateMany.mock.calls[0][0];
    expect(where.NOT).toEqual({ error: { startsWith: 'bounce' } });
  });

  it('campanha concluída volta a rodar (senão o worker não pega os alvos)', async () => {
    const prisma = {
      campaign: { findFirst: vi.fn().mockResolvedValue({ id: 'c1', name: 'X', status: 'done' }), update: vi.fn() },
      campaignTarget: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as any;

    const out = await makeSvc(prisma).retryFailed('t1', 'c1');

    expect(out.status).toBe('running');
    expect(prisma.campaign.update.mock.calls[0][0].data.status).toBe('running');
  });

  it('sem nenhuma falha: não mexe no status da campanha', async () => {
    const prisma = {
      campaign: { findFirst: vi.fn().mockResolvedValue({ id: 'c1', name: 'X', status: 'done' }), update: vi.fn() },
      campaignTarget: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    } as any;

    const out = await makeSvc(prisma).retryFailed('t1', 'c1');

    expect(out).toMatchObject({ requeued: 0, status: 'done' });
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  // Ressuscitar `done` é um START: sem a trava aqui, o retry reativava disparo de
  // mercado suspenso por uma porta que o setStatus não vigia.
  it('campanha done de mercado suspenso não volta a rodar', async () => {
    const prisma = {
      campaign: {
        findFirst: vi.fn().mockResolvedValue({ id: 'c1', name: 'X', status: 'done', productCode: 'pneus' }),
        update: vi.fn(),
      },
      campaignTarget: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
      product: { findUnique: vi.fn().mockResolvedValue({ name: 'Pneus', status: 'paused' }) },
    } as any;

    await expect(makeSvc(prisma).retryFailed('t1', 'c1')).rejects.toThrow(/não está liberado/);
    expect(prisma.campaignTarget.updateMany).not.toHaveBeenCalled();
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });
});

// ── Reenvio TOTAL (ferramenta de teste, 2026-08-08) ─────────────────────────
// Abel pediu um botão para reenviar a campanha inteira durante os testes de
// entregabilidade ("depois desativamos"). Dois riscos justificam estes testes:
//   1. a rota vazar para produção — por isso o interruptor é DESLIGADO por padrão;
//   2. o requeue cego alcançar quem nunca pode receber. O worker reavalia opt-out
//      no disparo, mas NÃO reavalia blocklist nem concorrente: sem o filtro, um
//      clique aqui mandaria e-mail comercial para @bsoft.com.br.
describe('SenderService.resendAll — reenvio total atrás de interruptor', () => {
  const makeSvc = (prisma: any) =>
    new SenderService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any,
      { acquire: async () => async () => {} } as any, OPTOUT_MOCK);

  const makePrisma = (status = 'done') => ({
    campaign: { findFirst: vi.fn().mockResolvedValue({ id: 'c1', name: 'X', status }), update: vi.fn() },
    campaignTarget: { updateMany: vi.fn().mockResolvedValue({ count: 5 }) },
  }) as any;

  afterEach(() => { delete process.env.CAMPAIGN_RESEND_ALL_ENABLED; });

  it('recusa quando o ambiente não liberou (padrão)', async () => {
    const prisma = makePrisma();
    await expect(makeSvc(prisma).resendAll('t1', 'c1')).rejects.toThrow(/CAMPAIGN_RESEND_ALL_ENABLED/);
    // e nada é tocado no banco
    expect(prisma.campaignTarget.updateMany).not.toHaveBeenCalled();
  });

  it('NÃO recoloca opt-out, blocklist, concorrente, cliente TMS nem endereço morto', async () => {
    process.env.CAMPAIGN_RESEND_ALL_ENABLED = 'true';
    const prisma = makePrisma();

    await makeSvc(prisma).resendAll('t1', 'c1');

    const { where } = prisma.campaignTarget.updateMany.mock.calls[0][0];
    // O NOT virou lista (21/08/2026): exclusões deliberadas E devolução permanente.
    const [deliberadas, devolucao] = where.NOT;
    expect(deliberadas.status).toBe('skipped');
    expect(deliberadas.error.in).toEqual(
      expect.arrayContaining([
        'bloqueado', 'suspeito_concorrente', 'opted_out', 'tms_cliente',
        // vocabulário do canal de e-mail — sem estes, o reenvio total mandava
        // de novo para endereço com hard bounce e para sintaxe quebrada
        'email_invalido', 'endereco_invalido',
        // quem já respondeu de verdade é o pior alvo pra um reenvio frio
        'ja_respondeu',
      ]),
    );
    // ...mas 'ja_enviado' PODE voltar — é justamente o que travava o teste
    expect(deliberadas.error.in).not.toContain('ja_enviado');
    // alvo `failed` por devolução permanente também fica fora (loop de bounce)
    expect(devolucao).toEqual({ error: { startsWith: 'bounce' } });
  });

  it('recoloca os já enviados (é o ponto do botão) e limpa sentAt', async () => {
    process.env.CAMPAIGN_RESEND_ALL_ENABLED = 'true';
    const prisma = makePrisma();

    const out = await makeSvc(prisma).resendAll('t1', 'c1');

    expect(out).toMatchObject({ requeued: 5, status: 'running' });
    const call = prisma.campaignTarget.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ campaignId: 'c1', tenantId: 't1' });
    // Não filtra por 'sent': quem já recebeu é justamente o alvo do botão.
    // O único status barrado é 'sending' (alvo em voo — ver teste acima).
    expect(call.where.status).toEqual({ not: 'sending' });
    expect(call.data).toMatchObject({ status: 'queued', error: null, sentAt: null });
  });

  // 08/08/2026: o mesmo destinatário recebeu duas mensagens com 5s de diferença.
  // Reenviar enquanto o worker tinha o alvo reservado ('sending') desfazia a reserva
  // atômica, e o tick seguinte mandava de novo.
  it('NÃO recoloca alvo em voo (status sending)', async () => {
    process.env.CAMPAIGN_RESEND_ALL_ENABLED = 'true';
    const prisma = makePrisma();

    await makeSvc(prisma).resendAll('t1', 'c1');

    const { where } = prisma.campaignTarget.updateMany.mock.calls[0][0];
    expect(where.status).toEqual({ not: 'sending' });
  });

  it('campanha pausada continua pausada (pausa é decisão do operador)', async () => {
    process.env.CAMPAIGN_RESEND_ALL_ENABLED = 'true';
    const prisma = makePrisma('paused');

    const out = await makeSvc(prisma).resendAll('t1', 'c1');

    expect(out.status).toBe('paused');
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  it('respeita o tenant (não alcança campanha de outro)', async () => {
    process.env.CAMPAIGN_RESEND_ALL_ENABLED = 'true';
    const prisma = makePrisma();
    prisma.campaign.findFirst = vi.fn().mockResolvedValue(null);

    await expect(makeSvc(prisma).resendAll('t1', 'c1')).rejects.toThrow(/não encontrada/);
    expect(prisma.campaignTarget.updateMany).not.toHaveBeenCalled();
  });
});

// ── DISP-019: reagendamento ─────────────────────────────────────────────────
describe('SenderService.updateCampaign — reagendar', () => {
  const makeSvc = (prisma: any) =>
    new SenderService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any,
      { acquire: async () => async () => {} } as any, OPTOUT_MOCK);

  const prismaWith = (sent: number, status = 'running') => ({
    campaign: {
      findFirst: vi.fn().mockResolvedValue({ id: 'c1', status, _count: { targets: sent } }),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any);

  it('sem envios: grava o novo horário', async () => {
    const prisma = prismaWith(0);
    await makeSvc(prisma).updateCampaign('t1', 'c1', { scheduledAt: '2026-08-10T13:00:00.000Z' });
    expect(prisma.campaign.update.mock.calls[0][0].data.scheduledAt).toBeInstanceOf(Date);
  });

  it('null remove o agendamento (dispara ao iniciar)', async () => {
    const prisma = prismaWith(0);
    await makeSvc(prisma).updateCampaign('t1', 'c1', { scheduledAt: null });
    expect(prisma.campaign.update.mock.calls[0][0].data.scheduledAt).toBeNull();
  });

  it('já tem envios: recusa reagendar', async () => {
    const prisma = prismaWith(3);
    await expect(
      makeSvc(prisma).updateCampaign('t1', 'c1', { scheduledAt: '2026-08-10T13:00:00.000Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });
});

// ── Dedup ENTRE campanhas (2026-07-29, pré go-live de leads) ─────────────────
// O dedup interno só olha a própria lista; sem o bloco novo, o mesmo telefone
// em dois CSVs recebia a prospecção 2x. Quem já tem 'sent' em qualquer campanha
// do tenant entra como skipped/ja_enviado (visível no relatório).
// ── DISP-016: campanha vazia não pode ser criada ────────────────────────────
// Nasceu de um teste real: o CSV foi subido no campo de ANEXO (não é lista de
// envio) e a base de contatos estava vazia → campanha criada com 0 alvos, o
// worker marcou 'done' no primeiro tick e pareceu que o disparo falhou.
// ── Lista de bloqueio LGPD (incidente real 2026-08-03) ──────────────────────
// A Patrícia pediu para sair, o sistema marcou opt-out corretamente. Depois a
// base foi limpa e o CSV antigo reimportado — ela voltou como 'active' e
// recebeu campanha de novo, 3h após escrever "vou processar esta empresa por
// perturbação". O pedido dela morava DENTRO do contato apagado.
// Agora o bloqueio vive em `opt_out_records`, que sobrevive à exclusão.
describe('SenderService.createCampaign — lista de bloqueio sobrevive a limpeza de contatos', () => {
  const BLOQUEADO = '5512996262968';

  const prismaLimpo = () => ({
    // contato NAO existe mais (foi apagado) e nao esta opted_out em lugar nenhum
    campaignTarget: { findMany: vi.fn().mockResolvedValue([]) },
    contact: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    campaign: {
      create: vi.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'c1', ...data, _count: { targets: data.targets?.create?.length ?? 0 } })),
    },
  } as any);

  const svcCom = (prisma: any, bloqueados: string[]) =>
    new SenderService(prisma, {} as any, {} as any, {} as any, {} as any,
      { batchLookup: vi.fn().mockResolvedValue(new Map()), batchLookupVerificado: vi.fn().mockResolvedValue({ clientes: new Map(), falhou: false }) } as any,
      { acquire: async () => async () => {} } as any,
      {
        blockedPhones: async () => new Set(bloqueados),
        blockedEmails: async () => new Set<string>(),
        isBlocked: async (_t: string, a: any) => bloqueados.includes((a.phone ?? '').replace(/\D/g, '')),
        register: async () => undefined,
      } as any);

  it('quem esta na lista NAO entra na fila, mesmo com o contato apagado', async () => {
    const prisma = prismaLimpo();
    const out = await svcCom(prisma, [BLOQUEADO]).createCampaign('t1', {
      name: 'Reenvio', template: 'Oi',
      phones: [{ phone: BLOQUEADO, name: 'Patricia' }, { phone: '5511988887777', name: 'Outro' }],
    });

    expect(out.included).toBe(1);            // só o "Outro"
    expect(out.skippedOptOut).toBe(1);       // a Patricia contabilizada

    const criados = prisma.campaign.create.mock.calls[0][0].data.targets.create;
    const dela = criados.find((t: any) => t.phone === BLOQUEADO);
    expect(dela.status).toBe('skipped');
    expect(dela.error).toBe('opted_out');    // motivo visível no relatório
  });

  it('sem ninguem na lista, todos entram normalmente', async () => {
    const prisma = prismaLimpo();
    const out = await svcCom(prisma, []).createCampaign('t1', {
      name: 'Normal', template: 'Oi',
      phones: [{ phone: BLOQUEADO }, { phone: '5511988887777' }],
    });
    expect(out.included).toBe(2);
    expect(out.skippedOptOut).toBe(0);
  });
});

describe('SenderService.createCampaign — campanha sem destinatários', () => {
  const makeSvc = (prisma: any) =>
    new SenderService(prisma, {} as any, {} as any, {} as any, {} as any,
      { batchLookup: vi.fn().mockResolvedValue(new Map()), batchLookupVerificado: vi.fn().mockResolvedValue({ clientes: new Map(), falhou: false }) } as any,
      { acquire: async () => async () => {} } as any, OPTOUT_MOCK);

  const prismaVazio = () => ({
    campaignTarget: { findMany: vi.fn().mockResolvedValue([]) },
    campaign: { create: vi.fn() },
    contact: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]), // base de contatos vazia
      upsert: vi.fn().mockResolvedValue({}),
    },
  });

  it('lista manual vazia -> BadRequest e NÃO cria a campanha', async () => {
    const prisma = prismaVazio();
    await expect(
      makeSvc(prisma).createCampaign('t1', { name: 'Vazia', template: 'Oi', phones: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  it('"todos os contatos" com a base vazia -> BadRequest', async () => {
    const prisma = prismaVazio();
    await expect(
      makeSvc(prisma).createCampaign('t1', { name: 'Vazia', template: 'Oi', fromContacts: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  it('todos os números pulados (ex.: telefone inválido) AINDA cria — o relatório é o valor', async () => {
    const prisma = prismaVazio();
    prisma.campaign.create = vi.fn().mockResolvedValue({ id: 'c1', _count: { targets: 1 } });
    const out = await makeSvc(prisma).createCampaign('t1', {
      name: 'So invalidos', template: 'Oi',
      phones: [{ phone: '639616524149' }], // estrangeiro → skipped, não vazio
    });
    expect(out).toMatchObject({ id: 'c1' });
    expect(prisma.campaign.create).toHaveBeenCalled();
  });
});

describe('SenderService.createCampaign — dedup entre campanhas', () => {
  let prisma: any, contacts: any, tmsLookup: any;
  const makeService = () =>
    new SenderService(prisma, contacts, {} as any, {} as any, {} as any, tmsLookup, { acquire: async () => async () => {} } as any, OPTOUT_MOCK);

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
    tmsLookup = { batchLookup: vi.fn().mockResolvedValue(new Map()), batchLookupVerificado: vi.fn().mockResolvedValue({ clientes: new Map(), falhou: false }) };
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

/**
 * Quem já respondeu não recebe o próximo toque (21/08/2026).
 *
 * Auditoria confirmou: nenhum filtro de criação nem de tick perguntava se um
 * humano já respondeu — nem por WhatsApp, nem por e-mail. Ver engagement-gate.ts
 * para o porquê do sinal ser "mensagem de entrada", e não estágio da
 * oportunidade nem `repliedAt`.
 */
describe('SenderService.createCampaign — quem já respondeu não entra na fila', () => {
  let prisma: any, tmsLookup: any;
  const makeService = () =>
    new SenderService(prisma, {} as any, {} as any, {} as any, {} as any, tmsLookup, { acquire: async () => async () => {} } as any, OPTOUT_MOCK);

  beforeEach(() => {
    prisma = {
      campaignTarget: { findMany: vi.fn().mockResolvedValue([]) },
      campaign: {
        create: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'camp-new', ...data, _count: { targets: data.targets?.create?.length ?? 0 } })),
      },
      contact: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn().mockResolvedValue({}) },
      aiMessage: { findMany: vi.fn().mockResolvedValue([]) },
    };
    tmsLookup = { batchLookupVerificado: vi.fn().mockResolvedValue({ clientes: new Map(), falhou: false }) };
  });

  const dto = (phones: string[]) => ({ name: 'Toque 2', template: 'Oi de novo', phones: phones.map((phone) => ({ phone })) });

  it('telefone com mensagem de entrada registrada → skipped/ja_respondeu, fora da fila', async () => {
    prisma.aiMessage.findMany.mockResolvedValue([{ conversation: { phone: '5511900000001' } }]);

    const r = await makeService().createCampaign('t1', dto(['5511900000001', '5511900000002']));

    expect((r as any).skippedRespondidos).toBe(1);
    expect(r.included).toBe(1);
    const created = prisma.campaign.create.mock.calls[0][0].data.targets.create;
    expect(created.find((t: any) => t.phone === '5511900000001')).toMatchObject({ status: 'skipped', error: 'ja_respondeu' });
    expect(created.find((t: any) => t.phone === '5511900000002').status).toBeUndefined();
  });

  it('a consulta filtra direction=inbound — mensagem NOSSA (outbound) não conta como resposta', async () => {
    await makeService().createCampaign('t1', dto(['5511900000001']));

    expect(prisma.aiMessage.findMany.mock.calls[0][0].where.direction).toBe('inbound');
  });

  it('ninguém respondeu ainda → todos na fila (o caso comum: Toque 1)', async () => {
    const r = await makeService().createCampaign('t1', dto(['5511900000001', '5511900000002']));

    expect((r as any).skippedRespondidos).toBe(0);
    expect(r.included).toBe(2);
  });
});

// ─── Filtro de cliente TMS: fail-CLOSED (16/08/2026) ────────────────────────
//
// O `batchLookup` devolvia Map vazio em três situações que não são a mesma coisa:
// ninguém do lote é cliente, TMS não configurado, e TMS fora do ar. O disparo usava esse
// Map para NÃO mandar oferta fria a cliente pagante — então uma oscilação de rede fazia a
// peneira sumir em silêncio e a campanha ia inteira para a base, clientes inclusos.
//
// Estes testes prendem a diferença entre os dois vazios. Um teste que só checasse
// "campanha criada" passaria com o bug de volta.
describe('SenderService.createCampaign — filtro TMS indisponível', () => {
  const prismaLimpo = () => ({
    contact: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    campaignTarget: { findMany: vi.fn().mockResolvedValue([]) },
    campaign: {
      create: vi.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'c1', ...data, _count: { targets: data.targets?.create?.length ?? 0 } })),
    },
  } as any);

  const svcComTms = (prisma: any, tms: any) =>
    new SenderService(prisma, {} as any, {} as any, {} as any, {} as any, tms as any,
      { acquire: async () => async () => {} } as any,
      {
        blockedPhones: async () => new Set<string>(),
        blockedEmails: async () => new Set<string>(),
        isBlocked: async () => false,
        register: async () => undefined,
      } as any);

  const alvo = [{ phone: '5511988887777', name: 'Lead' }];

  it('RECUSA a campanha quando a consulta ao TMS falha', async () => {
    const prisma = prismaLimpo();
    const svc = svcComTms(prisma, {
      batchLookupVerificado: vi.fn().mockResolvedValue({
        clientes: new Map(), falhou: true, motivo: 'conexão recusada',
      }),
    });

    await expect(svc.createCampaign('t1', { name: 'Fria', template: 'Oi', phones: alvo }))
      .rejects.toThrow(/HiperTMS/i);
    // O ponto: nada é criado. Recusar depois de gravar deixaria a campanha pronta para
    // alguém apertar "Iniciar" sem peneira nenhuma.
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  it('CRIA normalmente quando a consulta funciona e ninguém é cliente', async () => {
    const prisma = prismaLimpo();
    const svc = svcComTms(prisma, {
      batchLookupVerificado: vi.fn().mockResolvedValue({ clientes: new Map(), falhou: false }),
    });

    await svc.createCampaign('t1', { name: 'Fria', template: 'Oi', phones: alvo });
    expect(prisma.campaign.create).toHaveBeenCalled();
  });

  // TMS não configurado é ambiente sem conector (CI, máquina nova), não falha —
  // barrar ali travaria quem nunca teve TMS.
  it('CRIA quando o TMS não está configurado', async () => {
    const prisma = prismaLimpo();
    const svc = svcComTms(prisma, {
      batchLookupVerificado: vi.fn().mockResolvedValue({
        clientes: new Map(), falhou: false, motivo: 'tms_nao_configurado',
      }),
    });

    await svc.createCampaign('t1', { name: 'Fria', template: 'Oi', phones: alvo });
    expect(prisma.campaign.create).toHaveBeenCalled();
  });
});
