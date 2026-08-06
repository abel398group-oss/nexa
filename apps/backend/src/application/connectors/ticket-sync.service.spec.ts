import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketSyncService } from './ticket-sync.service';

function makePrisma() {
  return {
    aiConversation: {
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}
const makeConnector = (result: any = { ok: true }) => ({ syncTicket: vi.fn().mockResolvedValue(result) }) as any;
const makeLock = () => ({ acquire: vi.fn().mockResolvedValue(async () => {}) }) as any;

const conv = (over: any = {}) => ({
  id: 'c1', tenantId: 't1', externalId: 'ext-1', ticketNumber: 47,
  ticketCategory: 'cte', ticketPriority: 'high', status: 'closed',
  subject: 'CT-e não emite', rootCause: 'Certificado vencido',
  resolvedAt: new Date('2026-08-05T14:32:00Z'), humanTakeoverAt: null,
  csatScore: 4, ticketSyncAttempts: 0, ...over,
});

describe('TicketSyncService', () => {
  const OLD_ENV = process.env;
  beforeEach(() => { process.env = { ...OLD_ENV, NEXA_PUBLIC_URL: 'https://app.nexa.example' }; });

  describe('markPending', () => {
    it('marca pending, zera tentativas e agenda pra agora', async () => {
      const prisma = makePrisma();
      const svc = new TicketSyncService(prisma, makeConnector(), makeLock());
      await svc.markPending('c1');
      expect(prisma.aiConversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: expect.objectContaining({ ticketSyncStatus: 'pending', ticketSyncAttempts: 0, ticketSyncError: null }),
      });
    });

    it('nunca lança — quem chama está no meio de outra operação', async () => {
      const prisma = makePrisma();
      prisma.aiConversation.update.mockRejectedValue(new Error('db fora'));
      const svc = new TicketSyncService(prisma, makeConnector(), makeLock());
      await expect(svc.markPending('c1')).resolves.toBeUndefined();
    });
  });

  describe('syncOne', () => {
    it('sem ticketNumber: nada a sincronizar, não chama o conector', async () => {
      const prisma = makePrisma();
      prisma.aiConversation.findUnique.mockResolvedValue(conv({ ticketNumber: null }));
      const connector = makeConnector();
      const svc = new TicketSyncService(prisma, connector, makeLock());
      await svc.syncOne('c1');
      expect(connector.syncTicket).not.toHaveBeenCalled();
    });

    it('conversa sumiu: não quebra', async () => {
      const prisma = makePrisma();
      prisma.aiConversation.findUnique.mockResolvedValue(null);
      const connector = makeConnector();
      const svc = new TicketSyncService(prisma, connector, makeLock());
      await expect(svc.syncOne('c1')).resolves.toBeUndefined();
      expect(connector.syncTicket).not.toHaveBeenCalled();
    });

    it('monta o payload no formato combinado com o TMS', async () => {
      const prisma = makePrisma();
      prisma.aiConversation.findUnique.mockResolvedValue(conv());
      const connector = makeConnector();
      const svc = new TicketSyncService(prisma, connector, makeLock());
      await svc.syncOne('c1');

      expect(connector.syncTicket).toHaveBeenCalledWith({
        event: 'ticket.updated',
        tenantId: 't1',
        externalId: 'ext-1',
        ticketNumber: 47,
        category: 'cte',
        priority: 'high',
        status: 'closed',
        subject: 'CT-e não emite',
        rootCause: 'Certificado vencido',
        resolvedByAi: true,
        resolvedAt: '2026-08-05T14:32:00.000Z',
        csatScore: 4,
        conversationUrl: 'https://app.nexa.example/inbox?c=c1',
      });
    });

    it('resolvedByAi é false quando um humano assumiu a conversa', async () => {
      const prisma = makePrisma();
      prisma.aiConversation.findUnique.mockResolvedValue(conv({ humanTakeoverAt: new Date() }));
      const connector = makeConnector();
      const svc = new TicketSyncService(prisma, connector, makeLock());
      await svc.syncOne('c1');
      expect(connector.syncTicket.mock.calls[0][0].resolvedByAi).toBe(false);
    });

    // Achado em produção (2026-08-06): o primeiro ticket real tinha status
    // 'escalated' (Lia chamou humano, ainda não fechou) e o TMS devolveu 400 —
    // a especificação só documentou 'closed'/'open' como valores possíveis.
    it('normaliza status interno pra open/closed — TMS só conhece esses dois', async () => {
      const prisma = makePrisma();
      const connector = makeConnector();
      const svc = new TicketSyncService(prisma, connector, makeLock());

      for (const interno of ['open', 'waiting_customer', 'waiting_internal', 'escalated', 'opt_out']) {
        prisma.aiConversation.findUnique.mockResolvedValue(conv({ status: interno }));
        await svc.syncOne('c1');
        expect(connector.syncTicket.mock.calls.at(-1)[0].status).toBe('open');
      }

      prisma.aiConversation.findUnique.mockResolvedValue(conv({ status: 'closed' }));
      await svc.syncOne('c1');
      expect(connector.syncTicket.mock.calls.at(-1)[0].status).toBe('closed');
    });

    it('resolvedByAi é null quando o ticket ainda não fechou (status != closed)', async () => {
      const prisma = makePrisma();
      prisma.aiConversation.findUnique.mockResolvedValue(conv({ status: 'open' }));
      const connector = makeConnector();
      const svc = new TicketSyncService(prisma, connector, makeLock());
      await svc.syncOne('c1');
      expect(connector.syncTicket.mock.calls[0][0].resolvedByAi).toBeNull();
    });

    it('sem NEXA_PUBLIC_URL: conversationUrl vem null, sem quebrar', async () => {
      delete process.env.NEXA_PUBLIC_URL;
      const prisma = makePrisma();
      prisma.aiConversation.findUnique.mockResolvedValue(conv());
      const connector = makeConnector();
      const svc = new TicketSyncService(prisma, connector, makeLock());
      await svc.syncOne('c1');
      expect(connector.syncTicket.mock.calls[0][0].conversationUrl).toBeNull();
    });

    it('sucesso: marca delivered e limpa o erro', async () => {
      const prisma = makePrisma();
      prisma.aiConversation.findUnique.mockResolvedValue(conv());
      const svc = new TicketSyncService(prisma, makeConnector({ ok: true }), makeLock());
      await svc.syncOne('c1');
      expect(prisma.aiConversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { ticketSyncStatus: 'delivered', ticketSyncError: null },
      });
    });

    it('falha: incrementa tentativa e agenda o próximo retry (backoff)', async () => {
      const prisma = makePrisma();
      prisma.aiConversation.findUnique.mockResolvedValue(conv({ ticketSyncAttempts: 0 }));
      const svc = new TicketSyncService(prisma, makeConnector({ ok: false, error: 'HTTP 500' }), makeLock());
      await svc.syncOne('c1');
      const data = prisma.aiConversation.update.mock.calls[0][0].data;
      expect(data.ticketSyncStatus).toBe('pending');
      expect(data.ticketSyncAttempts).toBe(1);
      expect(data.ticketSyncNextRetryAt).toBeInstanceOf(Date);
      expect(data.ticketSyncError).toBe('HTTP 500');
    });

    it('esgotou as 5 tentativas: marca failed, sem novo retry agendado', async () => {
      const prisma = makePrisma();
      prisma.aiConversation.findUnique.mockResolvedValue(conv({ ticketSyncAttempts: 4 }));
      const svc = new TicketSyncService(prisma, makeConnector({ ok: false, error: 'HTTP 500' }), makeLock());
      await svc.syncOne('c1');
      const data = prisma.aiConversation.update.mock.calls[0][0].data;
      expect(data.ticketSyncStatus).toBe('failed');
      expect(data.ticketSyncAttempts).toBe(5);
      expect(data.ticketSyncNextRetryAt).toBeNull();
    });
  });

  describe('retryPending', () => {
    it('sem lock (outra réplica varrendo): não consulta nada', async () => {
      const prisma = makePrisma();
      const lock = { acquire: vi.fn().mockResolvedValue(null) } as any;
      const svc = new TicketSyncService(prisma, makeConnector(), lock);
      await svc.retryPending();
      expect(prisma.aiConversation.findMany).not.toHaveBeenCalled();
    });

    it('varre pendências vencidas e tenta sincronizar cada uma', async () => {
      const prisma = makePrisma();
      prisma.aiConversation.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      prisma.aiConversation.findUnique.mockResolvedValue(conv());
      const connector = makeConnector();
      const svc = new TicketSyncService(prisma, connector, makeLock());

      await svc.retryPending();

      expect(prisma.aiConversation.findMany.mock.calls[0][0].where).toMatchObject({
        ticketSyncStatus: 'pending',
      });
      expect(connector.syncTicket).toHaveBeenCalledTimes(2);
    });
  });
});
