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
    $transaction: vi.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
  } as any;

  const waha = { sendText: vi.fn().mockResolvedValue({ sent: true }) } as any;
  const svc = new SellersService(prisma, waha);
  return { svc, prisma, waha };
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
