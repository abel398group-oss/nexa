import { describe, it, expect, vi } from 'vitest';
import { EmailCampaignSenderService } from './email-campaign-sender.service';

/**
 * Pré-visualização de "Contatos com e-mail".
 *
 * A tela dizia apenas "disparado para todos os contatos ativos com e-mail" e o
 * operador criava a campanha sem ver quem, nem quantos.
 *
 * O risco de um preview é DIVERGIR do envio — aí ele é pior que não existir, porque
 * dá confiança errada. Por isso o `where` é um só (`audienciaWhere`), usado pelos
 * dois caminhos, e estes testes existem para quebrar se alguém alterar um lado só.
 */

function makeSvc(contacts: any[] = [], total = contacts.length) {
  const prisma = {
    contact: {
      findMany: vi.fn().mockResolvedValue(contacts),
      count: vi.fn().mockResolvedValue(total),
    },
  };
  const svc = new EmailCampaignSenderService(
    prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
  );
  return { svc, prisma };
}

describe('audienciaWhere — critério único do público de e-mail', () => {
  // toMatchObject e não toEqual: o critério pode GANHAR exclusões (foi o que
  // aconteceu com o hard bounce). O que o teste protege é que estas continuem lá,
  // não que a lista nunca cresça.
  it('ativo, com e-mail, e e-mail não vazio', () => {
    expect(EmailCampaignSenderService.audienciaWhere('t1')).toMatchObject({
      tenantId: 't1',
      status: 'active',
      email: { not: null },
      NOT: { email: '' },
    });
  });

  // Endereço que já devolveu hard bounce não existe mais. Continuar mandando para ele
  // é o que mais rápido derruba a reputação do domínio.
  it('exclui quem já deu hard bounce', () => {
    expect(EmailCampaignSenderService.audienciaWhere('t1')).toMatchObject({ emailBouncedAt: null });
  });

  // Sem isto, um contato com email='' apareceria no preview e sumiria no envio
  // (o disparo filtra por valor verdadeiro) — a tela prometeria mais do que entrega.
  it('exclui e-mail em branco, não só nulo', () => {
    expect(EmailCampaignSenderService.audienciaWhere('t1').NOT).toEqual({ email: '' });
  });

  it('sempre preso ao tenant', () => {
    expect(EmailCampaignSenderService.audienciaWhere('outro').tenantId).toBe('outro');
  });
});

describe('previewAudienciaEmail', () => {
  it('usa exatamente o where do disparo quando não há busca', async () => {
    const { svc, prisma } = makeSvc([{ id: 'c1', name: 'João', email: 'j@x.com', company: null, createdAt: new Date() }]);

    await svc.previewAudienciaEmail('t1');

    expect(prisma.contact.findMany.mock.calls[0][0].where)
      .toEqual(EmailCampaignSenderService.audienciaWhere('t1'));
  });

  it('mostra os mais recentes primeiro (é a pergunta: quem entrou agora)', async () => {
    const { svc, prisma } = makeSvc();
    await svc.previewAudienciaEmail('t1');
    expect(prisma.contact.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('a busca filtra nome, e-mail e empresa — sem soltar o critério base', async () => {
    const { svc, prisma } = makeSvc();

    await svc.previewAudienciaEmail('t1', { search: '  hipervias ' });

    const where = prisma.contact.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('active');       // critério base intacto
    expect(where.email).toEqual({ not: null });
    expect(where.OR).toHaveLength(3);
    expect(JSON.stringify(where.OR)).toContain('hipervias'); // já aparado
  });

  // O operador busca "joão", vê 1 resultado e precisa saber que o disparo continua
  // indo para os 200. Confundir os dois números levaria a disparar achando que são 1.
  it('com busca, separa o total da busca do total que vai receber', async () => {
    const prisma = {
      contact: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(200),
      },
    };
    const svc = new EmailCampaignSenderService(
      prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );

    const r = await svc.previewAudienciaEmail('t1', { search: 'joão' });

    expect(r.total).toBe(1);
    expect(r.totalAudiencia).toBe(200);
  });

  it('sem busca os dois totais são o mesmo (uma consulta a menos)', async () => {
    const { svc, prisma } = makeSvc([], 42);

    const r = await svc.previewAudienciaEmail('t1');

    expect(r.total).toBe(42);
    expect(r.totalAudiencia).toBe(42);
    expect(prisma.contact.count).toHaveBeenCalledTimes(1);
  });

  it('limite tem teto — a tela não pode pedir a base inteira', async () => {
    const { svc, prisma } = makeSvc();
    await svc.previewAudienciaEmail('t1', { limit: 5000 });
    expect(prisma.contact.findMany.mock.calls[0][0].take).toBe(200);
  });
});
