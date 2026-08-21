import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EmailCampaignSenderService,
  horaBrasilia,
  diaDaSemanaBrasilia,
  inicioDoDiaBrasilia,
} from './email-campaign-sender.service';

/**
 * As travas que faltavam antes do primeiro disparo de prospecção (09/08/2026).
 *
 * Cada bloco aqui corresponde a um jeito conhecido de queimar a reputação do
 * domínio — e todos eram silenciosos: o painel mostrava "enviado", o Gmail
 * descartava, e a única forma de descobrir seria a entrega parar.
 */

function makePrisma(over: any = {}) {
  return {
    contact: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      ...over.contact,
    },
    campaignTarget: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      ...over.campaignTarget,
    },
    campaign: {
      create: vi.fn().mockImplementation(({ data }: any) => ({ id: 'camp-1', ...data })),
      ...over.campaign,
    },
    product: { findUnique: vi.fn().mockResolvedValue(null), ...over.product },
    senderSettings: { findUnique: vi.fn().mockResolvedValue(null), ...over.senderSettings },
  } as any;
}

/** Registro LGPD vazio e TMS sem clientes — o caso neutro dos testes que não são deles. */
const registroVazio = () =>
  ({ blockedEmails: async () => new Set<string>(), isBlocked: async () => false }) as any;
const tmsSemClientes = () =>
  ({ clientesPorEmailVerificado: async () => ({ clientes: new Set<string>(), falhou: false }) }) as any;

function makeSvc(prisma: any = makePrisma()) {
  const svc = new EmailCampaignSenderService(
    prisma, {} as any, {} as any, {} as any, registroVazio(), tmsSemClientes(),
  );
  return { svc, prisma };
}

/** Alvos que a campanha criada de fato enfileirou (status implícito `queued`). */
function alvosEnfileirados(prisma: any): any[] {
  return (prisma.campaign.create.mock.calls[0][0].data.targets.create as any[]).filter((t) => !t.status);
}

/** Alvos pulados, com o motivo. */
function alvosPulados(prisma: any): any[] {
  return (prisma.campaign.create.mock.calls[0][0].data.targets.create as any[]).filter((t) => t.status === 'skipped');
}

const base = {
  name: 'Prospecção agosto',
  subject: 'Sobre a sua operação de frete',
  template:
    'Bom dia, {{nome}}. Vi que a sua transportadora trabalha com carga fracionada e queria ' +
    'entender como vocês fazem a cotação de frete hoje. Faz sentido conversarmos dez minutos ' +
    'esta semana para eu te mostrar como outras transportadoras resolveram isso?',
};

describe('createEmailCampaign — trava de mercado (ADR 037)', () => {
  // O seletor do vendedor esconde mercado em rascunho, mas quem chama a API
  // direto passava por cima da liberação inteira — conhecimento não aprovado,
  // identidade vazia, e o disparo saindo assim mesmo. A trava só é trava se
  // valer no endpoint.
  it('mercado em rascunho não cria campanha', async () => {
    const prisma = makePrisma({
      product: { findUnique: vi.fn().mockResolvedValue({ code: 'pneus', name: 'Pneus', status: 'draft' }) },
    });
    const { svc } = makeSvc(prisma);

    await expect(
      svc.createEmailCampaign('t1', { ...base, productCode: 'pneus', emails: [{ email: 'a@b.com' }] }),
    ).rejects.toThrow(/não está liberado/);
  });

  it('mercado suspenso também não', async () => {
    const prisma = makePrisma({
      product: { findUnique: vi.fn().mockResolvedValue({ code: 'pneus', name: 'Pneus', status: 'paused' }) },
    });
    const { svc } = makeSvc(prisma);

    await expect(
      svc.createEmailCampaign('t1', { ...base, productCode: 'pneus', emails: [{ email: 'a@b.com' }] }),
    ).rejects.toThrow(/não está liberado/);
  });

  // Um typo no código desligaria em silêncio o conhecimento e a marca do mercado —
  // a campanha sairia "sem mercado" e ninguém perceberia até a Lia responder errado.
  it('código de mercado que não existe é erro, não campanha sem mercado', async () => {
    const { svc } = makeSvc();

    await expect(
      svc.createEmailCampaign('t1', { ...base, productCode: 'pneuss', emails: [{ email: 'a@b.com' }] }),
    ).rejects.toThrow(/não existe/);
  });

  it('mercado liberado cria normalmente', async () => {
    const prisma = makePrisma({
      product: { findUnique: vi.fn().mockResolvedValue({ code: 'pneus', name: 'Pneus', status: 'active' }) },
    });
    const { svc } = makeSvc(prisma);

    const r: any = await svc.createEmailCampaign('t1', {
      ...base, productCode: 'pneus', emails: [{ email: 'a@b.com' }],
    });
    expect(r.included).toBe(1);
  });

  it('campanha sem mercado nem consulta a tabela (comportamento de sempre)', async () => {
    const { svc, prisma } = makeSvc();

    await svc.createEmailCampaign('t1', { ...base, emails: [{ email: 'a@b.com' }] });

    expect(prisma.product.findUnique).not.toHaveBeenCalled();
  });
});

describe('createEmailCampaign — normalização de endereço', () => {
  // O defeito: a lista vinha da planilha com "Joao@X.com", o opt-out no banco
  // estava em "joao@x.com", e o `IN` do Postgres (sensível a maiúsculas) não
  // encontrava. Quem pediu para sair recebia de novo.
  it('grava o alvo sempre em minúsculas', async () => {
    const { svc, prisma } = makeSvc();

    await svc.createEmailCampaign('t1', { ...base, emails: [{ email: '  Joao@Empresa.COM ' }] });

    expect(alvosEnfileirados(prisma)[0]).toMatchObject({
      email: 'joao@empresa.com',
      phone: 'email:joao@empresa.com',
    });
  });

  it('consulta as exclusões com o endereço já normalizado', async () => {
    const { svc, prisma } = makeSvc();

    await svc.createEmailCampaign('t1', { ...base, emails: [{ email: 'ABEL@X.com' }] });

    expect(prisma.contact.findMany.mock.calls[0][0].where.email).toEqual({ in: ['abel@x.com'] });
  });

  it('duas grafias do mesmo endereço viram um alvo só', async () => {
    const { svc, prisma } = makeSvc();

    await svc.createEmailCampaign('t1', {
      ...base,
      emails: [{ email: 'joao@x.com' }, { email: 'JOAO@X.com' }, { email: ' Joao@X.com ' }],
    });

    expect(alvosEnfileirados(prisma)).toHaveLength(1);
  });

  it('opt-out gravado em minúsculas barra a planilha em maiúsculas', async () => {
    const prisma = makePrisma({
      contact: { findMany: vi.fn().mockResolvedValue([{ email: 'joao@x.com', status: 'opted_out', emailBouncedAt: null }]) },
    });
    const { svc } = makeSvc(prisma);

    const r: any = await svc.createEmailCampaign('t1', { ...base, emails: [{ email: 'Joao@X.COM' }] });

    expect(r.skippedOptOut).toBe(1);
    expect(alvosEnfileirados(prisma)).toHaveLength(0);
  });

  it('dedup entre campanhas também para de escapar por causa da caixa', async () => {
    const prisma = makePrisma({
      campaignTarget: { findMany: vi.fn().mockResolvedValue([{ email: 'joao@x.com' }]) },
    });
    const { svc } = makeSvc(prisma);

    const r: any = await svc.createEmailCampaign('t1', { ...base, emails: [{ email: 'JOAO@X.com' }] });

    expect(r.skippedAlreadySent).toBe(1);
  });
});

describe('createEmailCampaign — lista de bloqueio LGPD (registro permanente)', () => {
  // Caso Patrícia por e-mail: contato apagado + CSV reimportado = o `status` do
  // contato não existe mais, e só o registro FORA do contato lembra do pedido.
  it('endereço no registro permanente é pulado como opted_out mesmo sem contato', async () => {
    const { svc: _, prisma } = makeSvc();
    const registro = {
      blockedEmails: async () => new Set(['patricia@x.com']),
      isBlocked: async () => false,
    } as any;
    const svc = new EmailCampaignSenderService(
      prisma, {} as any, {} as any, {} as any, registro, tmsSemClientes(),
    );

    const r: any = await svc.createEmailCampaign('t1', {
      ...base,
      emails: [{ email: 'Patricia@X.com' }, { email: 'livre@y.com' }],
    });

    expect(r.skippedOptOut).toBe(1);
    expect(alvosEnfileirados(prisma).map((t) => t.email)).toEqual(['livre@y.com']);
    expect(alvosPulados(prisma)).toContainEqual(
      expect.objectContaining({ email: 'patricia@x.com', error: 'opted_out' }),
    );
  });
});

describe('createEmailCampaign — filtro de cliente TMS (fail-closed)', () => {
  it('cliente TMS por e-mail é pulado como tms_cliente', async () => {
    const { svc: _, prisma } = makeSvc();
    const tms = {
      clientesPorEmailVerificado: async () => ({ clientes: new Set(['cliente@x.com']), falhou: false }),
    } as any;
    const svc = new EmailCampaignSenderService(
      prisma, {} as any, {} as any, {} as any, registroVazio(), tms,
    );

    const r: any = await svc.createEmailCampaign('t1', {
      ...base,
      emails: [{ email: 'Cliente@X.com' }, { email: 'lead@y.com' }],
    });

    expect(r.skippedTms).toBe(1);
    expect(alvosEnfileirados(prisma).map((t) => t.email)).toEqual(['lead@y.com']);
    expect(alvosPulados(prisma)).toContainEqual(
      expect.objectContaining({ email: 'cliente@x.com', error: 'tms_cliente' }),
    );
  });

  // Mesma decisão do WhatsApp: Set vazio por falha ≠ "ninguém é cliente". Sem o
  // fail-closed, o TMS fora do ar mandava oferta fria para quem já paga.
  it('TMS indisponível RECUSA a criação em vez de disparar sem peneira', async () => {
    const { svc: _, prisma } = makeSvc();
    const tms = {
      clientesPorEmailVerificado: async () => ({ clientes: new Set<string>(), falhou: true, motivo: 'timeout' }),
    } as any;
    const svc = new EmailCampaignSenderService(
      prisma, {} as any, {} as any, {} as any, registroVazio(), tms,
    );

    await expect(
      svc.createEmailCampaign('t1', { ...base, emails: [{ email: 'a@b.com' }] }),
    ).rejects.toThrow(/HiperTMS/);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  it('TMS não configurado não é falha — a campanha sai sem a peneira', async () => {
    const { svc: _, prisma } = makeSvc();
    const tms = {
      clientesPorEmailVerificado: async () =>
        ({ clientes: new Set<string>(), falhou: false, motivo: 'tms_nao_configurado' }),
    } as any;
    const svc = new EmailCampaignSenderService(
      prisma, {} as any, {} as any, {} as any, registroVazio(), tms,
    );

    const r: any = await svc.createEmailCampaign('t1', { ...base, emails: [{ email: 'a@b.com' }] });
    expect(r.included).toBe(1);
  });
});

describe('createEmailCampaign — endereço morto nunca volta para a fila', () => {
  it('contato com devolução permanente é pulado com motivo próprio', async () => {
    const prisma = makePrisma({
      contact: {
        findMany: vi.fn().mockResolvedValue([
          { email: 'morto@x.com', status: 'active', emailBouncedAt: new Date('2026-08-01') },
        ]),
      },
    });
    const { svc } = makeSvc(prisma);

    const r: any = await svc.createEmailCampaign('t1', {
      ...base,
      emails: [{ email: 'morto@x.com' }, { email: 'vivo@x.com' }],
    });

    expect(r.skippedBounced).toBe(1);
    expect(r.included).toBe(1);
    expect(alvosPulados(prisma).find((t) => t.email === 'morto@x.com')?.error).toBe('email_invalido');
  });

  it('o público "contatos com e-mail" já exclui quem devolveu', () => {
    expect(EmailCampaignSenderService.audienciaWhere('t1')).toMatchObject({ emailBouncedAt: null });
  });
});

describe('createEmailCampaign — endereço inválido', () => {
  it('lixo da planilha não entra na fila (viraria hard bounce)', async () => {
    const { svc, prisma } = makeSvc();

    const r: any = await svc.createEmailCampaign('t1', {
      ...base,
      emails: [{ email: 'sem-arroba' }, { email: '' }, { email: 'ok@x.com' }],
    });

    expect(r.skippedInvalid).toBe(2);
    expect(r.included).toBe(1);
    expect(alvosPulados(prisma).some((t) => t.error === 'endereco_invalido')).toBe(true);
  });
});

describe('createEmailCampaign — peneira de conteúdo', () => {
  // Único bloqueio: o Gmail descarta o e-mail, não é questão de score.
  it('recusa a criação quando há link encurtado', async () => {
    const { svc } = makeSvc();

    await expect(
      svc.createEmailCampaign('t1', { ...base, template: 'veja https://bit.ly/abc', emails: [{ email: 'a@b.com' }] }),
    ).rejects.toThrow(/encurtado/i);
  });

  it('encurtador no campo link também bloqueia', async () => {
    const { svc } = makeSvc();

    await expect(
      svc.createEmailCampaign('t1', { ...base, link: 'https://tinyurl.com/x', emails: [{ email: 'a@b.com' }] }),
    ).rejects.toThrow(/encurtado/i);
  });

  // O resto é aviso, não bloqueio: quem escreveu tem contexto que o código não tem.
  it('devolve os avisos de conteúdo para a tela, sem impedir a criação', async () => {
    const { svc } = makeSvc();

    const r: any = await svc.createEmailCampaign('t1', {
      ...base,
      subject: 'PROMOÇÃO IMPERDÍVEL!!',
      emails: [{ email: 'a@b.com' }],
    });

    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.included).toBe(1);
  });

  it('campanha bem escrita volta sem aviso nenhum', async () => {
    const { svc } = makeSvc();
    const r: any = await svc.createEmailCampaign('t1', { ...base, emails: [{ email: 'a@b.com' }] });
    expect(r.warnings).toEqual([]);
  });
});

describe('janela de envio — hora e dia', () => {
  const emBrasilia = (iso: string) => new Date(iso); // ISO com offset explícito

  it('converte para o fuso de Brasília (UTC-3 fixo, sem horário de verão)', () => {
    expect(horaBrasilia(emBrasilia('2026-08-10T12:00:00-03:00'))).toBe(12);
    expect(horaBrasilia(emBrasilia('2026-08-10T23:30:00-03:00'))).toBe(23);
  });

  it('segunda-feira é 1, sábado é 6, domingo é 0', () => {
    expect(diaDaSemanaBrasilia(emBrasilia('2026-08-10T09:00:00-03:00'))).toBe(1); // segunda
    expect(diaDaSemanaBrasilia(emBrasilia('2026-08-15T09:00:00-03:00'))).toBe(6); // sábado
    expect(diaDaSemanaBrasilia(emBrasilia('2026-08-16T09:00:00-03:00'))).toBe(0); // domingo
  });

  // 21h UTC-3 de um dia é 00h UTC do seguinte: cortar o contador pelo dia UTC
  // zeraria no meio de uma janela que pode estar aberta.
  it('o início do dia é a meia-noite de Brasília, não a de UTC', () => {
    const inicio = inicioDoDiaBrasilia(emBrasilia('2026-08-10T22:00:00-03:00'));
    expect(inicio.toISOString()).toBe('2026-08-10T03:00:00.000Z'); // 00h de 10/08 em Brasília
  });
});

describe('worker — janela de envio', () => {
  let prisma: any;
  let svc: EmailCampaignSenderService;

  beforeEach(() => {
    vi.useFakeTimers();
    prisma = makePrisma();
    svc = makeSvc(prisma).svc;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.SENDER_EMAIL_WEEKEND;
  });

  const dentro = (svcAny: any) => svcAny.withinEmailWindow('t1');

  it('dia útil às 10h: aberta', async () => {
    vi.setSystemTime(new Date('2026-08-10T10:00:00-03:00')); // segunda
    expect(await dentro(svc as any)).toBe(true);
  });

  it('dia útil às 22h: fechada', async () => {
    vi.setSystemTime(new Date('2026-08-10T22:00:00-03:00'));
    expect(await dentro(svc as any)).toBe(false);
  });

  // Prospecção fria no fim de semana tem reclamação de spam mais alta, e reclamação
  // é a métrica mais cara (teto do Google: 0,10%).
  it('sábado no meio do horário comercial: fechada', async () => {
    vi.setSystemTime(new Date('2026-08-15T10:00:00-03:00'));
    expect(await dentro(svc as any)).toBe(false);
  });

  it('domingo: fechada', async () => {
    vi.setSystemTime(new Date('2026-08-16T10:00:00-03:00'));
    expect(await dentro(svc as any)).toBe(false);
  });

  it('SENDER_EMAIL_WEEKEND=true libera o fim de semana', async () => {
    process.env.SENDER_EMAIL_WEEKEND = 'true';
    vi.setSystemTime(new Date('2026-08-15T10:00:00-03:00'));
    expect(await dentro(svc as any)).toBe(true);
  });
});

describe('worker — a marca do mercado chega ao envio (ADR 037)', () => {
  // O furo: a prévia renderizava com a marca do mercado e o tick chamava o send
  // sem productCode — todo disparo real saía HiperTMS. Este teste percorre o tick
  // inteiro até o SMTP para provar que o fio não se solta de novo.
  it('tick repassa campaign.productCode para o emailReply.send', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00-03:00')); // segunda, 10h BRT

    const campanha = {
      id: 'camp-1', tenantId: 't1', name: 'Pneus agosto', channel: 'email',
      status: 'running', productCode: 'pneus', subject: 'Sobre a frota, {{nome}}',
      template: 'corpo da campanha', link: null, sendLinkOnFirst: false,
      sendLimit: null, scheduledAt: null,
    };
    const prisma = makePrisma({
      campaign: {
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(campanha),
        update: vi.fn().mockResolvedValue({}),
      },
      campaignTarget: {
        count: vi.fn().mockResolvedValue(0),
        // 1ª forma (ultimoEnvio, sem campaignId) → null; 2ª (próximo alvo) → o alvo
        findFirst: vi.fn().mockImplementation(({ where }: any) =>
          where.campaignId ? { id: 'alvo-1', email: 'lead@empresa.com', name: 'João' } : null),
        updateMany: vi.fn().mockImplementation(({ where }: any) => ({ count: where.id ? 1 : 0 })),
        update: vi.fn().mockResolvedValue({}),
      },
      contact: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: 'ct-1' }),
      },
    });
    prisma.aiConversation = { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() };

    const emailReply = { send: vi.fn().mockResolvedValue({ sent: true, messageId: '<m@x>' }) };
    const conversations = {
      create: vi.fn().mockResolvedValue({ id: 'conv-1' }),
      addMessage: vi.fn().mockResolvedValue({}),
    };
    const svc = new EmailCampaignSenderService(prisma, emailReply as any, {} as any, conversations as any, registroVazio(), tmsSemClientes());

    await (svc as any).tickLocked();

    expect(emailReply.send).toHaveBeenCalledTimes(1);
    expect(emailReply.send.mock.calls[0][0]).toMatchObject({
      to: 'lead@empresa.com',
      productCode: 'pneus',
    });
    // e a conversa criada herda o mercado — é o que faz a Lia responder como
    // o mercado quando o lead volta
    expect(conversations.create.mock.calls[0][1]).toMatchObject({ productCode: 'pneus' });

    vi.useRealTimers();
  });
});

describe('worker — recheck LGPD na hora do envio (defesa em profundidade)', () => {
  // A fila esvazia a 20-75/dia: quem pede para sair DEPOIS da criação ainda tem
  // que ser barrado no tick — igual ao WhatsApp, e ANTES de tocar no contato.
  it('alvo na lista de bloqueio é pulado sem chamar o SMTP', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00-03:00')); // segunda, 10h BRT

    const campanha = {
      id: 'camp-1', tenantId: 't1', name: 'Agosto', channel: 'email', status: 'running',
      productCode: null, subject: 's', template: 'corpo', link: null,
      sendLinkOnFirst: false, sendLimit: null, scheduledAt: null,
    };
    const prisma = makePrisma({
      campaign: {
        create: vi.fn(), updateMany: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(campanha), update: vi.fn().mockResolvedValue({}),
      },
      campaignTarget: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockImplementation(({ where }: any) =>
          where.campaignId ? { id: 'alvo-1', email: 'saiu@x.com', name: 'Ana' } : null),
        updateMany: vi.fn().mockImplementation(({ where }: any) => ({ count: where.id ? 1 : 0 })),
        update: vi.fn().mockResolvedValue({}),
      },
    });

    const emailReply = { send: vi.fn() };
    const registro = { blockedEmails: async () => new Set<string>(), isBlocked: async () => true } as any;
    const svc = new EmailCampaignSenderService(
      prisma, emailReply as any, {} as any, {} as any, registro, tmsSemClientes(),
    );

    await (svc as any).tickLocked();

    expect(emailReply.send).not.toHaveBeenCalled();
    expect(prisma.campaignTarget.update).toHaveBeenCalledWith({
      where: { id: 'alvo-1' },
      data: { status: 'skipped', error: 'opted_out' },
    });

    vi.useRealTimers();
  });
});

/**
 * A troca automática de layout no segundo toque.
 *
 * Faixa colorida, botão e rodapé são os marcadores que o Gmail usa para separar
 * e-mail em massa de e-mail pessoal — em prospecção fria, a aba Promoções. Depois
 * que a pessoa respondeu, ela já sabe quem somos e a marca ajuda em vez de
 * levantar suspeita. Ninguém precisa lembrar de trocar: o `repliedAt` decide.
 */
describe('worker — layout muda no segundo toque', () => {
  function cenario(jaRespondeu: boolean, link: string | null = 'https://hipertms.com.br/planos') {
    const campanha = {
      id: 'camp-1', tenantId: 't1', name: 'Agosto', channel: 'email', status: 'running',
      productCode: null, subject: 'Sobre a sua operação', template: 'corpo da campanha',
      link, sendLinkOnFirst: false, sendLimit: null, scheduledAt: null,
    };
    const prisma = makePrisma({
      campaign: {
        create: vi.fn(), updateMany: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(campanha), update: vi.fn().mockResolvedValue({}),
      },
      campaignTarget: {
        // `repliedAt` no where = é a pergunta "já respondeu alguma vez".
        // Promise, não número: o serviço encadeia `.catch()` nesta consulta, e um
        // mock síncrono passaria por `await` mas quebraria ali.
        count: vi.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where.repliedAt ? (jaRespondeu ? 1 : 0) : 0)),
        findFirst: vi.fn().mockImplementation(({ where }: any) =>
          where.campaignId ? { id: 'alvo-1', email: 'lead@empresa.com', name: 'Carlos' } : null),
        updateMany: vi.fn().mockImplementation(({ where }: any) => ({ count: where.id ? 1 : 0 })),
        update: vi.fn().mockResolvedValue({}),
      },
      contact: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: 'ct-1' }),
      },
    });
    prisma.aiConversation = { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() };

    const emailReply = { send: vi.fn().mockResolvedValue({ sent: true, messageId: '<m@x>' }) };
    const conversations = {
      create: vi.fn().mockResolvedValue({ id: 'conv-1' }),
      addMessage: vi.fn().mockResolvedValue({}),
    };
    const svc = new EmailCampaignSenderService(prisma, emailReply as any, {} as any, conversations as any, registroVazio(), tmsSemClientes());
    return { svc, emailReply };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00-03:00')); // segunda, 10h BRT
  });
  afterEach(() => vi.useRealTimers());

  it('quem nunca respondeu recebe o layout discreto, sem botão', async () => {
    const { svc, emailReply } = cenario(false);

    await (svc as any).tickLocked();

    const enviado = emailReply.send.mock.calls[0][0];
    expect(enviado.layout).toBe('simples');
    expect(enviado.ctaUrl).toBeUndefined();
  });

  // sendLinkOnFirst=false é o padrão: e-mail frio sem link tem score de spam menor
  // e mais resposta. O link existe na campanha e mesmo assim não sai.
  it('e o link nem entra no corpo no primeiro toque', async () => {
    const { svc, emailReply } = cenario(false);

    await (svc as any).tickLocked();

    expect(emailReply.send.mock.calls[0][0].body).not.toContain('hipertms.com.br');
  });

  it('quem já respondeu recebe o layout de marca, com o link no botão', async () => {
    const { svc, emailReply } = cenario(true);

    await (svc as any).tickLocked();

    const enviado = emailReply.send.mock.calls[0][0];
    expect(enviado.layout).toBe('marca');
    expect(enviado.ctaUrl).toContain('hipertms.com.br/planos');
    // no botão, não repetido no texto
    expect(enviado.body).not.toContain('🔗');
  });

  it('campanha sem link não inventa botão para quem já respondeu', async () => {
    const { svc, emailReply } = cenario(true, null);

    await (svc as any).tickLocked();

    const enviado = emailReply.send.mock.calls[0][0];
    expect(enviado.layout).toBe('marca');
    expect(enviado.ctaUrl).toBeUndefined();
  });
});

describe('worker — limite diário vem do banco', () => {
  // O contador vivia no processo e morria a cada deploy: o preaquecimento de
  // 20/dia virava 40 ou 60 conforme o número de restarts do dia.
  it('conta os enviados de hoje a partir do sentAt, não de campo em memória', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T14:00:00-03:00'));

    const prisma = makePrisma({ campaignTarget: { count: vi.fn().mockResolvedValue(7) } });
    const { svc } = makeSvc(prisma);

    await expect((svc as any).enviadosHoje()).resolves.toBe(7);
    const where = prisma.campaignTarget.count.mock.calls[0][0].where;
    expect(where.status).toBe('sent');
    expect(where.campaign).toEqual({ channel: 'email' });
    expect(where.sentAt.gte.toISOString()).toBe('2026-08-10T03:00:00.000Z');

    vi.useRealTimers();
  });

  it('o intervalo entre envios também sai do banco (sobrevive a restart)', async () => {
    const quando = new Date('2026-08-10T14:00:00-03:00');
    const prisma = makePrisma({
      campaignTarget: { findFirst: vi.fn().mockResolvedValue({ sentAt: quando }) },
    });
    const { svc } = makeSvc(prisma);

    await expect((svc as any).ultimoEnvio()).resolves.toBe(quando.getTime());
  });

  it('sem envio nenhum, o último envio é 0 (não bloqueia o primeiro disparo)', async () => {
    const { svc } = makeSvc();
    await expect((svc as any).ultimoEnvio()).resolves.toBe(0);
  });
});

/**
 * O lead que já existe por telefone, e o e-mail que não conseguia alcançá-lo.
 *
 * `contacts` tem DOIS uniques — (tenant, phone) e (tenant, email) — e o `upsert`
 * só sabe procurar por um. O worker procurava pelo pseudo-telefone derivado do
 * e-mail (`emailToPhone`), então NÃO encontrava o lead que entrou por uma lista de
 * leads com telefone de verdade: caía no `create` e o insert batia no unique do
 * e-mail.
 *
 * O estrago não ficava no alvo: o `tickLocked` inteiro morria, a cada 15 segundos,
 * sem enviar nada e sem marcar falha em ninguém. Em produção, 20/08/2026, os quatro
 * alvos ficaram parados em `sending` enquanto o log repetia
 * `Unique constraint failed on the fields: (tenant_id, email)` — e o caminho que
 * quebrava é o mais comum que existe: importar a lista e disparar e-mail para ela.
 */
describe('worker — lead vindo de lista de leads, com telefone real', () => {
  function cenario(contatoExistente: any) {
    const campanha = {
      id: 'camp-1', tenantId: 't1', name: 'Teste 01', channel: 'email',
      status: 'running', productCode: null, subject: 'assunto',
      template: 'corpo', link: null, sendLinkOnFirst: false,
      sendLimit: null, scheduledAt: null,
    };
    const prisma = makePrisma({
      campaign: {
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(campanha),
        update: vi.fn().mockResolvedValue({}),
      },
      campaignTarget: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockImplementation(({ where }: any) =>
          where.campaignId ? { id: 'alvo-1', email: 'carlos@transportes.com.br', name: 'Carlos' } : null),
        updateMany: vi.fn().mockImplementation(({ where }: any) => ({ count: where.id ? 1 : 0 })),
        update: vi.fn().mockResolvedValue({}),
      },
      contact: {
        findMany: vi.fn().mockResolvedValue([]),
        // Achado por E-MAIL: é o contato do lote, com telefone real.
        findFirst: vi.fn().mockResolvedValue(contatoExistente),
        // Se for chamado com um contato já existente, o insert bateria no unique.
        upsert: vi.fn().mockRejectedValue(
          new Error('Unique constraint failed on the fields: (`tenant_id`,`email`)'),
        ),
      },
    });
    prisma.aiConversation = { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() };

    const emailReply = { send: vi.fn().mockResolvedValue({ sent: true, messageId: '<m@x>' }) };
    const conversations = {
      create: vi.fn().mockResolvedValue({ id: 'conv-1' }),
      addMessage: vi.fn().mockResolvedValue({}),
    };
    const svc = new EmailCampaignSenderService(prisma, emailReply as any, {} as any, conversations as any, registroVazio(), tmsSemClientes());
    return { svc, prisma, emailReply };
  }

  it('reaproveita o contato encontrado pelo e-mail, sem tentar criar outro', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00-03:00'));

    const doLote = { id: 'ct-lote', phone: '5511994327713', email: 'carlos@transportes.com.br' };
    const { svc, prisma, emailReply } = cenario(doLote);

    await (svc as any).tickLocked();

    // O upsert nem é tentado — é ele que estourava.
    expect(prisma.contact.upsert).not.toHaveBeenCalled();
    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', email: 'carlos@transportes.com.br' } }),
    );
    // E o e-mail SAI, que é o ponto: antes o tick inteiro morria aqui.
    expect(emailReply.send).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('sem contato pelo e-mail, segue criando pelo telefone sintético', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00-03:00'));

    const { svc, prisma } = cenario(null);
    prisma.contact.upsert = vi.fn().mockResolvedValue({ id: 'ct-novo' });

    await (svc as any).tickLocked();

    expect(prisma.contact.upsert).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

/**
 * Texto puro é a AUSÊNCIA da parte HTML, não um HTML mais simples.
 *
 * O envio sempre montou as duas versões e mandou as duas no mesmo e-mail
 * (multipart/alternative). O cliente escolhe qual exibir, e o Gmail escolhe o
 * HTML — então "mandar em texto" nunca era o que o lead via. Em prospecção fria
 * isso decide caixa de entrada × Promoções.
 */
describe('worker — formato do e-mail (html × texto puro)', () => {
  function cenario(emailFormat: string | undefined) {
    const campanha = {
      id: 'camp-1', tenantId: 't1', name: 'Frio', channel: 'email',
      status: 'running', productCode: null, subject: 'assunto',
      template: 'corpo', link: null, sendLinkOnFirst: false,
      sendLimit: null, scheduledAt: null,
      ...(emailFormat === undefined ? {} : { emailFormat }),
    };
    const prisma = makePrisma({
      campaign: {
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(campanha),
        update: vi.fn().mockResolvedValue({}),
      },
      campaignTarget: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockImplementation(({ where }: any) =>
          where.campaignId ? { id: 'alvo-1', email: 'lead@x.com', name: 'Ana' } : null),
        updateMany: vi.fn().mockImplementation(({ where }: any) => ({ count: where.id ? 1 : 0 })),
        update: vi.fn().mockResolvedValue({}),
      },
      contact: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({ id: 'ct-1', email: 'lead@x.com' }),
        upsert: vi.fn().mockResolvedValue({ id: 'ct-1' }),
      },
    });
    prisma.aiConversation = { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() };

    const emailReply = { send: vi.fn().mockResolvedValue({ sent: true, messageId: '<m@x>' }) };
    const conversations = {
      create: vi.fn().mockResolvedValue({ id: 'conv-1' }),
      addMessage: vi.fn().mockResolvedValue({}),
    };
    const svc = new EmailCampaignSenderService(prisma, emailReply as any, {} as any, conversations as any, registroVazio(), tmsSemClientes());
    return { svc, emailReply };
  }

  it('emailFormat=text pede envio sem HTML', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00-03:00'));

    const { svc, emailReply } = cenario('text');
    await (svc as any).tickLocked();

    expect(emailReply.send.mock.calls[0][0].somenteTexto).toBe(true);
    vi.useRealTimers();
  });

  it('emailFormat=html mantém o HTML', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00-03:00'));

    const { svc, emailReply } = cenario('html');
    await (svc as any).tickLocked();

    expect(emailReply.send.mock.calls[0][0].somenteTexto).toBe(false);
    vi.useRealTimers();
  });

  // Campanha criada antes da coluna existir não pode mudar de comportamento.
  it('campanha sem o campo continua com HTML', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00-03:00'));

    const { svc, emailReply } = cenario(undefined);
    await (svc as any).tickLocked();

    expect(emailReply.send.mock.calls[0][0].somenteTexto).toBe(false);
    vi.useRealTimers();
  });
});
