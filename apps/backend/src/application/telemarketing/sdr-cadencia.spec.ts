import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SdrService } from './sdr.service';

/**
 * O vendedor assumiu — o robô cala.
 *
 * A cadência automática só parava quando o LEAD respondia. O SDR ligar, conversar e
 * registrar não parava nada: no dia seguinte o follow-up mandava "passando pra saber
 * se você viu minha mensagem", como se ninguém tivesse falado com ele.
 *
 * Desligar a Lia nunca cobriu isso — `followup.service` não consulta a autonomia.
 */
const OPORTUNIDADE = {
  id: 'op1',
  stage: 'new',
  assignedSellerId: 's1',
  contactId: 'c1',
  productCode: 'hipertms',
  phone: '5511999990001',
};

function montar(over: { phone?: string | null } = {}) {
  const prisma = {
    opportunity: {
      findFirst: vi.fn().mockResolvedValue({ ...OPORTUNIDADE, ...over }),
      update: vi.fn().mockResolvedValue({}),
    },
    sellerActivity: { create: vi.fn().mockResolvedValue({ id: 'a1' }) },
  };
  const marketScope = { mercadosDoUsuario: vi.fn().mockResolvedValue(undefined) };
  const followup = { stopByPhone: vi.fn().mockResolvedValue(1) };
  const svc = new SdrService(prisma as any, marketScope as any, {} as any, followup as any);
  return { svc, prisma, followup };
}

const USER = { role: 'vendedor', sellerId: 's1' };

describe('SdrService.registrarAtividade — pausa da cadência', () => {
  beforeEach(() => vi.clearAllMocks());

  it('para a cadência do telefone quando o SDR registra atividade', async () => {
    const { svc, followup } = montar();

    await svc.registrarAtividade('t1', USER, { opportunityId: 'op1', type: 'call' });

    expect(followup.stopByPhone).toHaveBeenCalledWith(
      't1',
      '5511999990001',
      expect.stringContaining('call'),
    );
  });

  // A atividade é o esforço do vendedor e a base da comissão. Uma falha ao calar o
  // robô não pode custar o registro — o pior caso é um follow-up a mais, não um
  // trabalho perdido.
  it('a atividade é gravada mesmo se parar a cadência falhar', async () => {
    const { svc, prisma, followup } = montar();
    followup.stopByPhone.mockRejectedValue(new Error('redis fora'));

    const r = await svc.registrarAtividade('t1', USER, { opportunityId: 'op1', type: 'call' });

    expect(prisma.sellerActivity.create).toHaveBeenCalled();
    expect(r).toEqual({ id: 'a1' });
  });

  // Lead de e-mail entra sem telefone. Chamar `stopByPhone` com string vazia varreria
  // todas as cadências sem telefone do tenant.
  it('não chama a parada quando a oportunidade não tem telefone', async () => {
    const { svc, followup } = montar({ phone: null });

    await svc.registrarAtividade('t1', USER, { opportunityId: 'op1', type: 'email' });

    expect(followup.stopByPhone).not.toHaveBeenCalled();
  });
});

/**
 * Qualificação — PATCH de verdade.
 *
 * O SDR marca um critério durante a ligação e escreve a observação depois de
 * desligar. Se o segundo salvamento apagasse o primeiro, ele aprenderia a preencher
 * tudo de uma vez — ou a não preencher.
 */
describe('SdrService.qualificar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserva o que já estava gravado ao mudar um campo só', async () => {
    const { svc, prisma } = montar();
    prisma.opportunity.findFirst.mockResolvedValue({
      ...OPORTUNIDADE,
      qualification: { decisor: true, observacao: 'sócio decide junto' },
    });

    await svc.qualificar('t1', USER, 'op1', { temOrcamento: true });

    const gravado = prisma.opportunity.update.mock.calls[0][0].data.qualification;
    expect(gravado).toMatchObject({
      decisor: true,
      observacao: 'sócio decide junto',
      temOrcamento: true,
    });
  });

  it('marcar como false grava false, e não apaga o campo', async () => {
    const { svc, prisma } = montar();
    prisma.opportunity.findFirst.mockResolvedValue({
      ...OPORTUNIDADE,
      qualification: { decisor: true },
    });

    await svc.qualificar('t1', USER, 'op1', { decisor: false });

    expect(prisma.opportunity.update.mock.calls[0][0].data.qualification).toMatchObject({
      decisor: false,
    });
  });

  // Quem avaliou e quando é o que responde "esta qualificação ainda vale?" seis meses
  // depois, e o que distingue o lead avaliado do nunca olhado.
  it('carimba quem avaliou e quando', async () => {
    const { svc, prisma } = montar();

    await svc.qualificar('t1', USER, 'op1', { decisor: true });

    const gravado = prisma.opportunity.update.mock.calls[0][0].data.qualification;
    expect(gravado.avaliadoPor).toBe('s1');
    expect(gravado.avaliadoEm).toEqual(expect.any(String));
  });

  it('a observação é gravada sem espaço sobrando nas pontas', async () => {
    const { svc, prisma } = montar();

    await svc.qualificar('t1', USER, 'op1', { observacao: '  retomar dia 20  ' });

    expect(prisma.opportunity.update.mock.calls[0][0].data.qualification.observacao).toBe(
      'retomar dia 20',
    );
  });
});

describe('SdrService.ajustarScore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('grava o novo score e registra a mudança no histórico', async () => {
    const { svc, prisma } = montar();

    await svc.ajustarScore('t1', USER, 'op1', 80);

    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { interestScore: 80 } }),
    );
    // O de-para no texto é o que permite depois comparar a calibragem humana com a
    // da IA. Sem ele o número muda e ninguém sabe quem mexeu.
    expect(prisma.sellerActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: expect.stringContaining('para 80') }),
      }),
    );
  });

  // Fora da faixa estragaria em silêncio toda ordenação de fila e o corte de lead
  // quente. A borda valida, e o service valida de novo — regra que sustenta
  // ordenação não fica só no DTO.
  it('recusa score fora de 0..100', async () => {
    const { svc, prisma } = montar();

    await expect(svc.ajustarScore('t1', USER, 'op1', 250)).rejects.toThrow();
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it('score igual ao atual não escreve nada', async () => {
    const { svc, prisma } = montar();
    prisma.opportunity.findFirst.mockResolvedValue({ ...OPORTUNIDADE, interestScore: 40 });

    await svc.ajustarScore('t1', USER, 'op1', 40);

    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });
});
