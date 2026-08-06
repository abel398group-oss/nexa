import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationsGateway } from './conversations.gateway';

// F12: a sala `conv:<id>` tem TANTO o operador do inbox QUANTO o widget do
// cliente (quando o canal é web_chat/portal) — handleConnection() auto-junta
// o widget nela. Por isso nota interna não pode passar por `conv:<id>` nunca;
// só `staff:conv:<id>`, que o widget do cliente jamais entra.

function makeDeps() {
  const handoff = { consume: vi.fn() } as any;
  const conversations = { findOne: vi.fn(), getMessages: vi.fn() } as any;
  const eventEmitter = { emit: vi.fn() } as any;
  const jwt = { verify: vi.fn() } as any;
  return { handoff, conversations, eventEmitter, jwt };
}

function makeGateway(deps: ReturnType<typeof makeDeps>) {
  const gw = new ConversationsGateway(deps.handoff, deps.conversations, deps.eventEmitter, deps.jwt);
  const toMock = vi.fn();
  const emitMock = vi.fn();
  toMock.mockReturnValue({ emit: emitMock });
  (gw as any).server = { to: toMock };
  return { gw, toMock, emitMock };
}

function makeSocket(data: any = {}) {
  return { data, join: vi.fn() } as any;
}

describe('ConversationsGateway — F12 onJoin: sala staff só pra operador validado', () => {
  it('operador com tenantId no socket: entra em conv:<id> E staff:conv:<id>', async () => {
    const deps = makeDeps();
    deps.conversations.findOne.mockResolvedValue({ id: 'conv-1' });
    const { gw } = makeGateway(deps);
    const client = makeSocket({ tenantId: 't1' });

    await gw.onJoin({ conversationId: 'conv-1' }, client);

    expect(client.join).toHaveBeenCalledWith('conv:conv-1');
    expect(client.join).toHaveBeenCalledWith('staff:conv:conv-1');
  });

  it('socket sem tenantId (join legado/sem cookie válido): entra só em conv:<id>, NUNCA na sala staff', async () => {
    const deps = makeDeps();
    const { gw } = makeGateway(deps);
    const client = makeSocket({}); // sem tenantId

    await gw.onJoin({ conversationId: 'conv-1' }, client);

    expect(client.join).toHaveBeenCalledWith('conv:conv-1');
    expect(client.join).not.toHaveBeenCalledWith('staff:conv:conv-1');
  });

  it('conversa de outro tenant: rejeita o join, não entra em nenhuma sala', async () => {
    const deps = makeDeps();
    deps.conversations.findOne.mockResolvedValue(null); // não pertence ao tenant
    const { gw } = makeGateway(deps);
    const client = makeSocket({ tenantId: 't1' });

    const r = await gw.onJoin({ conversationId: 'conv-alheio' }, client);

    expect(r).toEqual({ error: 'Conversa não encontrada ou sem permissão' });
    expect(client.join).not.toHaveBeenCalled();
  });
});

describe('ConversationsGateway — F12 handleMessageCreated: nota interna nunca vaza pro cliente', () => {
  it('mensagem normal (isInternal ausente/false): emite em conv:<id>, comportamento inalterado', () => {
    const deps = makeDeps();
    const { gw, toMock, emitMock } = makeGateway(deps);

    gw.handleMessageCreated({
      conversationId: 'conv-1',
      message: { id: 'm1', content: 'oi cliente', direction: 'outbound', createdAt: new Date().toISOString() },
    });

    expect(toMock).toHaveBeenCalledWith('conv:conv-1');
    expect(toMock).not.toHaveBeenCalledWith('staff:conv:conv-1');
    // dois emits: 'message' genérico + 'web_chat:message' (outbound)
    expect(emitMock).toHaveBeenCalledWith('message', expect.objectContaining({ id: 'm1' }));
    expect(emitMock).toHaveBeenCalledWith('web_chat:message', expect.objectContaining({ id: 'm1', isAgent: true }));
  });

  it('nota interna (isInternal=true): emite SÓ em staff:conv:<id>, nunca em conv:<id>', () => {
    const deps = makeDeps();
    const { gw, toMock, emitMock } = makeGateway(deps);

    gw.handleMessageCreated({
      conversationId: 'conv-1',
      message: { id: 'm2', content: 'segredo do time', direction: 'outbound', isInternal: true },
    });

    expect(toMock).toHaveBeenCalledWith('staff:conv:conv-1');
    expect(toMock).not.toHaveBeenCalledWith('conv:conv-1');
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith('message', expect.objectContaining({ id: 'm2', isInternal: true }));
    // NUNCA gera web_chat:message pra nota interna — o widget do cliente não pode ecoar isto
    expect(emitMock).not.toHaveBeenCalledWith('web_chat:message', expect.anything());
  });
});
