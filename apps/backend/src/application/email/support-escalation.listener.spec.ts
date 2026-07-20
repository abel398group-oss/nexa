import { describe, it, expect, vi, afterEach } from 'vitest';
import { SupportEscalationListener } from './support-escalation.listener';

// SupportEscalationListener - roteamento por categoria (SupportEmailRoute)
// Cenarios:
//   1. Rota especifica da categoria -> usa email da rota
//   2. Sem rota de categoria, tem rota padrao (null) -> usa padrao
//   3. Sem rotas DB -> fallback SUPPORT_EMAIL env
//   4. Sem nada -> nao envia
//   5. Erro no findMany -> ainda usa env (fail-safe)
//   6. Chamado sem categoria -> usa rota padrao

const baseConv = {
  ticketNumber: 42,
  subject: 'CT-e rejeitado',
  ticketCategory: 'fiscal',
  ticketPriority: 'alta',
  phone: '5511999999999',
  contactId: 'contact-1',
};

function makeDeps(
  routes: Array<{ category: string | null; email: string }> = [],
  convOverrides: Record<string, unknown> = {},
) {
  const prisma = {
    supportEmailRoute: {
      findMany: vi.fn().mockResolvedValue(routes),
    },
    aiConversation: {
      findUnique: vi.fn().mockResolvedValue({ ...baseConv, ...convOverrides }),
    },
    contact: {
      findUnique: vi.fn().mockResolvedValue({ name: 'Joao Silva' }),
    },
  } as any;

  const email = { sendAlertEmail: vi.fn().mockResolvedValue(undefined) } as any;
  const waha = { sendText: vi.fn().mockResolvedValue({ sent: true }) } as any;
  return { prisma, email, waha };
}

const makeListener = (deps: ReturnType<typeof makeDeps>) =>
  new SupportEscalationListener(deps.prisma, deps.email, deps.waha);

const event = { tenantId: 't1', conversationId: 'conv-1', origin: 'portal' as const };

describe('SupportEscalationListener - roteamento por categoria', () => {
  const origEnv = process.env.SUPPORT_EMAIL;

  afterEach(() => {
    if (origEnv === undefined) delete process.env.SUPPORT_EMAIL;
    else process.env.SUPPORT_EMAIL = origEnv;
  });

  it('usa rota especifica da categoria quando existe', async () => {
    delete process.env.SUPPORT_EMAIL;
    const deps = makeDeps([
      { category: 'fiscal', email: 'fiscal@empresa.com.br' },
      { category: null,     email: 'padrao@empresa.com.br' },
    ]);
    await makeListener(deps).handle(event);
    expect(deps.email.sendAlertEmail).toHaveBeenCalledWith(
      'fiscal@empresa.com.br',
      expect.any(String),
      expect.any(String),
      't1',
    );
  });

  it('rota da categoria tem prioridade sobre rota padrao', async () => {
    const deps = makeDeps([
      { category: 'fiscal',     email: 'fiscal@empresa.com.br' },
      { category: 'financeiro', email: 'fin@empresa.com.br' },
      { category: null,         email: 'padrao@empresa.com.br' },
    ]);
    await makeListener(deps).handle(event);
    expect(deps.email.sendAlertEmail).toHaveBeenCalledWith(
      'fiscal@empresa.com.br',
      expect.any(String),
      expect.any(String),
      't1',
    );
    expect(deps.email.sendAlertEmail).not.toHaveBeenCalledWith(
      'padrao@empresa.com.br',
      expect.any(String),
      expect.any(String),
      expect.any(String),
    );
  });

  it('usa rota padrao quando categoria nao tem rota especifica', async () => {
    delete process.env.SUPPORT_EMAIL;
    const deps = makeDeps([
      { category: 'financeiro', email: 'fin@empresa.com.br' },
      { category: null,         email: 'padrao@empresa.com.br' },
    ]); // chamado fiscal mas so ha rota financeiro + padrao
    await makeListener(deps).handle(event);
    expect(deps.email.sendAlertEmail).toHaveBeenCalledWith(
      'padrao@empresa.com.br',
      expect.any(String),
      expect.any(String),
      't1',
    );
  });

  it('fallback para SUPPORT_EMAIL env quando nao ha rotas no DB', async () => {
    process.env.SUPPORT_EMAIL = 'env@suporte.com';
    const deps = makeDeps([]);
    await makeListener(deps).handle(event);
    expect(deps.email.sendAlertEmail).toHaveBeenCalledWith(
      'env@suporte.com',
      expect.any(String),
      expect.any(String),
      't1',
    );
  });

  it('sem rotas e sem env -> nao envia (sem excecao)', async () => {
    delete process.env.SUPPORT_EMAIL;
    const deps = makeDeps([]);
    await makeListener(deps).handle(event);
    expect(deps.email.sendAlertEmail).not.toHaveBeenCalled();
  });

  it('erro no findMany de rotas -> ainda usa env (fail-safe)', async () => {
    process.env.SUPPORT_EMAIL = 'env@suporte.com';
    const deps = makeDeps([]);
    deps.prisma.supportEmailRoute.findMany.mockRejectedValue(new Error('DB timeout'));
    await makeListener(deps).handle(event);
    expect(deps.email.sendAlertEmail).toHaveBeenCalledWith(
      'env@suporte.com',
      expect.any(String),
      expect.any(String),
      't1',
    );
  });

  it('chamado sem categoria usa rota padrao', async () => {
    delete process.env.SUPPORT_EMAIL;
    const deps = makeDeps(
      [{ category: null, email: 'padrao@empresa.com.br' }],
      { ticketCategory: null },
    );
    await makeListener(deps).handle(event);
    expect(deps.email.sendAlertEmail).toHaveBeenCalledWith(
      'padrao@empresa.com.br',
      expect.any(String),
      expect.any(String),
      't1',
    );
  });

  // ── ADR 034 (2026-07-20): WhatsApp do suporte + deep link ──────────────────

  describe('SUPPORT_WHATSAPP + deep link', () => {
    afterEach(() => {
      delete process.env.SUPPORT_WHATSAPP;
      delete process.env.NEXA_APP_URL;
    });

    it('com SUPPORT_WHATSAPP → envia WhatsApp com deep link /inbox?c=<id>', async () => {
      process.env.SUPPORT_EMAIL = 'env@suporte.com';
      process.env.SUPPORT_WHATSAPP = '5511955554444';
      process.env.NEXA_APP_URL = 'https://painel.exemplo.com.br';
      const deps = makeDeps([]);
      await makeListener(deps).handle(event);

      expect(deps.waha.sendText).toHaveBeenCalledOnce();
      const [to, msg] = deps.waha.sendText.mock.calls[0];
      expect(to).toBe('5511955554444');
      expect(msg).toContain('Chamado #42');
      expect(msg).toContain('https://painel.exemplo.com.br/inbox?c=conv-1');
    });

    it('sem SUPPORT_WHATSAPP → só e-mail, nenhum WhatsApp', async () => {
      process.env.SUPPORT_EMAIL = 'env@suporte.com';
      const deps = makeDeps([]);
      await makeListener(deps).handle(event);
      expect(deps.email.sendAlertEmail).toHaveBeenCalledOnce();
      expect(deps.waha.sendText).not.toHaveBeenCalled();
    });

    it('e-mail usa o mesmo deep link novo (/inbox?c=) — formato antigo /inbox/<id> não casava rota', async () => {
      process.env.SUPPORT_EMAIL = 'env@suporte.com';
      process.env.NEXA_APP_URL = 'https://painel.exemplo.com.br';
      const deps = makeDeps([]);
      await makeListener(deps).handle(event);
      const [, , text] = deps.email.sendAlertEmail.mock.calls[0];
      expect(text).toContain('https://painel.exemplo.com.br/inbox?c=conv-1');
      expect(text).not.toContain('/inbox/conv-1');
    });

    it('falha do WAHA não derruba o fluxo (fire-and-forget)', async () => {
      process.env.SUPPORT_EMAIL = 'env@suporte.com';
      process.env.SUPPORT_WHATSAPP = '5511955554444';
      const deps = makeDeps([]);
      deps.waha.sendText.mockResolvedValue({ sent: false, reason: 'waha_down' });
      await expect(makeListener(deps).handle(event)).resolves.toBeUndefined();
    });
  });
});
