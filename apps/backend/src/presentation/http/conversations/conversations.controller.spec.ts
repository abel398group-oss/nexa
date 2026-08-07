import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from '@/application/conversations/conversations.service';

// Instancia o controller direto com mock (mesmo padrão do whatsapp.controller.spec).
function makeController() {
  const service = {
    getMessages: vi.fn().mockResolvedValue([]),
    assignAnalyst: vi.fn().mockResolvedValue({}),
    findOneScoped: vi.fn().mockResolvedValue({}),
    getTimeline: vi.fn().mockResolvedValue([]),
    addMessage: vi.fn().mockResolvedValue({}),
    updateInternalNote: vi.fn().mockResolvedValue({}),
    deleteInternalNote: vi.fn().mockResolvedValue({}),
  } as unknown as ConversationsService;
  return { controller: new ConversationsController(service), service: service as any };
}

const VENDEDOR = { role: 'vendedor', userId: 'u-vend', sellerId: 'seller-9' };
const OPERACIONAL = { role: 'operacional', userId: 'u-op' };

/**
 * Item 1.1 (auditoria 2026-08-06) — fronteira de leitura de NOTA INTERNA.
 *
 * O furo original: a rota mandava `includeInternal: true` fixo, então qualquer
 * usuário autenticado do tenant lia as notas internas de qualquer chamado
 * batendo direto na API. Como `vendedor` já vem com a permissão `inbox` de
 * fábrica, filtrar por permissão não separaria nada — a fronteira é de PAPEL.
 */
describe('ConversationsController — 1.1 nota interna só para quem opera suporte', () => {
  let controller: ConversationsController;
  let service: any;

  beforeEach(() => {
    ({ controller, service } = makeController());
  });

  it('admin: recebe as notas internas', async () => {
    await controller.messages('t1', { role: 'admin' }, 'conv-1');
    expect(service.getMessages.mock.calls[0][2].includeInternal).toBe(true);
  });

  it('operacional (analista de suporte): recebe as notas internas', async () => {
    await controller.messages('t1', { role: 'operacional' }, 'conv-1');
    expect(service.getMessages.mock.calls[0][2].includeInternal).toBe(true);
  });

  it('vendedor: NÃO recebe nota interna — vê o mesmo que o cliente veria', async () => {
    await controller.messages('t1', { role: 'vendedor' }, 'conv-1');
    expect(service.getMessages.mock.calls[0][2].includeInternal).toBe(false);
  });

  // Allowlist é fail-closed de propósito: papel novo entra SEM acesso até ser
  // liberado conscientemente. O inverso (denylist) daria acesso por esquecimento
  // — que foi exatamente como este furo apareceu.
  it('papel desconhecido/futuro: fail-closed, sem nota interna', async () => {
    await controller.messages('t1', { role: 'financeiro' }, 'conv-1');
    expect(service.getMessages.mock.calls[0][2].includeInternal).toBe(false);
  });

  it('sem papel definido: fail-closed', async () => {
    await controller.messages('t1', undefined, 'conv-1');
    expect(service.getMessages.mock.calls[0][2].includeInternal).toBe(false);
  });
});

// Item 1.4: o controller precisa PRESERVAR a diferença entre "não mandou
// precondição" (undefined → transferência) e "mandou null" (→ assumir livre).
// Um `?? null` no lugar errado aqui apagaria a distinção e desligaria a trava.
describe('ConversationsController — 1.4 repassa a precondição de atribuição', () => {
  let controller: ConversationsController;
  let service: any;

  beforeEach(() => {
    ({ controller, service } = makeController());
  });

  it('expectedAnalystId ausente: repassa undefined (transferência deliberada)', async () => {
    await controller.assignAnalyst('t1', 'conv-1', { userId: 'user-1' });
    expect(service.assignAnalyst).toHaveBeenCalledWith('t1', 'conv-1', 'user-1', {
      expectedAnalystId: undefined,
    });
  });

  it('expectedAnalystId null: repassa null (assumir chamado da fila geral)', async () => {
    await controller.assignAnalyst('t1', 'conv-1', { userId: 'user-1', expectedAnalystId: null });
    expect(service.assignAnalyst).toHaveBeenCalledWith('t1', 'conv-1', 'user-1', {
      expectedAnalystId: null,
    });
  });

  it('userId ausente vira null (devolver pra fila)', async () => {
    await controller.assignAnalyst('t1', 'conv-1', {});
    expect(service.assignAnalyst).toHaveBeenCalledWith('t1', 'conv-1', null, {
      expectedAnalystId: undefined,
    });
  });
});

// ─── Etapa 2A: escopo de carteira nas rotas de leitura por id ────────────────
// A regra vive no service (findOneScoped); o que se testa aqui é o WIRING —
// esquecer de repassar sellerScope numa das rotas reabre o furo em silêncio.
describe('ConversationsController — 2A repassa o escopo de vendedor', () => {
  let controller: ConversationsController;
  let service: any;

  beforeEach(() => {
    ({ controller, service } = makeController());
  });

  it('GET :id/messages — vendedor: manda o sellerId dele', async () => {
    await controller.messages('t1', VENDEDOR, 'conv-1');
    expect(service.getMessages).toHaveBeenCalledWith('t1', 'conv-1', {
      includeInternal: false,
      sellerId: 'seller-9',
    });
  });

  it('GET :id/messages — operacional: sem escopo de carteira', async () => {
    await controller.messages('t1', OPERACIONAL, 'conv-1');
    expect(service.getMessages).toHaveBeenCalledWith('t1', 'conv-1', {
      includeInternal: true,
      sellerId: undefined,
    });
  });

  it('vendedor sem sellerId cai em __none__ (não vira "sem escopo")', async () => {
    await controller.messages('t1', { role: 'vendedor', userId: 'u2' }, 'conv-1');
    // o perigo aqui seria undefined: desligaria o filtro e liberaria tudo
    expect(service.getMessages.mock.calls[0][2].sellerId).toBe('__none__');
  });

  it('GET :id — detalhe também é escopado', async () => {
    await controller.findOne('t1', VENDEDOR, 'conv-1');
    expect(service.findOneScoped).toHaveBeenCalledWith('t1', 'conv-1', 'seller-9');
  });

  it('GET :id/timeline — timeline também é escopada', async () => {
    await controller.timeline('t1', VENDEDOR, 'conv-1');
    expect(service.getTimeline).toHaveBeenCalledWith('t1', 'conv-1', 'seller-9');
  });
});

// ─── Etapa 2A: autor da mensagem vem do JWT, nunca do body ──────────────────
describe('ConversationsController — 2A grava o autor a partir do JWT', () => {
  let controller: ConversationsController;
  let service: any;

  beforeEach(() => {
    ({ controller, service } = makeController());
  });

  it('usa o userId do token como autor', async () => {
    await controller.addMessage('t1', OPERACIONAL, 'conv-1', {
      direction: 'outbound',
      content: 'nota',
      isInternal: true,
    } as any);
    expect(service.addMessage.mock.calls[0][2].authorUserId).toBe('u-op');
  });

  it('body não consegue forjar o autor — o do token vence', async () => {
    await controller.addMessage('t1', OPERACIONAL, 'conv-1', {
      direction: 'outbound',
      content: 'nota',
      authorUserId: 'vitima-123',
    } as any);
    expect(service.addMessage.mock.calls[0][2].authorUserId).toBe('u-op');
  });
});

// ─── Etapa 2A: rotas de nota interna repassam o ator ────────────────────────
describe('ConversationsController — 2A editar/excluir nota interna', () => {
  let controller: ConversationsController;
  let service: any;

  beforeEach(() => {
    ({ controller, service } = makeController());
  });

  it('PATCH repassa userId e role (base da autorização no service)', async () => {
    await controller.updateInternalNote('t1', OPERACIONAL, 'msg-1', { content: 'novo' });
    expect(service.updateInternalNote).toHaveBeenCalledWith('t1', 'msg-1', 'novo', {
      userId: 'u-op',
      role: 'operacional',
    });
  });

  it('DELETE repassa userId e role', async () => {
    await controller.deleteInternalNote('t1', OPERACIONAL, 'msg-1');
    expect(service.deleteInternalNote).toHaveBeenCalledWith('t1', 'msg-1', {
      userId: 'u-op',
      role: 'operacional',
    });
  });
});
