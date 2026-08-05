import { describe, it, expect, beforeEach } from 'vitest';
import {
  isWithinSupportHours,
  businessHoursBetween,
  nextOpening,
  nextOpeningLabel,
  supportHoursLabel,
} from './support-hours';

// BRT = UTC-3. 12:00 UTC = 09:00 BRT.
const brt = (iso: string) => new Date(iso);

// 2026-08-05 é uma QUARTA. 08-08 sábado, 08-09 domingo, 08-10 segunda.
const QUARTA_9H = brt('2026-08-05T12:00:00Z');   // 09:00 BRT
const QUARTA_17H = brt('2026-08-05T20:00:00Z');  // 17:00 BRT
const QUARTA_2H = brt('2026-08-05T05:00:00Z');   // 02:00 BRT
const QUARTA_20H = brt('2026-08-05T23:00:00Z');  // 20:00 BRT
const SABADO_10H = brt('2026-08-08T13:00:00Z');  // 10:00 BRT sábado

describe('support-hours', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPPORT_START_HOUR: '8', SUPPORT_END_HOUR: '18' };
  });

  describe('isWithinSupportHours', () => {
    it('quarta 9h: atendendo', () => expect(isWithinSupportHours(QUARTA_9H)).toBe(true));
    it('quarta 2h da manha: fora', () => expect(isWithinSupportHours(QUARTA_2H)).toBe(false));
    it('quarta 20h: fora', () => expect(isWithinSupportHours(QUARTA_20H)).toBe(false));
    it('sabado 10h: fora (fim de semana)', () => expect(isWithinSupportHours(SABADO_10H)).toBe(false));

    it('exatamente 8h: dentro; exatamente 18h: fora', () => {
      expect(isWithinSupportHours(brt('2026-08-05T11:00:00Z'))).toBe(true);  // 08:00 BRT
      expect(isWithinSupportHours(brt('2026-08-05T21:00:00Z'))).toBe(false); // 18:00 BRT
    });

    it('respeita horario customizado', () => {
      process.env.SUPPORT_START_HOUR = '6';
      expect(isWithinSupportHours(brt('2026-08-05T09:30:00Z'))).toBe(true); // 06:30 BRT
    });
  });

  describe('businessHoursBetween', () => {
    it('dentro do mesmo dia util conta normal', () => {
      expect(businessHoursBetween(QUARTA_9H, QUARTA_17H)).toBe(8);
    });

    it('a noite NAO conta — 17h de quarta ate 9h de quinta = 1h util', () => {
      const quintaNove = brt('2026-08-06T12:00:00Z');
      expect(businessHoursBetween(QUARTA_17H, quintaNove)).toBe(2); // 17→18 (1h) + 8→9 (1h)
    });

    // O caso que gerava alerta impossível de cumprir: chamado crítico (SLA 1h)
    // entrando no sábado estourava no próprio sábado.
    it('fim de semana inteiro conta ZERO', () => {
      const sextaDezoito = brt('2026-08-07T21:00:00Z'); // sexta 18:00 BRT
      const segundaOito = brt('2026-08-10T11:00:00Z');  // segunda 08:00 BRT
      expect(businessHoursBetween(sextaDezoito, segundaOito)).toBe(0);
    });

    it('sabado 10h ate segunda 10h = 2h uteis (so a segunda de manha)', () => {
      const segundaDez = brt('2026-08-10T13:00:00Z');
      expect(businessHoursBetween(SABADO_10H, segundaDez)).toBe(2);
    });

    it('intervalo invertido ou nulo = 0', () => {
      expect(businessHoursBetween(QUARTA_17H, QUARTA_9H)).toBe(0);
      expect(businessHoursBetween(QUARTA_9H, QUARTA_9H)).toBe(0);
    });

    it('comeco antes da abertura so conta a partir das 8h', () => {
      expect(businessHoursBetween(QUARTA_2H, brt('2026-08-05T13:00:00Z'))).toBe(2); // 8→10 BRT
    });
  });

  describe('nextOpening / nextOpeningLabel', () => {
    it('dentro do horario devolve o proprio instante', () => {
      expect(nextOpening(QUARTA_9H)).toEqual(QUARTA_9H);
      expect(nextOpeningLabel(QUARTA_9H)).toBe('hoje às 09h');
    });

    it('madrugada abre no mesmo dia', () => {
      expect(nextOpeningLabel(QUARTA_2H)).toBe('hoje às 08h');
    });

    it('depois do expediente abre amanha', () => {
      expect(nextOpeningLabel(QUARTA_20H)).toBe('amanhã às 08h');
    });

    it('sabado aponta para segunda pelo nome do dia', () => {
      expect(nextOpeningLabel(SABADO_10H)).toBe('segunda-feira às 08h');
    });

    it('sexta a noite tambem cai na segunda', () => {
      const sextaNoite = brt('2026-08-07T23:00:00Z'); // sexta 20:00 BRT
      expect(nextOpeningLabel(sextaNoite)).toBe('segunda-feira às 08h');
    });
  });

  it('supportHoursLabel descreve a janela configurada', () => {
    expect(supportHoursLabel()).toBe('de segunda a sexta, das 8h às 18h');
    process.env.SUPPORT_END_HOUR = '17';
    expect(supportHoursLabel()).toBe('de segunda a sexta, das 8h às 17h');
  });
});
