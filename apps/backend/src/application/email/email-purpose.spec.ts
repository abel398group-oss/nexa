import { describe, it, expect, vi } from 'vitest';
import { EmailReplyService } from './email-reply.service';

/**
 * Separação de reputação: prospecção fria × e-mail transacional.
 *
 * Os dois saíam do mesmo remetente. Uma denúncia de spam vinda do cold mail derrubava a
 * entrega da redefinição de senha e do alerta do Monitor — e são esses que não podem
 * falhar: quem não recebe o link de senha não entra no sistema.
 *
 * O que estes testes guardam, além da escolha certa, é a REGRA DE FALHA: a preferência
 * nunca vira filtro. Um tenant com uma caixa só precisa continuar enviando as duas
 * coisas, senão a separação causa o apagão que ela deveria evitar.
 */
function makeSvc(canais: any[]) {
  const prisma = { emailChannel: { findMany: vi.fn().mockResolvedValue(canais) } };
  const crypto = { decrypt: (s: string) => s };
  const svc = new EmailReplyService(prisma as any, {} as any, crypto as any);
  return { svc, prisma };
}

const caixa = (over: any) => ({
  isActive: true, smtpUser: 'u', smtpPass: 'p', smtpHost: 'h', smtpPort: 465,
  smtpSecure: true, fromEmail: 'x@y.z', fromName: 'N', replyTo: null,
  purpose: 'both', isSender: true, ...over,
});

/** Chama o resolveConfig privado pelo caminho de sempre — sem expor método novo. */
const resolver = (svc: any, proposito: string) => svc['resolveConfig']('t1', proposito);

describe('resolveConfig — propósito da caixa', () => {
  it('transacional prefere a caixa transacional', async () => {
    const { svc } = makeSvc([
      caixa({ purpose: 'comercial', fromEmail: 'frio@x.com' }),
      caixa({ purpose: 'transacional', fromEmail: 'sistema@x.com' }),
    ]);
    expect((await resolver(svc, 'transacional'))!.fromEmail).toBe('sistema@x.com');
  });

  it('comercial prefere a caixa comercial', async () => {
    const { svc } = makeSvc([
      caixa({ purpose: 'transacional', fromEmail: 'sistema@x.com' }),
      caixa({ purpose: 'comercial', fromEmail: 'frio@x.com' }),
    ]);
    expect((await resolver(svc, 'comercial'))!.fromEmail).toBe('frio@x.com');
  });

  // A propriedade que torna o deploy seguro: nada muda até alguém cadastrar a segunda.
  it('com UMA caixa `both`, os dois propósitos continuam enviando por ela', async () => {
    const { svc } = makeSvc([caixa({ purpose: 'both', fromEmail: 'unica@x.com' })]);
    expect((await resolver(svc, 'comercial'))!.fromEmail).toBe('unica@x.com');
    expect((await resolver(svc, 'transacional'))!.fromEmail).toBe('unica@x.com');
  });

  it('sem caixa do propósito, cai na `both` antes de desistir', async () => {
    const { svc } = makeSvc([
      caixa({ purpose: 'both', fromEmail: 'geral@x.com' }),
      caixa({ purpose: 'comercial', fromEmail: 'frio@x.com' }),
    ]);
    expect((await resolver(svc, 'transacional'))!.fromEmail).toBe('geral@x.com');
  });

  // Base antiga, antes da coluna existir: `purpose` chega nulo e não pode zerar o envio.
  it('caixa sem propósito nenhum ainda envia — preferência não é filtro', async () => {
    const { svc } = makeSvc([caixa({ purpose: null, fromEmail: 'legado@x.com' })]);
    expect((await resolver(svc, 'transacional'))!.fromEmail).toBe('legado@x.com');
  });
});
