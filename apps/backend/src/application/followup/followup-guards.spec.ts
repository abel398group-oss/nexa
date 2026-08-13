import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FollowUpService } from './followup.service';

/**
 * A cadência de follow-up só parava quando o LEAD respondia ou dava opt-out —
 * os dois únicos `stop()` do projeto, ambos no whatsapp.service. Faltavam os
 * casos em que quem mexeu na conversa fomos NÓS, que são justamente os que o
 * cliente vê. Achado em 13/08/2026.
 *
 * A checagem mora no instante ANTES do envio, não no agendamento: entre marcar
 * o follow-up e ele vencer passam 24h ou 72h, e o estado muda no meio.
 */
function makeService(conversa: any, followUps: any[] = [{ id: 'f1', tenantId: 't1', conversationId: 'conv1', phone: '5511999999999', name: 'Ana', stage: 0 }]) {
  const update = vi.fn().mockResolvedValue({});
  const addMessage = vi.fn().mockResolvedValue({});
  const prisma: any = {
    followUp: { findMany: vi.fn().mockResolvedValue(followUps), update },
    contact: { findFirst: vi.fn().mockResolvedValue({ status: 'active' }) },
    aiConversation: { findUnique: vi.fn().mockResolvedValue(conversa) },
  };
  const svc: any = new FollowUpService(prisma, { addMessage } as any, {} as any);
  svc['logger'] = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  svc['withinBusinessHours'] = () => true; // fora do escopo destes testes
  return { svc, prisma, update, addMessage };
}

const ABERTA = { status: 'open', humanTakeoverAt: null };

describe('FollowUpService — quando NÃO mandar o follow-up', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => vi.clearAllMocks());

  // ADR 035: com takeover a Lia entra em modo rascunho e não fala sozinha. O
  // follow-up passava por fora — o vendedor escrevia de próprio punho e 24h
  // depois o MESMO número mandava "ainda tem interesse?" automático.
  it('humano assumiu a conversa: para a cadência e não manda nada', async () => {
    ctx = makeService({ status: 'open', humanTakeoverAt: new Date() });

    await ctx.svc['tickLocked']();

    expect(ctx.addMessage).not.toHaveBeenCalled();
    expect(ctx.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { status: 'stopped' } });
  });

  // Perguntar "ainda tem interesse?" para quem acabou de fechar negócio é o
  // pior desfecho possível.
  it.each([['closed'], ['opt_out']])('conversa %s: para a cadência e não manda nada', async (status) => {
    ctx = makeService({ status, humanTakeoverAt: null });

    await ctx.svc['tickLocked']();

    expect(ctx.addMessage).not.toHaveBeenCalled();
    expect(ctx.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { status: 'stopped' } });
  });

  // Sem isto o addMessage estouraria a cada 20s, para sempre, sem nunca sair
  // de 'pending'.
  it('conversa apagada: para a cadência em vez de tentar para sempre', async () => {
    ctx = makeService(null);

    await ctx.svc['tickLocked']();

    expect(ctx.addMessage).not.toHaveBeenCalled();
    expect(ctx.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { status: 'stopped' } });
  });

  it('opt-out do contato continua barrando antes de tudo', async () => {
    ctx = makeService(ABERTA);
    ctx.prisma.contact.findFirst.mockResolvedValue({ status: 'opted_out' });

    await ctx.svc['tickLocked']();

    expect(ctx.addMessage).not.toHaveBeenCalled();
    expect(ctx.prisma.aiConversation.findUnique).not.toHaveBeenCalled();
  });
});

describe('FollowUpService — o caminho que DEVE continuar funcionando', () => {
  beforeEach(() => vi.clearAllMocks());

  it('conversa aberta e sem takeover: manda e reagenda o estágio 2', async () => {
    const ctx = makeService(ABERTA);

    await ctx.svc['tickLocked']();

    expect(ctx.addMessage).toHaveBeenCalledTimes(1);
    const [tenantId, conversationId, dto] = ctx.addMessage.mock.calls[0];
    expect(tenantId).toBe('t1');
    expect(conversationId).toBe('conv1');
    expect(dto.direction).toBe('outbound');
    expect(dto.intent).toBe('followup_1');
    expect(dto.sendOrigin).toBe('followup');

    // estágio 1 de 2 → segue pendente, com nova data
    const gravado = ctx.update.mock.calls.at(-1)![0].data;
    expect(gravado.stage).toBe(1);
    expect(gravado.status).toBe('pending');
  });

  it('estágio 2 encerra a cadência como done, não como stopped', async () => {
    const ctx = makeService(ABERTA, [
      { id: 'f1', tenantId: 't1', conversationId: 'conv1', phone: '5511999999999', name: 'Ana', stage: 1 },
    ]);

    await ctx.svc['tickLocked']();

    expect(ctx.addMessage).toHaveBeenCalledTimes(1);
    expect(ctx.update.mock.calls.at(-1)![0].data.status).toBe('done');
  });

  it('fora do horário comercial não manda nada', async () => {
    const ctx = makeService(ABERTA);
    ctx.svc['withinBusinessHours'] = () => false;

    await ctx.svc['tickLocked']();

    expect(ctx.addMessage).not.toHaveBeenCalled();
    expect(ctx.prisma.followUp.findMany).not.toHaveBeenCalled();
  });
});
