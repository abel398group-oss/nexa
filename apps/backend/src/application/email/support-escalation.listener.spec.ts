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
  return { prisma, email };
}

const makeListener = (deps: ReturnType<typeof makeDeps>) =>
  new SupportEscalationListener(deps.prisma, deps.email);

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
});
