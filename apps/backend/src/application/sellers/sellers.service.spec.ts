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
  // O aviso por e-mail sai por EVENTO (SellerHandoffListener). Aqui verificamos só
  // o anúncio — o envio em si é testado no listener.
  const events = { emit: vi.fn() } as any;
  const svc = new SellersService(prisma, waha, events);
  return { svc, prisma, waha, events };
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

  it('outOfOffice=false + score abaixo do teto → NÃO envia WhatsApp, mas atribui normalmente', async () => {
    const { svc, waha, prisma } = makeService({
      seller: { id: 's1', name: 'João', phone: '5511988073788', tenantId: 't1', active: true, outOfOffice: false },
    });
    const r = await svc.handoff('t1', { ...INPUT, leadScore: 72 });
    expect(r.assigned).toBe(true);
    expect(r.notified).toBe(false);
    expect(waha.sendText).not.toHaveBeenCalled();
    // atribuição aconteceu (transação com update da conversa + dedup)
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  // 2026-08-08: exceção de alta prioridade. Vendedor com o status desligado que
  // não vive no painel não ficava sabendo — e quem esperava era o lead mais caro
  // da fila. Acima do teto o WhatsApp sai mesmo "no PC"; abaixo, ADR 034 intacta.
  it('outOfOffice=false + score alto → FURA a ADR 034 e envia WhatsApp', async () => {
    const { svc, waha } = makeService({
      seller: { id: 's1', name: 'João', phone: '5511988073788', tenantId: 't1', active: true, outOfOffice: false },
    });
    const r = await svc.handoff('t1', { ...INPUT, leadScore: 85 });
    expect(r.notified).toBe(true);
    expect(waha.sendText).toHaveBeenCalledOnce();
  });

  it('outOfOffice=false + score alto mas "pediu atendente" → NÃO fura (só hot_lead fura)', async () => {
    const { svc, waha } = makeService({
      seller: { id: 's1', name: 'João', phone: '5511988073788', tenantId: 't1', active: true, outOfOffice: false },
    });
    const r = await svc.handoff('t1', { ...INPUT, leadScore: 95, kind: 'human_request' });
    expect(r.notified).toBe(false);
    expect(waha.sendText).not.toHaveBeenCalled();
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
    const r = await svc.handoff('t1', { ...INPUT, leadScore: 72 });
    expect(r.assigned).toBe(true);
    expect(r.notified).toBe(false);
    expect(waha.sendText).not.toHaveBeenCalled();
  });

  it('re-engagement de lead com score alto: fura a ADR 034 também', async () => {
    const { svc, waha } = makeService({
      seller: { id: 's1', name: 'João', phone: '5511988073788', tenantId: 't1', active: true, outOfOffice: false },
      existingNotification: { sellerId: 's1', conversationId: 'conv-1' },
    });
    const r = await svc.handoff('t1', { ...INPUT, leadScore: 85 });
    expect(r.notified).toBe(true);
    expect(waha.sendText).toHaveBeenCalledOnce();
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
// O aviso saía só no WhatsApp. Lead quente fora do horário dependia de alguém ver a
// mensagem no celular. Agora o handoff ANUNCIA e o SellerHandoffListener manda o
// e-mail — evento, e não chamada direta, porque injetar e-mail aqui fechava um ciclo
// de módulos e o Nest não subia.
describe('SellersService.handoff — anúncio para o aviso por e-mail', () => {
  const COM_EMAIL = {
    id: 's1', tenantId: 't1', name: 'Mateus Gomes', phone: '5511994327713',
    email: 'mateus.gomes@hipertms.com.br', active: true, outOfOffice: true, assignedCount: 0,
  };

  it('anuncia com o e-mail e o contexto do lead', async () => {
    const { svc, events } = makeService({ seller: COM_EMAIL });

    await svc.handoff('t1', INPUT);

    const [nome, payload] = events.emit.mock.calls.find((c: any[]) => c[0] === 'seller.handoff')!;
    expect(nome).toBe('seller.handoff');
    expect(payload).toMatchObject({
      tenantId: 't1',
      sellerEmail: 'mateus.gomes@hipertms.com.br',
      kind: 'hot_lead',
      contactPhone: INPUT.contactPhone,
      conversationId: INPUT.conversationId,
    });
  });

  it('vendedor sem e-mail ainda anuncia — quem decide não enviar é o listener', async () => {
    const { svc, events, waha } = makeService({ seller: { ...COM_EMAIL, email: null } });

    await svc.handoff('t1', INPUT);

    const ev = events.emit.mock.calls.find((c: any[]) => c[0] === 'seller.handoff')![1];
    expect(ev.sellerEmail).toBeNull();
    expect(waha.sendText).toHaveBeenCalled(); // WhatsApp segue igual
  });

  it('pedido de humano viaja com o kind certo (assunto muda no listener)', async () => {
    const { svc, events } = makeService({ seller: COM_EMAIL });

    await svc.handoff('t1', { ...INPUT, kind: 'human_request' });

    const ev = events.emit.mock.calls.find((c: any[]) => c[0] === 'seller.handoff')![1];
    expect(ev.kind).toBe('human_request');
  });

  it('leva o deep link pronto — quem monta URL é quem conhece a config', async () => {
    const { svc, events } = makeService({ seller: COM_EMAIL });

    await svc.handoff('t1', INPUT);

    const ev = events.emit.mock.calls.find((c: any[]) => c[0] === 'seller.handoff')![1];
    expect(typeof ev.attendLine).toBe('string');
    expect(ev.attendLine.length).toBeGreaterThan(0);
  });
});