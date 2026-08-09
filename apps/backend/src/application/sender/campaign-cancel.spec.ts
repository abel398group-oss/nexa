import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SenderService } from './sender.service';

// DISP-004 — `pause` só impedia o worker de PEGAR mais alvos; os `queued`
// ficavam na fila para sempre e um `start` acidental meses depois disparava a
// lista inteira. Não existia ação que zerasse a fila de propósito.

function makeService(campanha: any) {
  const campaignTargetUpdateMany = vi.fn().mockResolvedValue({ count: 7 });
  const campaignUpdate = vi.fn().mockResolvedValue({});
  const prisma: any = {
    campaign: { findFirst: vi.fn().mockResolvedValue(campanha), update: campaignUpdate },
    campaignTarget: { updateMany: campaignTargetUpdateMany },
    // executa as operações do array como o Prisma faria, preservando a ordem
    $transaction: vi.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
  };
  const svc: any = new SenderService(
    prisma, {} as any, {} as any, {} as any, {} as any, {} as any,
    { acquire: async () => async () => {} } as any, {} as any,
  );
  svc['logger'] = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { svc, prisma, campaignTargetUpdateMany, campaignUpdate };
}

const RUNNING = { id: 'camp1', name: 'Prospecção agosto', status: 'running' };

describe('cancelCampaign (DISP-004)', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService(RUNNING);
  });

  it('campanha inexistente → 404', async () => {
    const { svc, prisma } = makeService(null);
    prisma.campaign.findFirst.mockResolvedValue(null);

    await expect(svc.cancelCampaign('t1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tira da fila os alvos queued E sending', async () => {
    await ctx.svc.cancelCampaign('t1', 'camp1');

    const arg = ctx.campaignTargetUpdateMany.mock.calls[0][0];
    expect(arg.where.status).toEqual({ in: ['queued', 'sending'] });
  });

  it('inclui "sending" para a recuperacao de travados nao ressuscitar o alvo', async () => {
    // O tick devolve alvos presos em 'sending' para 'queued' após 5-10 min.
    // Fora do cancelamento, a campanha "cancelada" mandaria mais uma mensagem.
    await ctx.svc.cancelCampaign('t1', 'camp1');

    const arg = ctx.campaignTargetUpdateMany.mock.calls[0][0];
    expect(arg.where.status.in).toContain('sending');
  });

  it('marca como skipped/cancelado em vez de apagar — o relatorio precisa mostrar quem nao recebeu', async () => {
    await ctx.svc.cancelCampaign('t1', 'camp1');

    const arg = ctx.campaignTargetUpdateMany.mock.calls[0][0];
    expect(arg.data).toEqual({ status: 'skipped', error: 'cancelado' });
  });

  it('NAO toca nos ja enviados', async () => {
    await ctx.svc.cancelCampaign('t1', 'camp1');

    const arg = ctx.campaignTargetUpdateMany.mock.calls[0][0];
    expect(arg.where.status.in).not.toContain('sent');
    expect(arg.where.status.in).not.toContain('failed');
  });

  it('isola por tenant — nunca cancela alvo de outro tenant', async () => {
    await ctx.svc.cancelCampaign('t1', 'camp1');

    const arg = ctx.campaignTargetUpdateMany.mock.calls[0][0];
    expect(arg.where.tenantId).toBe('t1');
  });

  it('encerra a campanha e devolve quantos sairam da fila', async () => {
    const r = await ctx.svc.cancelCampaign('t1', 'camp1');

    expect(ctx.campaignUpdate).toHaveBeenCalledWith({ where: { id: 'camp1' }, data: { status: 'done' } });
    expect(r).toEqual({ cancelled: 7, status: 'done' });
  });

  it('zerar a fila e encerrar acontecem na MESMA transacao', async () => {
    await ctx.svc.cancelCampaign('t1', 'camp1');

    // Encerrar sem zerar deixaria alvos órfãos numa campanha 'done'; zerar sem
    // encerrar deixaria o worker rodando sobre uma fila vazia.
    expect(ctx.prisma.$transaction).toHaveBeenCalledOnce();
    expect(ctx.prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it('campanha ja concluida e no-op — nao mexe em alvo nenhum', async () => {
    const c = makeService({ ...RUNNING, status: 'done' });

    const r = await c.svc.cancelCampaign('t1', 'camp1');

    expect(r).toEqual({ cancelled: 0, status: 'done' });
    expect(c.campaignTargetUpdateMany).not.toHaveBeenCalled();
  });

  it('campanha pausada tambem pode ser cancelada', async () => {
    const c = makeService({ ...RUNNING, status: 'paused' });

    const r = await c.svc.cancelCampaign('t1', 'camp1');

    expect(r.status).toBe('done');
    expect(c.campaignTargetUpdateMany).toHaveBeenCalled();
  });
});
