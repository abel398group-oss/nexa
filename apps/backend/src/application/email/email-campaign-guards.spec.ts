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
    senderSettings: { findUnique: vi.fn().mockResolvedValue(null), ...over.senderSettings },
  } as any;
}

function makeSvc(prisma: any = makePrisma()) {
  const svc = new EmailCampaignSenderService(prisma, {} as any, {} as any, {} as any);
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
