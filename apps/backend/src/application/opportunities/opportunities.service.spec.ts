import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';

function makePrisma() {
  return {
    opportunity: {
      findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(), groupBy: vi.fn(),
    },
    opportunityStageHistory: { create: vi.fn() },
    partner: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  } as any;
}

describe('OpportunitiesService', () => {
  let prisma: any;
  let svc: OpportunitiesService;
  beforeEach(() => { prisma = makePrisma(); svc = new OpportunitiesService(prisma); });

  it('findAll: escopa por tenant + filtro de estagio', async () => {
    prisma.opportunity.findMany.mockResolvedValue([]); prisma.opportunity.count.mockResolvedValue(0);
    await svc.findAll('t1', { limit: 50, offset: 0 } as any, 'qualified');
    const where = prisma.opportunity.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 't1', stage: 'qualified' });
  });

  it('findOne: 404 quando nao e do tenant', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(null);
    await expect(svc.findOne('t1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.opportunity.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'x', tenantId: 't1' });
  });

  it('moveStage: estagio invalido -> BadRequest', async () => {
    await expect(svc.moveStage('t1', 'o1', 'banana')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moveStage: mesmo estagio -> no-op (sem historico)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', stage: 'new', stageHistory: [] });
    const out = await svc.moveStage('t1', 'o1', 'new');
    expect(out).toMatchObject({ id: 'o1', stage: 'new' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('moveStage: muda estagio -> atualiza + grava historico (de->para)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', stage: 'new', stageHistory: [] });
    prisma.$transaction.mockResolvedValue([{ id: 'o1', stage: 'qualified' }, {}]);
    const out = await svc.moveStage('t1', 'o1', 'qualified', 'cliente respondeu');
    expect(out).toMatchObject({ stage: 'qualified' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('createFromLead: idempotente por conversationId (nao duplica)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'existente', conversationId: 'c1' });
    const out = await svc.createFromLead('t1', { conversationId: 'c1', phone: '5511' });
    expect(out).toMatchObject({ id: 'existente' });
    expect(prisma.opportunity.create).not.toHaveBeenCalled();
  });

  it('createFromLead: cria quando nao existe', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(null);
    prisma.opportunity.create.mockResolvedValue({ id: 'nova', stage: 'new' });
    const out = await svc.createFromLead('t1', { conversationId: 'c2', phone: '5511' });
    expect(out).toMatchObject({ id: 'nova' });
    expect(prisma.opportunity.create).toHaveBeenCalledTimes(1);
    expect(prisma.opportunity.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', stage: 'new', conversationId: 'c2' });
  });

  // ── F6+ seller-leads (2026-07-20): escopo por vendedor + paused/discarded ──

  it('findAll com sellerScope: filtra assignedSellerId', async () => {
    prisma.opportunity.findMany.mockResolvedValue([]); prisma.opportunity.count.mockResolvedValue(0);
    await svc.findAll('t1', { limit: 50, offset: 0 } as any, undefined, 's1');
    expect(prisma.opportunity.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', assignedSellerId: 's1' });
  });

  it('findAll com sellerScope __none__ (vendedor sem sellerId): nunca vaza', async () => {
    prisma.opportunity.findMany.mockResolvedValue([]); prisma.opportunity.count.mockResolvedValue(0);
    await svc.findAll('t1', { limit: 50, offset: 0 } as any, undefined, '__none__');
    expect(prisma.opportunity.findMany.mock.calls[0][0].where.assignedSellerId).toBe('__never__');
  });

  it('findOne com sellerScope: lead de OUTRO vendedor -> 404 (query escopada)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(null);
    await expect(svc.findOne('t1', 'o1', 's1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.opportunity.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'o1', tenantId: 't1', assignedSellerId: 's1' });
  });

  it('moveStage paused: grava pausedUntil; discarded: grava discardReason', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', stage: 'new', stageHistory: [] });
    prisma.$transaction.mockResolvedValue([{ id: 'o1', stage: 'paused' }, {}]);
    await svc.moveStage('t1', 'o1', 'paused', undefined, { pausedUntil: '2026-08-05' });
    let data = prisma.opportunity.update.mock.calls[0][0].data;
    expect(data.stage).toBe('paused');
    expect(data.pausedUntil).toBeInstanceOf(Date);

    prisma.opportunity.update.mockClear();
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o2', stage: 'new', stageHistory: [] });
    prisma.$transaction.mockResolvedValue([{ id: 'o2', stage: 'discarded' }, {}]);
    await svc.moveStage('t1', 'o2', 'discarded', undefined, { discardReason: 'sem_fit' });
    data = prisma.opportunity.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ stage: 'discarded', discardReason: 'sem_fit', pausedUntil: null });
  });

  it('moveStage discarded com motivo invalido -> BadRequest', async () => {
    await expect(
      svc.moveStage('t1', 'o1', 'discarded', undefined, { discardReason: 'preguica' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // Achado da revisão externa (Gemini, 2026-08-05): sem isto, discardReason ficava
  // null e o painel de motivo de perda perdia justamente os casos sem explicação.
  it('moveStage discarded SEM motivo -> BadRequest (motivo agora obrigatorio)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', stage: 'new', stageHistory: [] });
    await expect(
      svc.moveStage('t1', 'o1', 'discarded'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('createFromLead: adota assignedSellerId quando oportunidade existe sem dono', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', conversationId: 'c1', assignedSellerId: null, assignedTo: null });
    prisma.opportunity.update.mockResolvedValue({ id: 'o1', assignedSellerId: 's1' });
    const out = await svc.createFromLead('t1', { conversationId: 'c1', assignedSellerId: 's1', assignedTo: 'João' });
    expect(out).toMatchObject({ assignedSellerId: 's1' });
    expect(prisma.opportunity.update.mock.calls[0][0].data).toMatchObject({ assignedSellerId: 's1', assignedTo: 'João' });
  });

  // ── F7 (RevOps): promover conversa a oportunidade (decisao do vendedor) ───

  describe('createFromConversation', () => {
    beforeEach(() => {
      prisma.aiConversation = { findFirst: vi.fn() };
      prisma.aiMessage = { findFirst: vi.fn().mockResolvedValue(null) };
      prisma.contact = { findFirst: vi.fn().mockResolvedValue(null) };
    });

    it('conversa inexistente -> 404', async () => {
      prisma.aiConversation.findFirst.mockResolvedValue(null);
      await expect(svc.createFromConversation('t1', 'c1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('leva nome do contato e ultima mensagem do lead como resumo', async () => {
      prisma.aiConversation.findFirst.mockResolvedValue({ id: 'c1', phone: '5511', contactId: 'ct1', assignedSellerId: 's1' });
      prisma.contact.findFirst.mockResolvedValue({ name: 'Transportadora ABC' });
      prisma.aiMessage.findFirst.mockResolvedValue({ content: 'Entregar cotação rápido possivel' });
      prisma.opportunity.findFirst.mockResolvedValue(null);
      prisma.opportunity.create.mockResolvedValue({ id: 'nova' });

      await svc.createFromConversation('t1', 'c1');

      expect(prisma.opportunity.create.mock.calls[0][0].data).toMatchObject({
        tenantId: 't1', stage: 'new', conversationId: 'c1', phone: '5511',
        name: 'Transportadora ABC', summary: 'Entregar cotação rápido possivel', assignedSellerId: 's1',
      });
    });

    it('idempotente: conversa que ja virou oportunidade nao duplica', async () => {
      prisma.aiConversation.findFirst.mockResolvedValue({ id: 'c1', phone: '5511', contactId: null, assignedSellerId: null });
      prisma.opportunity.findFirst.mockResolvedValue({ id: 'existente', assignedSellerId: 's1' });

      const out = await svc.createFromConversation('t1', 'c1');

      expect(out).toMatchObject({ id: 'existente' });
      expect(prisma.opportunity.create).not.toHaveBeenCalled();
    });

    it('vendedor nao promove conversa de outro vendedor -> 404', async () => {
      prisma.aiConversation.findFirst.mockResolvedValue({ id: 'c1', phone: '5511', contactId: null, assignedSellerId: 's2' });
      await expect(svc.createFromConversation('t1', 'c1', 's1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.opportunity.create).not.toHaveBeenCalled();
    });
  });

  it('createFromLead: busca o nome do contato quando o chamador nao passa', async () => {
    prisma.contact = { findFirst: vi.fn().mockResolvedValue({ name: 'Fulano Transportes' }) };
    prisma.opportunity.findFirst.mockResolvedValue(null);
    prisma.opportunity.create.mockResolvedValue({ id: 'nova' });

    await svc.createFromLead('t1', { conversationId: 'c9', contactId: 'ct9' });

    expect(prisma.opportunity.create.mock.calls[0][0].data).toMatchObject({ name: 'Fulano Transportes' });
  });

  // ── F7 (RevOps): fila de trabalho do vendedor ─────────────────────────────

  describe('queue', () => {
    const opp = (over: any = {}) => ({
      id: 'o1', tenantId: 't1', stage: 'new', interestScore: 50, intent: null,
      conversationId: null, updatedAt: new Date('2026-08-05T10:00:00Z'), ...over,
    });

    beforeEach(() => {
      prisma.aiMessage = { findMany: vi.fn().mockResolvedValue([]) };
      prisma.campaign = { findMany: vi.fn().mockResolvedValue([]) };
    });

    it('so traz estagios abertos — pausado e fechados ficam de fora', async () => {
      prisma.opportunity.findMany.mockResolvedValue([]);
      await svc.queue('t1');
      expect(prisma.opportunity.findMany.mock.calls[0][0].where).toMatchObject({
        tenantId: 't1', stage: { in: ['new', 'qualified', 'proposal'] },
      });
    });

    it('escopa por vendedor', async () => {
      prisma.opportunity.findMany.mockResolvedValue([]);
      await svc.queue('t1', 's1');
      expect(prisma.opportunity.findMany.mock.calls[0][0].where).toMatchObject({ assignedSellerId: 's1' });
    });

    it('quem pediu reuniao vem primeiro, mesmo com score menor', async () => {
      prisma.opportunity.findMany.mockResolvedValue([
        opp({ id: 'alto', interestScore: 95 }),
        opp({ id: 'reuniao', interestScore: 60, intent: 'meeting_request' }),
      ]);
      const out = await svc.queue('t1');
      expect(out.map((o: any) => o.id)).toEqual(['reuniao', 'alto']);
      expect(out[0].pediuReuniao).toBe(true);
    });

    it('sem reuniao, ordena por score desc', async () => {
      prisma.opportunity.findMany.mockResolvedValue([
        opp({ id: 'baixo', interestScore: 40 }),
        opp({ id: 'alto', interestScore: 90 }),
      ]);
      const out = await svc.queue('t1');
      expect(out.map((o: any) => o.id)).toEqual(['alto', 'baixo']);
    });

    it('empate no score: quem espera ha mais tempo vem primeiro', async () => {
      prisma.opportunity.findMany.mockResolvedValue([
        opp({ id: 'novo', updatedAt: new Date('2026-08-05T10:00:00Z') }),
        opp({ id: 'antigo', updatedAt: new Date('2026-08-01T10:00:00Z') }),
      ]);
      const out = await svc.queue('t1');
      expect(out.map((o: any) => o.id)).toEqual(['antigo', 'novo']);
    });

    it('anexa a ultima mensagem da conversa (mais recente), sem N+1', async () => {
      prisma.opportunity.findMany.mockResolvedValue([opp({ conversationId: 'c1' })]);
      prisma.aiMessage.findMany.mockResolvedValue([
        { conversationId: 'c1', direction: 'inbound', content: 'a mais nova', createdAt: new Date('2026-08-05T12:00:00Z') },
        { conversationId: 'c1', direction: 'outbound', content: 'a antiga', createdAt: new Date('2026-08-05T09:00:00Z') },
      ]);
      const out = await svc.queue('t1');
      expect(out[0].lastMessage).toMatchObject({ content: 'a mais nova', direction: 'inbound' });
      expect(prisma.aiMessage.findMany).toHaveBeenCalledTimes(1);
    });

    it('mostra a campanha de origem do lead', async () => {
      prisma.opportunity.findMany.mockResolvedValue([opp({ conversationId: 'c1' })]);
      prisma.aiMessage.findMany.mockResolvedValue([
        { conversationId: 'c1', direction: 'inbound', content: 'tenho interesse', createdAt: new Date('2026-08-05T12:00:00Z'), campaignId: null, intent: null },
        { conversationId: 'c1', direction: 'outbound', content: 'oi', createdAt: new Date('2026-08-05T09:00:00Z'), campaignId: 'camp1', intent: 'outbound_campaign' },
      ]);
      prisma.campaign.findMany.mockResolvedValue([{ id: 'camp1', name: 'Frotistas SP' }]);

      const out = await svc.queue('t1');

      expect(out[0].origemCampanha).toBe('Frotistas SP');
      expect(prisma.campaign.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1' });
    });

    it('quando a conversa teve 2 campanhas, mostra a que ORIGINOU (a mais antiga)', async () => {
      prisma.opportunity.findMany.mockResolvedValue([opp({ conversationId: 'c1' })]);
      prisma.aiMessage.findMany.mockResolvedValue([
        { conversationId: 'c1', direction: 'outbound', content: 'segunda', createdAt: new Date('2026-08-05T12:00:00Z'), campaignId: 'nova', intent: 'outbound_campaign' },
        { conversationId: 'c1', direction: 'outbound', content: 'primeira', createdAt: new Date('2026-08-01T09:00:00Z'), campaignId: 'origem', intent: 'outbound_campaign' },
      ]);
      prisma.campaign.findMany.mockResolvedValue([
        { id: 'origem', name: 'Frotistas SP' }, { id: 'nova', name: 'Reengajamento' },
      ]);

      const out = await svc.queue('t1');
      expect(out[0].origemCampanha).toBe('Frotistas SP');
    });

    it('lead criado a mao (sem campanha) tem origem null e nao consulta campanhas', async () => {
      prisma.opportunity.findMany.mockResolvedValue([opp({ conversationId: 'c1' })]);
      prisma.aiMessage.findMany.mockResolvedValue([
        { conversationId: 'c1', direction: 'inbound', content: 'oi', createdAt: new Date(), campaignId: null, intent: null },
      ]);
      const out = await svc.queue('t1');
      expect(out[0].origemCampanha).toBeNull();
      expect(prisma.campaign.findMany).not.toHaveBeenCalled();
    });

    it('lead sem conversa nao quebra — lastMessage vira null', async () => {
      prisma.opportunity.findMany.mockResolvedValue([opp({ conversationId: null })]);
      const out = await svc.queue('t1');
      expect(out[0].lastMessage).toBeNull();
      expect(prisma.aiMessage.findMany).not.toHaveBeenCalled();
    });

    it('fila vazia nao consulta mensagens', async () => {
      prisma.opportunity.findMany.mockResolvedValue([]);
      const out = await svc.queue('t1');
      expect(out).toEqual([]);
      expect(prisma.aiMessage.findMany).not.toHaveBeenCalled();
    });
  });

  it('evolution: agrupa recebidos e ganhos por semana respeitando o escopo', async () => {
    const now = new Date();
    prisma.opportunity.findMany.mockResolvedValue([{ createdAt: now }, { createdAt: now }]);
    prisma.opportunityStageHistory = { ...prisma.opportunityStageHistory, findMany: vi.fn().mockResolvedValue([{ changedAt: now }]) };
    const out = await svc.evolution('t1', 4, 's1');
    expect(out).toHaveLength(4);
    const thisWeek = out[out.length - 1];
    expect(thisWeek.received).toBe(2);
    expect(thisWeek.won).toBe(1);
    expect(prisma.opportunity.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', assignedSellerId: 's1' });
  });

  // ── F7 (RevOps): compartilhamento com parceiro externo (LGPD gate) ─────────

  it('recordPartnerConsent: grava o timestamp de consentimento', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', stage: 'new', partnerConsentAt: null });
    prisma.opportunity.update.mockResolvedValue({ id: 'o1', partnerConsentAt: new Date() });
    await svc.recordPartnerConsent('t1', 'o1');
    expect(prisma.opportunity.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'o1' },
      data: { partnerConsentAt: expect.any(Date) },
    });
  });

  it('recordPartnerConsent: idempotente — nao sobrescreve consentimento ja dado', async () => {
    const jaConsentiu = new Date('2026-08-01T00:00:00.000Z');
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', stage: 'new', partnerConsentAt: jaConsentiu });
    const out = await svc.recordPartnerConsent('t1', 'o1');
    expect(out).toMatchObject({ partnerConsentAt: jaConsentiu });
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it('shareWithPartner: sem consentimento -> BadRequest, nunca compartilha (LGPD)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', stage: 'new', partnerConsentAt: null });
    await expect(svc.shareWithPartner('t1', 'o1', 'p1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.partner.findFirst).not.toHaveBeenCalled();
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it('shareWithPartner: parceiro inexistente/inativo/de outro tenant -> BadRequest', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', stage: 'new', partnerConsentAt: new Date() });
    prisma.partner.findFirst.mockResolvedValue(null);
    await expect(svc.shareWithPartner('t1', 'o1', 'p1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.partner.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'p1', tenantId: 't1', active: true });
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it('shareWithPartner: com consentimento e parceiro ativo -> compartilha', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', stage: 'new', partnerConsentAt: new Date() });
    prisma.partner.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1', active: true });
    prisma.opportunity.update.mockResolvedValue({ id: 'o1', partnerShareStatus: 'shared' });
    await svc.shareWithPartner('t1', 'o1', 'p1');
    expect(prisma.opportunity.update.mock.calls[0][0].data).toMatchObject({
      sharedWithPartnerId: 'p1',
      partnerShareStatus: 'shared',
      partnerSharedAt: expect.any(Date),
    });
  });
});
