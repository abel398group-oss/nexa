import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SellersService } from './sellers.service';

// ─── ADR 034: handoff — "Estou fora" + deep link ─────────────────────────────
// outOfOffice=true (default) → WhatsApp com link "Atender agora" pro inbox.
// outOfOffice=false → só o sino do portal (hot_lead, criado pelo agente);
// nenhum WhatsApp, mas a atribuição acontece normalmente.

function makeService(opts: {
  seller?: Record<string, any> | null;
  existingNotification?: Record<string, any> | null;
} = {}) {
  const seller = opts.seller === undefined
    ? { id: 's1', name: 'João', phone: '5511988073788', tenantId: 't1', active: true }
    : opts.seller;

  const prisma = {
    seller: {
      findFirst: vi.fn().mockResolvedValue(seller),
      findUnique: vi.fn().mockResolvedValue(seller),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    sellerNotification: {
      findUnique: vi.fn().mockResolvedValue(opts.existingNotification ?? null),
      create: vi.fn().mockResolvedValue({}),
    },
    aiConversation: { update: vi.fn().mockResolvedValue({}) },
    // pickAndClaimSeller (round-robin atomico): SELECT+UPDATE via $queryRaw
    $queryRaw: vi.fn().mockResolvedValue(seller ? [seller] : []),
    $transaction: vi.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
  } as any;

  const waha = { sendText: vi.fn().mockResolvedValue({ sent: true }) } as any;
  // aviso por e-mail do handoff (só dispara quando o vendedor tem endereço)
  const emailReply = { sendAlertEmail: vi.fn().mockResolvedValue({ sent: true }) } as any;
  const svc = new SellersService(prisma, waha, emailReply);
  return { svc, prisma, waha, emailReply };
}

const INPUT = { conversationId: 'conv-1', contactPhone: '5512911112222', leadScore: 85 };

describe('SellersService.handoff — ADR 034', () => {
  beforeEach(() => {
    delete process.env.NEXA_APP_URL;
  });

  it('outOfOffice ausente (default) → envia WhatsApp (comportamento pré-ADR preservado)', async () => {
    const { svc, waha } = makeService(); // seller sem o campo
    const r = await svc.handoff('t1', INPUT);
    expect(r.assigned).toBe(true);
    expect(waha.sendText).toHaveBeenCalledOnce();
  });

  it('outOfOffice=false → NÃO envia WhatsApp, mas atribui normalmente', async () => {
    const { svc, waha, prisma } = makeService({
      seller: { id: 's1', name: 'João', phone: '5511988073788', tenantId: 't1', active: true, outOfOffice: false },
    });
    const r = await svc.handoff('t1', INPUT);
    expect(r.assigned).toBe(true);
    expect(r.notified).toBe(false);
    expect(waha.sendText).not.toHaveBeenCalled();
    // atribuição aconteceu (transação com update da conversa + dedup)
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('com NEXA_APP_URL → mensagem leva o deep link /inbox?c=<conversa>', async () => {
    process.env.NEXA_APP_URL = 'https://painel.exemplo.com.br/';
    const { svc, waha } = makeService({
      seller: { id: 's1', name: 'João', phone: '5511988073788', tenantId: 't1', active: true, outOfOffice: true },
    });
    await svc.handoff('t1', INPUT);
    const [, msg] = waha.sendText.mock.calls[0];
    expect(msg).toContain('https://painel.exemplo.com.br/inbox?c=conv-1');
    expect(msg).not.toContain('Responda pelo WhatsApp'); // texto antigo convidava pro erro
  });

  it('sem NEXA_APP_URL → sem link inventado, orienta pro painel', async () => {
    const { svc, waha } = makeService();
    await svc.handoff('t1', INPUT);
    const [, msg] = waha.sendText.mock.calls[0];
    expect(msg).toContain('Atenda pelo painel Nexa');
    expect(msg).not.toContain('http');
  });

  it('re-engagement (lead voltou): respeita o "Estou fora" do mesmo jeito', async () => {
    const { svc, waha } = makeService({
      seller: { id: 's1', name: 'João', phone: '5511988073788', tenantId: 't1', active: true, outOfOffice: false },
      existingNotification: { sellerId: 's1', conversationId: 'conv-1' },
    });
    const r = await svc.handoff('t1', INPUT);
    expect(r.assigned).toBe(true);
    expect(r.notified).toBe(false);
    expect(waha.sendText).not.toHaveBeenCalled();
  });

  it('re-engagement com "Estou fora" ligado: WhatsApp com deep link', async () => {
    process.env.NEXA_APP_URL = 'https://painel.exemplo.com.br';
    const { svc, waha } = makeService({
      seller: { id: 's1', name: 'João', phone: '5511988073788', tenantId: 't1', active: true, outOfOffice: true },
      existingNotification: { sellerId: 's1', conversationId: 'conv-1' },
    });
    await svc.handoff('t1', INPUT);
    const [, msg] = waha.sendText.mock.calls[0];
    expect(msg).toContain('Lead voltou');
    expect(msg).toContain('https://painel.exemplo.com.br/inbox?c=conv-1');
  });
});

// ─── Incidente 2026-07-20 (spam de marmita): template por tipo de handoff ────
// kind='human_request' → 🙋 sem score; kind ausente/'hot_lead' → 🔥 com score.
describe('SellersService.handoff — kind (hot_lead vs human_request)', () => {
  beforeEach(() => {
    delete process.env.NEXA_APP_URL;
  });

  it('default (sem kind) → template 🔥 com score (retrocompat)', async () => {
    const { svc, waha } = makeService();
    await svc.handoff('t1', INPUT);
    const [, msg] = waha.sendText.mock.calls[0];
    expect(msg).toContain('Novo lead quente');
    expect(msg).toContain(`score ${INPUT.leadScore}`);
  });

  it('kind=human_request → template 🙋 SEM "lead quente" e SEM score', async () => {
    const { svc, waha } = makeService();
    await svc.handoff('t1', { ...INPUT, leadScore: 0, kind: 'human_request' });
    const [, msg] = waha.sendText.mock.calls[0];
    expect(msg).toContain('Cliente pediu atendimento');
    expect(msg).not.toContain('lead quente');
    expect(msg).not.toContain('score');
  });

  it('re-engagement com kind=human_request → "Cliente voltou" sem score', async () => {
    const { svc, waha } = makeService({
      seller: { id: 's1', name: 'João', phone: '5511988073788', tenantId: 't1', active: true, outOfOffice: true },
      existingNotification: { sellerId: 's1', conversationId: 'conv-1' },
    });
    await svc.handoff('t1', { ...INPUT, leadScore: 0, kind: 'human_request' });
    const [, msg] = waha.sendText.mock.calls[0];
    expect(msg).toContain('Cliente voltou');
    expect(msg).not.toContain('score');
  });
});

// ── Aviso de handoff por e-mail (2026-08-08) ────────────────────────────────
// O aviso saía só no WhatsApp do vendedor. Lead quente que chega fora do horário
// dependia de alguém ver a mensagem no celular; agora também cai na caixa de e-mail.
describe('SellersService.handoff — aviso por e-mail', () => {
  const COM_EMAIL = {
    id: 's1', tenantId: 't1', name: 'Mateus Gomes', phone: '5511994327713',
    email: 'mateus.gomes@hipertms.com.br', active: true, outOfOffice: true, assignedCount: 0,
  };

  it('avisa por e-mail quando o vendedor tem endereço', async () => {
    const { svc, emailReply } = makeService({ seller: COM_EMAIL });

    await svc.handoff('t1', INPUT);

    expect(emailReply.sendAlertEmail).toHaveBeenCalledTimes(1);
    const [para, assunto, corpo] = emailReply.sendAlertEmail.mock.calls[0];
    expect(para).toBe('mateus.gomes@hipertms.com.br');
    expect(assunto).toContain(INPUT.contactPhone);
    // Responder o aviso não fala com o cliente — o vendedor precisa saber disso.
    expect(corpo).toMatch(/NÃO fala com o cliente/i);
  });

  it('vendedor sem e-mail: nada muda (WhatsApp + sino, como antes)', async () => {
    const { svc, emailReply, waha } = makeService({ seller: { ...COM_EMAIL, email: null } });

    await svc.handoff('t1', INPUT);

    expect(emailReply.sendAlertEmail).not.toHaveBeenCalled();
    expect(waha.sendText).toHaveBeenCalled();
  });

  it('e-mail em branco conta como sem e-mail', async () => {
    const { svc, emailReply } = makeService({ seller: { ...COM_EMAIL, email: '   ' } });
    await svc.handoff('t1', INPUT);
    expect(emailReply.sendAlertEmail).not.toHaveBeenCalled();
  });

  // O lead JÁ está atribuído quando o aviso sai. Trocar "não avisou" por "lead sem
  // dono" seria estritamente pior.
  it('falha de SMTP não derruba o handoff', async () => {
    const { svc } = makeService({ seller: COM_EMAIL });
    (svc as any).emailReply.sendAlertEmail = vi.fn().mockRejectedValue(new Error('smtp fora'));

    const r = await svc.handoff('t1', INPUT);

    expect(r).toMatchObject({ assigned: true, sellerName: 'Mateus Gomes' });
  });

  it('pedido de humano usa assunto próprio (não é lead quente)', async () => {
    const { svc, emailReply } = makeService({ seller: COM_EMAIL });

    await svc.handoff('t1', { ...INPUT, kind: 'human_request' });

    expect(emailReply.sendAlertEmail.mock.calls[0][1]).toMatch(/pediu atendimento/i);
  });
});
