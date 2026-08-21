import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailCampaignSenderService } from './email-campaign-sender.service';

// ─── Filtros da campanha de E-MAIL (2026-08-01, paridade com WhatsApp) ───────
// blocked (blocklist manual) · suspeito_concorrente (nome OU domínio do
// e-mail) · ja_enviado (dedup entre campanhas). Todos visíveis no relatório.

function makeSvc(overrides: {
  excludedContacts?: any[];
  priorSent?: any[];
} = {}) {
  const prisma = {
    contact: {
      findMany: vi.fn().mockResolvedValue(overrides.excludedContacts ?? []),
    },
    campaignTarget: {
      findMany: vi.fn().mockResolvedValue(overrides.priorSent ?? []),
    },
    campaign: {
      create: vi.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'camp-email', ...data, _count: { targets: data.targets?.create?.length ?? 0 } })),
    },
  } as any;
  const svc = new EmailCampaignSenderService(
    prisma,
    {} as any, // EmailReplyService
    { acquire: async () => async () => {} } as any, // RedisLockService
    {} as any, // ConversationsService (não usado na criação)
    // Registro LGPD vazio e TMS sem clientes — o neutro destes testes de filtro
    { blockedEmails: async () => new Set<string>(), isBlocked: async () => false } as any,
    { clientesPorEmailVerificado: async () => ({ clientes: new Set<string>(), falhou: false }) } as any,
  );
  return { svc, prisma };
}

const DTO = (emails: { email: string; name?: string }[]) => ({
  name: 'Email Lote', subject: 'Novidades pra sua operacao', template: 'Ola {{nome}}', emails,
});

describe('EmailCampaignSenderService.createEmailCampaign — filtros', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('contato blocked → skipped/bloqueado, fora da fila', async () => {
    const { svc, prisma } = makeSvc({
      excludedContacts: [{ email: 'concorrente@x.com', status: 'blocked' }],
    });
    const r: any = await svc.createEmailCampaign('t1', DTO([
      { email: 'concorrente@x.com' }, { email: 'lead@transportadora.com.br' },
    ]));
    expect(r.skippedBlocked).toBe(1);
    expect(r.included).toBe(1);
    const created = prisma.campaign.create.mock.calls[0][0].data.targets.create;
    expect(created.find((t: any) => t.email === 'concorrente@x.com'))
      .toMatchObject({ status: 'skipped', error: 'bloqueado' });
  });

  it('domínio de concorrente (@bsoft.com.br) → skipped/suspeito_concorrente', async () => {
    const { svc, prisma } = makeSvc();
    const r: any = await svc.createEmailCampaign('t1', DTO([
      { email: 'joao@bsoft.com.br', name: 'Joao' },
      { email: 'lead@gmail.com', name: 'Equipe SSW Sistemas' }, // nome também barra
      { email: 'ana@transportadorasilva.com.br', name: 'Ana' },
    ]));
    expect(r.skippedSuspect).toBe(2);
    expect(r.included).toBe(1);
    const created = prisma.campaign.create.mock.calls[0][0].data.targets.create;
    expect(created.find((t: any) => t.email === 'joao@bsoft.com.br'))
      .toMatchObject({ status: 'skipped', error: 'suspeito_concorrente' });
  });

  it('e-mail com sent em campanha anterior → skipped/ja_enviado', async () => {
    const { svc } = makeSvc({ priorSent: [{ email: 'repetido@empresa.com.br' }] });
    const r: any = await svc.createEmailCampaign('t1', DTO([
      { email: 'repetido@empresa.com.br' }, { email: 'novo@empresa2.com.br' },
    ]));
    expect(r.skippedAlreadySent).toBe(1);
    expect(r.included).toBe(1);
  });

  it('opted_out continua com motivo próprio (LGPD ≠ blocklist)', async () => {
    const { svc } = makeSvc({
      excludedContacts: [{ email: 'saiu@x.com', status: 'opted_out' }],
    });
    const r: any = await svc.createEmailCampaign('t1', DTO([
      { email: 'saiu@x.com' }, { email: 'fica@y.com' },
    ]));
    expect(r.skippedOptOut).toBe(1);
    expect(r.skippedBlocked).toBe(0);
    expect(r.included).toBe(1);
  });

  it('lista limpa → nada pulado', async () => {
    const { svc } = makeSvc();
    const r: any = await svc.createEmailCampaign('t1', DTO([
      { email: 'a@transportadora1.com.br' }, { email: 'b@transportadora2.com.br' },
    ]));
    expect(r.included).toBe(2);
    expect(r.skippedBlocked + r.skippedSuspect + r.skippedAlreadySent + r.skippedOptOut).toBe(0);
  });
});
