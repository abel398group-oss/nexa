import { describe, it, expect, vi, afterEach } from 'vitest';
import { SenderService } from './sender.service';

// As regras puras nao usam as dependencias — instancia com mocks vazios.
function makeSvc(): SenderService {
  return new SenderService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
}

afterEach(() => vi.useRealTimers());

// helper: fixa o relogio num horario UTC (os metodos calculam Brasilia = UTC-3)
function setUtc(hour: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.UTC(2026, 5, 13, hour, 0, 0)));
}

describe('SenderService — regras de negocio', () => {
  describe('effectiveDailyLimit (G7 — aquecimento)', () => {
    const svc = makeSvc();
    it('respeita a fase de warmup (0->10, 1->15, 2->20, 3->30)', () => {
      expect(svc.effectiveDailyLimit({ dailyLimit: 100, warmupStage: 0 })).toBe(10);
      expect(svc.effectiveDailyLimit({ dailyLimit: 100, warmupStage: 1 })).toBe(15);
      expect(svc.effectiveDailyLimit({ dailyLimit: 100, warmupStage: 2 })).toBe(20);
      expect(svc.effectiveDailyLimit({ dailyLimit: 100, warmupStage: 3 })).toBe(30);
    });
    it('fase acima do maximo fica no teto (30)', () => {
      expect(svc.effectiveDailyLimit({ dailyLimit: 100, warmupStage: 9 })).toBe(30);
    });
    it('nunca passa do dailyLimit configurado', () => {
      expect(svc.effectiveDailyLimit({ dailyLimit: 5, warmupStage: 3 })).toBe(5);
    });
  });

  describe('greeting (G3 — saudacao por horario, Brasilia)', () => {
    it('manha -> Bom dia', () => {
      setUtc(13); // 10h BRT
      expect(SenderService.greeting()).toBe('Bom dia');
    });
    it('tarde -> Boa tarde', () => {
      setUtc(18); // 15h BRT
      expect(SenderService.greeting()).toBe('Boa tarde');
    });
    it('noite -> Boa noite', () => {
      setUtc(23); // 20h BRT
      expect(SenderService.greeting()).toBe('Boa noite');
    });
    it('madrugada -> Boa noite', () => {
      setUtc(4); // 1h BRT
      expect(SenderService.greeting()).toBe('Boa noite');
    });
  });

  describe('withinBusinessHours (7h-19h Brasilia)', () => {
    const within = () => (makeSvc() as any).withinBusinessHours() as boolean;
    it('dentro do horario comercial -> true', () => {
      setUtc(13); // 10h BRT
      expect(within()).toBe(true);
    });
    it('antes das 7h -> false', () => {
      setUtc(9); // 6h BRT
      expect(within()).toBe(false);
    });
    it('depois das 19h -> false', () => {
      setUtc(23); // 20h BRT
      expect(within()).toBe(false);
    });
  });

  describe('render (G1 — opt-out LGPD + placeholders)', () => {
    const render = (tpl: string, name?: string | null) => (makeSvc() as any).render(tpl, name) as string;

    it('substitui {{nome}} pelo primeiro nome', () => {
      expect(render('Ola {{nome}}!', 'Joao Silva')).toContain('Ola Joao!');
    });
    it('sem nome usa "tudo bem"', () => {
      expect(render('Ola {{nome}}!')).toContain('Ola tudo bem!');
    });
    it('anexa o rodape de opt-out quando falta (LGPD)', () => {
      const out = render('Mensagem qualquer', 'Ana');
      expect(out).toContain('Responda SAIR');
    });
    it('NAO duplica o rodape se ja houver "Responda SAIR"', () => {
      const tpl = 'Promo! Responda SAIR para sair.';
      const out = render(tpl, 'Ana');
      expect(out.match(/Responda SAIR/g)?.length).toBe(1);
    });
    it('substitui {{saudacao}} pela saudacao do horario', () => {
      setUtc(13); // Bom dia
      expect(render('{{saudacao}}, {{nome}}', 'Ana')).toContain('Bom dia, Ana');
    });
  });
});
