import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from '@/application/conversations/conversations.service';

// Instancia o controller direto com mock (mesmo padrão do whatsapp.controller.spec).
function makeController() {
  const service = {
    getMessages: vi.fn().mockResolvedValue([]),
    assignAnalyst: vi.fn().mockResolvedValue({}),
  } as unknown as ConversationsService;
  return { controller: new ConversationsController(service), service: service as any };
}

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
    expect(service.getMessages).toHaveBeenCalledWith('t1', 'conv-1', { includeInternal: true });
  });

  it('operacional (analista de suporte): recebe as notas internas', async () => {
    await controller.messages('t1', { role: 'operacional' }, 'conv-1');
    expect(service.getMessages).toHaveBeenCalledWith('t1', 'conv-1', { includeInternal: true });
  });

  it('vendedor: NÃO recebe nota interna — vê o mesmo que o cliente veria', async () => {
    await controller.messages('t1', { role: 'vendedor' }, 'conv-1');
    expect(service.getMessages).toHaveBeenCalledWith('t1', 'conv-1', { includeInternal: false });
  });

  // Allowlist é fail-closed de propósito: papel novo entra SEM acesso até ser
  // liberado conscientemente. O inverso (denylist) daria acesso por esquecimento
  // — que foi exatamente como este furo apareceu.
  it('papel desconhecido/futuro: fail-closed, sem nota interna', async () => {
    await controller.messages('t1', { role: 'financeiro' }, 'conv-1');
    expect(service.getMessages).toHaveBeenCalledWith('t1', 'conv-1', { includeInternal: false });
  });

  it('sem papel definido: fail-closed', async () => {
    await controller.messages('t1', undefined, 'conv-1');
    expect(service.getMessages).toHaveBeenCalledWith('t1', 'conv-1', { includeInternal: false });
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
