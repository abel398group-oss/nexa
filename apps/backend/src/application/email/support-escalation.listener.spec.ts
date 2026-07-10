import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupportEscalationListener } from './support-escalation.listener';

// ─── SupportEscalationListener — resolução do destinatário ───────────────────
// Cobre os 3 cenários de resolução do destinatário:
//   1. tenant.supportEmail configurado  → usa o valor do DB
//   2. tenant.supportEmail null         → fallback para SUPPORT_EMAIL env
//   3. Nenhum configurado               → loga debug e não envia

function makeDeps(tenantSupportEmail: string | null = null) {
  const prisma = {
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ supportEmail: tenantSupportEmail }),
    },
    aiConversation: {
      findUnique: vi.fn().mockResolvedValue({
        ticketNumber: 42,
        subject: 'CT-e rejeitado',
        ticketCategory: 'fiscal',
        ticketPriority: 'alta',
        phone: '5511999999999',
        contactId: 'contact-1',
      }),
    },
    contact: {
      findUnique: vi.fn().mockResolvedValue({ name: 'João Silva' }),
    },
  } as any;

  const email = {
    sendAlertEmail: vi.fn().mockResolvedValue(undefined),
  } as any;

  return { prisma, email };
}

function makeListener(deps: ReturnType<typeof makeDeps>) {
  return new SupportEscalationListener(deps.prisma, deps.email);
}

const event = { tenantId: 't1', conversationId: 'conv-1', origin: 'portal' as const };

describe('SupportEscalationListener — resolução do e-mail de destino', () => {
  const origEnv = process.env.SUPPORT_EMAIL;

  afterEach(() => {
    process.env.SUPPORT_EMAIL = origEnv;
  });

  it('cenário 1: usa tenant.supportEmail quando configurado (ignora env)', async () => {
    delete process.env.SUPPORT_EMAIL; // garante que env não interfere
    const deps = makeDeps('suporte@cliente.com.br');
    const listener = makeListener(deps);

    await listener.handle(event);

    expect(deps.email.sendAlertEmail).toHaveBeenCalledWith(
      'suporte@cliente.com.br',
      expect.any(String),
      expect.any(String),
      't1',
    );
  });

  it('cenário 1b: tenant.supportEmail tem prioridade sobre SUPPORT_EMAIL env', async () => {
    process.env.SUPPORT_EMAIL = 'env@suporte.com';
    const deps = makeDeps('tenant@especifico.com.br');
    const listener = makeListener(deps);

    await listener.handle(event);

    expect(deps.email.sendAlertEmail).toHaveBeenCalledWith(
      'tenant@especifico.com.br',
      expect.any(String),
      expect.any(String),
      't1',
    );
    expect(deps.email.sendAlertEmail).not.toHaveBeenCalledWith(
      'env@suporte.com',
      expect.any(String),
      expect.any(String),
      expect.any(String),
    );
  });

  it('cenário 2: fallback para SUPPORT_EMAIL env quando tenant não tem e-mail', async () => {
    process.env.SUPPORT_EMAIL = 'fallback@env.com';
    const deps = makeDeps(null); // tenant sem supportEmail
    const listener = makeListener(deps);

    await listener.handle(event);

    expect(deps.email.sendAlertEmail).toHaveBeenCalledWith(
      'fallback@env.com',
      expect.any(String),
      expect.any(String),
      't1',
    );
  });

  it('cenário 3: nenhum configurado → não envia e-mail (sem exceção)', async () => {
    delete process.env.SUPPORT_EMAIL;
    const deps = makeDeps(null);
    const listener = makeListener(deps);

    await listener.handle(event);

    expect(deps.email.sendAlertEmail).not.toHaveBeenCalled();
  });

  it('cenário 3b: string vazia no tenant equivale a não configurado → cai no env', async () => {
    process.env.SUPPORT_EMAIL = 'env@suporte.com';
    const deps = makeDeps(''); // string vazia deve ser tratada como null
    const listener = makeListener(deps);

    await listener.handle(event);

    expect(deps.email.sendAlertEmail).toHaveBeenCalledWith(
      'env@suporte.com',
      expect.any(String),
      expect.any(String),
      't1',
    );
  });

  it('falha no findUnique do tenant não impede o e-mail via env', async () => {
    process.env.SUPPORT_EMAIL = 'env@suporte.com';
    const deps = makeDeps(null);
    deps.prisma.tenant.findUnique.mockRejectedValue(new Error('DB timeout'));
    const listener = makeListener(deps);

    await listener.handle(event);

    // catch() no findUnique retorna null → cai no env
    expect(deps.email.sendAlertEmail).toHaveBeenCalledWith(
      'env@suporte.com',
      expect.any(String),
      expect.any(String),
      't1',
    );
  });
});
