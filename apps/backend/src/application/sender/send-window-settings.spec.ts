import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SenderService } from './sender.service';

/**
 * A janela de envio é lida como `hora >= início && hora < fim` (withinWaWindow,
 * e o mesmo no worker de e-mail). Com início >= fim isso é falso nas 24 horas do
 * dia: a campanha nunca sai, fica em 'queued' para sempre, e nada avisa —
 * nem erro, nem log, nem badge na tela.
 *
 * Medido em 13/08/2026: `PUT /api/sender/settings` gravava `22 → 8` e `10 → 10`
 * respondendo 200 OK. Salvar 22→8 achando que é "das 22h às 8h" é o erro natural
 * de quem quer disparo noturno.
 */
function makeService() {
  const upsert = vi.fn().mockImplementation(({ update }: any) => Promise.resolve(update));
  const prisma: any = { senderSettings: { upsert, findUnique: vi.fn() } };
  const svc: any = new SenderService(
    prisma, {} as any, {} as any, {} as any, {} as any, {} as any,
    { acquire: async () => async () => {} } as any, {} as any,
  );
  svc['logger'] = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { svc, upsert };
}

const OK = { waStartHour: 9, waEndHour: 21, emailStartHour: 8, emailEndHour: 18 };

describe('updateSettings — janela de envio', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it('a janela normal continua salvando — é o caso de todo dia', async () => {
    await ctx.svc.updateSettings('t1', OK);
    expect(ctx.upsert).toHaveBeenCalled();
    expect(ctx.upsert.mock.calls[0][0].update).toEqual(OK);
  });

  it('recusa janela invertida no WhatsApp (22h → 8h) e não grava nada', async () => {
    await expect(
      ctx.svc.updateSettings('t1', { ...OK, waStartHour: 22, waEndHour: 8 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.upsert).not.toHaveBeenCalled();
  });

  it('recusa janela de duração zero (10h → 10h)', async () => {
    await expect(
      ctx.svc.updateSettings('t1', { ...OK, waStartHour: 10, waEndHour: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.upsert).not.toHaveBeenCalled();
  });

  // O e-mail tem worker próprio e a mesma leitura de janela — não podia ficar
  // de fora só porque o bug apareceu primeiro no WhatsApp.
  it('vale igual para o canal de e-mail', async () => {
    await expect(
      ctx.svc.updateSettings('t1', { ...OK, emailStartHour: 20, emailEndHour: 6 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.upsert).not.toHaveBeenCalled();
  });

  it('a mensagem diz quais horas e por que não sairia nada', async () => {
    const erro = await ctx.svc
      .updateSettings('t1', { ...OK, waStartHour: 22, waEndHour: 8 })
      .catch((e: any) => e);
    expect(erro.message).toContain('22h → 8h');
    expect(erro.message).toContain('nenhuma campanha sairia');
  });

  // O clamp continua existindo para chamada interna; o que muda é que a rota
  // HTTP agora barra >23 antes (@Max no DTO), em vez de gravar outro valor.
  it('hora acima de 23 ainda é limitada, sem virar janela morta', async () => {
    await ctx.svc.updateSettings('t1', { ...OK, waStartHour: 9, waEndHour: 99 });
    expect(ctx.upsert.mock.calls[0][0].update.waEndHour).toBe(23);
  });
});
