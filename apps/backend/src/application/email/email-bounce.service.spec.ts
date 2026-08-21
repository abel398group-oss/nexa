import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailBounceService } from './email-bounce.service';

function makeDeps() {
  const prisma = {
    campaignTarget: {
      findFirst: vi.fn().mockResolvedValue({ id: 'alvo-1', campaignId: 'camp-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    contact: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: 'stub-1' }),
    },
  } as any;
  return { prisma };
}

// DSN real do Google para endereço inexistente (formato RFC 3464)
const DSN_GOOGLE = [
  'From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
  'To: lia@hipertms.com.br',
  'Subject: Delivery Status Notification (Failure)',
  'Content-Type: multipart/report; report-type=delivery-status; boundary="000000000000abc"',
  '',
  '--000000000000abc',
  'Content-Type: message/delivery-status',
  '',
  'Reporting-MTA: dns; googlemail.com',
  'Final-Recipient: rfc822; nao-existe@gmail.com',
  'Action: failed',
  'Status: 5.1.1',
  'Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.',
  '--000000000000abc--',
].join('\r\n');

const DSN_TEMPORARIO = DSN_GOOGLE
  .replace('Status: 5.1.1', 'Status: 4.2.2')
  .replace('550-5.1.1 The email account that you tried to reach does not exist.', '452-4.2.2 The recipient mailbox is over quota.');

describe('EmailBounceService — classificação', () => {
  let svc: EmailBounceService;
  beforeEach(() => { svc = new EmailBounceService(makeDeps().prisma); });

  it('reconhece DSN formal por multipart/report', () => {
    expect(svc.classify({ from: 'x@y.com', subject: 'qualquer', raw: DSN_GOOGLE })).toBe('bounce');
  });

  it('reconhece mailer-daemon e postmaster pelo remetente', () => {
    for (const de of ['Mail Delivery <mailer-daemon@googlemail.com>', 'postmaster@hipertms.com.br', 'MAILER-DAEMON@x.com']) {
      expect(svc.classify({ from: de, subject: 'oi', raw: 'corpo' })).toBe('bounce');
    }
  });

  it('reconhece devolução sem relatório formal pelo assunto', () => {
    expect(svc.classify({ from: 'algo@x.com', subject: 'Undelivered Mail Returned to Sender', raw: 'c' })).toBe('bounce');
    expect(svc.classify({ from: 'algo@x.com', subject: 'Mail delivery failed: returning message', raw: 'c' })).toBe('bounce');
  });

  it('reconhece resposta automática de ausência', () => {
    const raw = 'From: cliente@empresa.com\r\nAuto-Submitted: auto-replied\r\nSubject: Estou de férias\r\n\r\nvolto dia 20';
    expect(svc.classify({ from: 'cliente@empresa.com', subject: 'Estou de férias', raw })).toBe('auto_reply');
  });

  it('mensagem de pessoa continua sendo tratada como pessoa', () => {
    const raw = 'From: uelder@empresa.com\r\nSubject: Re: HiperTMS\r\n\r\nOi, gostaria de saber mais';
    expect(svc.classify({ from: 'uelder@empresa.com', subject: 'Re: HiperTMS', raw })).toBe('human');
  });

  // O caso que mais importa: "quero cancelar" não é devolução. Se um heurístico
  // ficar agressivo demais, mensagem de cliente para de chegar no Inbox.
  it('não confunde reclamação de cliente com devolução', () => {
    const raw = 'From: cliente@empresa.com\r\nSubject: nao quero mais receber\r\n\r\npara de mandar email';
    expect(svc.classify({ from: 'cliente@empresa.com', subject: 'nao quero mais receber', raw })).toBe('human');
  });
});

describe('EmailBounceService — extração', () => {
  let svc: EmailBounceService;
  beforeEach(() => { svc = new EmailBounceService(makeDeps().prisma); });

  it('extrai destinatário, status e diagnóstico do DSN', () => {
    const info = svc.parse(DSN_GOOGLE);
    expect(info.recipient).toBe('nao-existe@gmail.com');
    expect(info.status).toBe('5.1.1');
    expect(info.diagnostic).toContain('does not exist');
    expect(info.permanent).toBe(true);
  });

  it('4.x.x é temporário', () => {
    const info = svc.parse(DSN_TEMPORARIO);
    expect(info.status).toBe('4.2.2');
    expect(info.permanent).toBe(false);
  });

  it('sem campo Status usa o código SMTP solto', () => {
    const info = svc.parse('Final-Recipient: rfc822; x@gmail.com\r\nbla 550-5.7.1 blocked bla');
    expect(info.permanent).toBe(true);
  });

  it('não inventa destinatário quando o relatório não traz um', () => {
    expect(svc.parse('Status: 5.1.1\r\nsem recipient').recipient).toBeNull();
  });
});

describe('EmailBounceService — registro no alvo de campanha', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: EmailBounceService;
  beforeEach(() => { deps = makeDeps(); svc = new EmailBounceService(deps.prisma); });

  it('devolução definitiva marca o alvo como failed com o motivo real', async () => {
    await svc.record('t1', svc.parse(DSN_GOOGLE));

    expect(deps.prisma.campaignTarget.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 't1',
          email: { equals: 'nao-existe@gmail.com', mode: 'insensitive' },
          status: 'sent',
        },
      }),
    );
    const dados = deps.prisma.campaignTarget.update.mock.calls[0][0].data;
    expect(dados.status).toBe('failed');
    expect(dados.error).toContain('5.1.1');
    expect(dados.error).toContain('does not exist');
  });

  it('devolução TEMPORÁRIA não mexe no alvo — o servidor ainda vai retentar', async () => {
    await svc.record('t1', svc.parse(DSN_TEMPORARIO));
    expect(despachou(deps)).toBe(false);
  });

  it('sem destinatário identificável não marca nada', async () => {
    await svc.record('t1', { recipient: null, status: '5.1.1', diagnostic: 'x', permanent: true });
    expect(deps.prisma.campaignTarget.findFirst).not.toHaveBeenCalled();
  });

  it('endereço sem alvo de campanha não quebra (pode ter sido resposta de conversa)', async () => {
    deps.prisma.campaignTarget.findFirst.mockResolvedValue(null);
    await svc.record('t1', svc.parse(DSN_GOOGLE));
    expect(deps.prisma.campaignTarget.update).not.toHaveBeenCalled();
  });
});

/**
 * A parte que faltava e que custa reputação: sem marcar o CONTATO, o endereço morto
 * voltava na campanha seguinte. O dedup entre campanhas só pula quem tem alvo
 * `sent`, e a devolução transforma o alvo em `failed` — ou seja, a proteção que
 * parecia existir empurrava o endereço de volta para a fila.
 */
describe('EmailBounceService — bloqueio do contato (protege a reputação do domínio)', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: EmailBounceService;
  beforeEach(() => { deps = makeDeps(); svc = new EmailBounceService(deps.prisma); });

  it('devolução definitiva marca emailBouncedAt no contato', async () => {
    await svc.record('t1', svc.parse(DSN_GOOGLE));

    expect(deps.prisma.contact.updateMany).toHaveBeenCalledTimes(1);
    const chamada = deps.prisma.contact.updateMany.mock.calls[0][0];
    expect(chamada.where).toEqual({
      tenantId: 't1',
      email: { equals: 'nao-existe@gmail.com', mode: 'insensitive' },
    });
    expect(chamada.data.emailBouncedAt).toBeInstanceOf(Date);
    expect(chamada.data.emailBounceReason).toContain('5.1.1');
  });

  // O relatório devolve o endereço na caixa em que o servidor remoto o escreveu.
  it('acha o contato mesmo com caixa diferente da do relatório', async () => {
    await svc.record('t1', { recipient: 'Joao@Empresa.com', status: '5.1.1', diagnostic: 'x', permanent: true });
    expect(deps.prisma.contact.updateMany.mock.calls[0][0].where.email.mode).toBe('insensitive');
  });

  it('devolução TEMPORÁRIA não bloqueia o contato', async () => {
    await svc.record('t1', svc.parse(DSN_TEMPORARIO));
    expect(deps.prisma.contact.updateMany).not.toHaveBeenCalled();
  });

  // A devolução pode vir de uma resposta de conversa, não de campanha. O endereço
  // está morto do mesmo jeito — bloquear não pode depender de achar o alvo.
  it('bloqueia o contato mesmo sem alvo de campanha correspondente', async () => {
    deps.prisma.campaignTarget.findFirst.mockResolvedValue(null);
    await svc.record('t1', svc.parse(DSN_GOOGLE));
    expect(deps.prisma.contact.updateMany).toHaveBeenCalledTimes(1);
  });

  // Falhar em bloquear não pode impedir o alvo de ser marcado — são dois registros
  // independentes, e perder os dois por causa de um é pior.
  it('erro ao bloquear o contato não impede a marcação do alvo', async () => {
    deps.prisma.contact.updateMany.mockRejectedValue(new Error('db fora'));
    await svc.record('t1', svc.parse(DSN_GOOGLE));
    expect(deps.prisma.campaignTarget.update).toHaveBeenCalledTimes(1);
  });
});

/**
 * O elo que fechava o loop de bounce (21/08/2026): endereço morto SEM contato
 * correspondente não tinha onde guardar o veredito — voltava elegível na próxima
 * planilha e gerava outro hard bounce a cada reimportação.
 */
describe('EmailBounceService — endereço sem contato ganha um registro com o veredito', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: EmailBounceService;
  beforeEach(() => { deps = makeDeps(); svc = new EmailBounceService(deps.prisma); });

  it('sem contato: cria o stub já marcado como bounced', async () => {
    deps.prisma.contact.updateMany.mockResolvedValue({ count: 0 });

    await svc.record('t1', svc.parse(DSN_GOOGLE));

    const { data } = deps.prisma.contact.create.mock.calls[0][0];
    expect(data).toMatchObject({
      tenantId: 't1',
      email: 'nao-existe@gmail.com',
      phone: 'email:nao-existe@gmail.com',
      source: 'bounce',
    });
    expect(data.emailBouncedAt).toBeInstanceOf(Date);
    expect(data.emailBounceReason).toContain('5.1.1');
  });

  it('com contato existente NÃO cria stub', async () => {
    await svc.record('t1', svc.parse(DSN_GOOGLE));
    expect(deps.prisma.contact.create).not.toHaveBeenCalled();
  });

  it('falha ao criar o stub não impede a marcação do alvo', async () => {
    deps.prisma.contact.updateMany.mockResolvedValue({ count: 0 });
    deps.prisma.contact.create.mockRejectedValue(new Error('unique quebrou'));

    await svc.record('t1', svc.parse(DSN_GOOGLE));

    expect(deps.prisma.campaignTarget.update).toHaveBeenCalledTimes(1);
  });

  // O fallback de IMAP por .env roda com tenant "default", que não existe na
  // tabela de contatos — toda devolução marcava zero contatos e o painel exibia
  // 0% de bounce eterno. Só nesse caso a busca abre mão do filtro de tenant.
  it('tenant "default" (fallback de .env) procura o endereço sem filtro de tenant', async () => {
    deps.prisma.contact.updateMany
      .mockResolvedValueOnce({ count: 0 })  // com tenant 'default': nada
      .mockResolvedValueOnce({ count: 2 }); // sem tenant: achou os donos reais

    await svc.record('default', svc.parse(DSN_GOOGLE));

    expect(deps.prisma.contact.updateMany).toHaveBeenCalledTimes(2);
    const segunda = deps.prisma.contact.updateMany.mock.calls[1][0];
    expect(segunda.where.tenantId).toBeUndefined();
    expect(deps.prisma.contact.create).not.toHaveBeenCalled();
  });

  it('tenant REAL nunca abre a busca para outros tenants', async () => {
    deps.prisma.contact.updateMany.mockResolvedValue({ count: 0 });

    await svc.record('t1', svc.parse(DSN_GOOGLE));

    expect(deps.prisma.contact.updateMany).toHaveBeenCalledTimes(1);
    expect(deps.prisma.contact.updateMany.mock.calls[0][0].where.tenantId).toBe('t1');
  });
});

function despachou(deps: ReturnType<typeof makeDeps>): boolean {
  return deps.prisma.campaignTarget.update.mock.calls.length > 0;
}
