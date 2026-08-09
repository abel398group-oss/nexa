import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NumberBudgetService } from './number-budget.service';

// Sem REDIS_URL o serviço cai no contador em memória — é esse caminho que os
// testes exercitam. O caminho Redis é a mesma aritmética feita pelo servidor.

describe('NumberBudgetService (modo memória)', () => {
  let svc: NumberBudgetService;
  const envAnterior = { ...process.env };

  beforeEach(() => {
    delete process.env.REDIS_URL;
    svc = new NumberBudgetService();
    svc.onModuleInit();
  });

  afterEach(() => {
    process.env = { ...envAnterior };
  });

  it('começa zerado', async () => {
    const s = await svc.snapshot();
    expect(s.today).toBe(0);
    expect(s.thisHour).toBe(0);
    expect(s.byOrigin).toEqual({});
  });

  it('conta envio de QUALQUER origem no mesmo balde — este é o ponto do serviço', async () => {
    // O bug original: só `campaign` era contado. Aqui as seis origens somam.
    await svc.record('campaign');
    await svc.record('lia');
    await svc.record('monitor');
    await svc.record('followup');
    await svc.record('janitor');
    await svc.record('handoff');

    const s = await svc.snapshot();
    expect(s.today).toBe(6);
    expect(s.thisHour).toBe(6);
  });

  it('quebra por origem para o relatório', async () => {
    await svc.record('monitor');
    await svc.record('monitor');
    await svc.record('campaign');

    const s = await svc.snapshot();
    expect(s.byOrigin).toEqual({ monitor: 2, campaign: 1 });
  });

  describe('overCeiling', () => {
    it('não estoura enquanto está abaixo dos dois tetos', async () => {
      process.env.NUMBER_DAILY_CEILING = '10';
      process.env.NUMBER_HOURLY_CEILING = '5';
      await svc.record('campaign');

      const r = await svc.overCeiling();
      expect(r.over).toBe(false);
    });

    it('estoura no teto DIÁRIO e diz quem gastou', async () => {
      process.env.NUMBER_DAILY_CEILING = '3';
      process.env.NUMBER_HOURLY_CEILING = '99';
      await svc.record('monitor');
      await svc.record('monitor');
      await svc.record('campaign');

      const r = await svc.overCeiling();
      expect(r.over).toBe(true);
      expect(r.reason).toContain('DIÁRIO');
      expect(r.reason).toContain('3/3');
      // A quebra por origem é o que torna o log acionável: mostra que foi o
      // Monitor, não a campanha, que consumiu o número.
      expect(r.reason).toContain('monitor=2');
    });

    it('estoura no teto POR HORA mesmo com o dia folgado — pega rajada', async () => {
      process.env.NUMBER_DAILY_CEILING = '999';
      process.env.NUMBER_HOURLY_CEILING = '2';
      await svc.record('monitor');
      await svc.record('monitor');

      const r = await svc.overCeiling();
      expect(r.over).toBe(true);
      expect(r.reason).toContain('POR HORA');
    });

    it('o teto é do NÚMERO, não da origem: alerta consome o orçamento da campanha', async () => {
      process.env.NUMBER_DAILY_CEILING = '2';
      // Nenhum envio de campanha — só alerta do Monitor. Mesmo assim a campanha
      // fica bloqueada, porque quem tem teto é o chip.
      await svc.record('monitor');
      await svc.record('monitor');

      const r = await svc.overCeiling();
      expect(r.over).toBe(true);
      expect(r.snapshot.byOrigin.campaign).toBeUndefined();
    });
  });

  it('record nunca lança, mesmo com origem estranha', async () => {
    await expect(svc.record('')).resolves.toBeUndefined();
  });
});
