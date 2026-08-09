import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailDeliverabilityWatchService } from './email-deliverability-watch.service';

/**
 * O disparo tinha todas as travas de RITMO e nenhuma de RESULTADO: ninguém olhava
 * a taxa de devolução. A resposta para "estamos queimando o domínio?" só chegaria
 * pelo pior caminho — os e-mails pararem de ser entregues, sem aviso.
 *
 * Os limiares não são nossos: 2% de devolução é onde Gmail/Outlook começam a
 * desconfiar, 5% é lista suja, e o Google exige reclamação de spam abaixo de 0,10%.
 */

function makeSvc(nums: { enviados: number; devolvidos: number; descadastros: number }) {
  const prisma = {
    campaignTarget: {
      count: vi.fn()
        .mockResolvedValueOnce(nums.enviados)
        .mockResolvedValueOnce(nums.devolvidos),
    },
    contact: { count: vi.fn().mockResolvedValue(nums.descadastros) },
  } as any;
  const adminAlert = { notifyAdmin: vi.fn().mockResolvedValue({ whatsapp: true, email: true }) };
  const svc = new EmailDeliverabilityWatchService(prisma, adminAlert as any);
  return { svc, prisma, adminAlert };
}

afterEach(() => {
  delete process.env.EMAIL_DELIVERABILITY_WATCH;
  delete process.env.EMAIL_DELIVERABILITY_MIN_SAMPLE;
});

describe('snapshot — as contas', () => {
  it('devolução é sobre tudo que saiu (entregue + devolvido)', async () => {
    const { svc } = makeSvc({ enviados: 96, devolvidos: 4, descadastros: 0 });
    const s = await svc.snapshot();
    expect(s.bouncePct).toBe(4);
  });

  it('2% já é amarelo', async () => {
    const { svc } = makeSvc({ enviados: 98, devolvidos: 2, descadastros: 0 });
    expect((await svc.snapshot()).nivel).toBe('amarelo');
  });

  it('5% é vermelho', async () => {
    const { svc } = makeSvc({ enviados: 95, devolvidos: 5, descadastros: 0 });
    expect((await svc.snapshot()).nivel).toBe('vermelho');
  });

  it('abaixo do limiar fica verde', async () => {
    const { svc } = makeSvc({ enviados: 100, devolvidos: 1, descadastros: 0 });
    expect((await svc.snapshot()).nivel).toBe('verde');
  });

  it('descadastro alto também acende o amarelo', async () => {
    const { svc } = makeSvc({ enviados: 100, devolvidos: 0, descadastros: 3 });
    const s = await svc.snapshot();
    expect(s.optOutPct).toBe(3);
    expect(s.nivel).toBe('amarelo');
  });

  // Sem isto, o primeiro e-mail da vida que devolvesse daria "100% de devolução" e
  // um alerta vermelho. Alerta que dispara à toa deixa de ser lido.
  it('amostra pequena não conclui nada', async () => {
    const { svc } = makeSvc({ enviados: 1, devolvidos: 1, descadastros: 0 });
    const s = await svc.snapshot();
    expect(s.bouncePct).toBe(50);
    expect(s.nivel).toBe('verde');
  });

  it('sem envio nenhum não divide por zero', async () => {
    const { svc } = makeSvc({ enviados: 0, devolvidos: 0, descadastros: 0 });
    const s = await svc.snapshot();
    expect(s.bouncePct).toBe(0);
    expect(s.nivel).toBe('verde');
  });

  // Falha de SMTP na saída também vira `failed`, mas não é problema de reputação —
  // por isso o filtro é pelo motivo, não só pelo status.
  it('conta como devolução só o que veio de DSN', async () => {
    const { svc, prisma } = makeSvc({ enviados: 50, devolvidos: 2, descadastros: 0 });
    await svc.snapshot();
    expect(prisma.campaignTarget.count.mock.calls[1][0].where.error).toEqual({ startsWith: 'bounce ' });
  });

  it('olha só campanha de e-mail', async () => {
    const { svc, prisma } = makeSvc({ enviados: 50, devolvidos: 0, descadastros: 0 });
    await svc.snapshot();
    expect(prisma.campaignTarget.count.mock.calls[0][0].where.campaign).toEqual({ channel: 'email' });
  });
});

describe('tick — aviso ao admin', () => {
  it('verde não avisa', async () => {
    const { svc, adminAlert } = makeSvc({ enviados: 100, devolvidos: 0, descadastros: 0 });
    await svc.tick();
    expect(adminAlert.notifyAdmin).not.toHaveBeenCalled();
  });

  it('vermelho avisa e manda pausar', async () => {
    const { svc, adminAlert } = makeSvc({ enviados: 90, devolvidos: 10, descadastros: 0 });
    await svc.tick();
    const corpo = adminAlert.notifyAdmin.mock.calls[0][1];
    expect(corpo).toContain('CRÍTICO');
    expect(corpo).toMatch(/pause/i);
  });

  it('amarelo avisa sem mandar pausar', async () => {
    const { svc, adminAlert } = makeSvc({ enviados: 97, devolvidos: 3, descadastros: 0 });
    await svc.tick();
    const corpo = adminAlert.notifyAdmin.mock.calls[0][1];
    expect(corpo).toContain('Atenção');
    expect(corpo).not.toMatch(/pause/i);
  });

  // Alerta repetido de hora em hora vira ruído, e ruído esconde o alerta seguinte.
  it('avisa uma vez por dia por métrica', async () => {
    const prisma = {
      campaignTarget: { count: vi.fn().mockImplementation(({ where }: any) => (where.status === 'sent' ? 90 : 10)) },
      contact: { count: vi.fn().mockResolvedValue(0) },
    } as any;
    const adminAlert = { notifyAdmin: vi.fn().mockResolvedValue({ whatsapp: true, email: false }) };
    const svc = new EmailDeliverabilityWatchService(prisma, adminAlert as any);

    await svc.tick();
    await svc.tick();

    expect(adminAlert.notifyAdmin).toHaveBeenCalledTimes(1);
  });

  it('desligado pelo env não faz nada', async () => {
    process.env.EMAIL_DELIVERABILITY_WATCH = 'false';
    const { svc, prisma } = makeSvc({ enviados: 90, devolvidos: 10, descadastros: 0 });
    await svc.tick();
    expect(prisma.campaignTarget.count).not.toHaveBeenCalled();
  });

  // O termômetro não pode derrubar o processo do backend por causa de uma consulta.
  it('erro na consulta não propaga', async () => {
    const prisma = {
      campaignTarget: { count: vi.fn().mockRejectedValue(new Error('db fora')) },
      contact: { count: vi.fn().mockResolvedValue(0) },
    } as any;
    const svc = new EmailDeliverabilityWatchService(prisma, { notifyAdmin: vi.fn() } as any);

    await expect(svc.tick()).resolves.toBeUndefined();
  });
});
