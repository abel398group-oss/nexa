import { describe, it, expect } from 'vitest';
import { TmsResilience } from './tms-resilience';

/** Relógio controlado — testar disjuntor com sleep real deixaria a suíte lenta e instável. */
function makeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('TmsResilience — cache', () => {
  it('devolve valor dentro do TTL', () => {
    const c = makeClock();
    const r = new TmsResilience({ now: c.now });
    r.set('plans', [{ code: 'basic' }]);
    expect(r.getFresh('plans', 60_000)).toEqual([{ code: 'basic' }]);
  });

  it('não devolve valor vencido como fresco', () => {
    const c = makeClock();
    const r = new TmsResilience({ now: c.now });
    r.set('plans', ['x']);
    c.advance(61_000);
    expect(r.getFresh('plans', 60_000)).toBeUndefined();
  });

  it('vencido continua acessível como stale — dado velho é melhor que erro', () => {
    const c = makeClock();
    const r = new TmsResilience({ now: c.now });
    r.set('plans', ['x']);
    c.advance(10 * 60_000);
    expect(r.getFresh('plans', 60_000)).toBeUndefined();
    expect(r.getStale('plans')).toEqual(['x']);
  });

  it('chave nunca gravada não inventa valor', () => {
    const r = new TmsResilience();
    expect(r.getFresh('nada', 1000)).toBeUndefined();
    expect(r.getStale('nada')).toBeUndefined();
  });
});

describe('TmsResilience — disjuntor', () => {
  it('começa armado (não bloqueia nada)', () => {
    expect(new TmsResilience().isBlocked()).toBe(false);
  });

  it('falhas abaixo do limite não desarmam', () => {
    const r = new TmsResilience({ failureThreshold: 5 });
    for (let i = 0; i < 4; i++) r.recordFailure();
    expect(r.isBlocked()).toBe(false);
  });

  it('desarma ao atingir o limite de falhas seguidas', () => {
    const r = new TmsResilience({ failureThreshold: 5 });
    for (let i = 0; i < 5; i++) r.recordFailure();
    expect(r.isBlocked()).toBe(true);
    expect(r.stats().circuitOpen).toBe(true);
  });

  it('um sucesso no meio zera a contagem', () => {
    const r = new TmsResilience({ failureThreshold: 5 });
    for (let i = 0; i < 4; i++) r.recordFailure();
    r.recordSuccess();
    for (let i = 0; i < 4; i++) r.recordFailure();
    expect(r.isBlocked()).toBe(false);
  });

  it('libera UMA sondagem quando a espera vence e segura o resto', () => {
    const c = makeClock();
    const r = new TmsResilience({ failureThreshold: 2, openMs: 30_000, now: c.now });
    r.recordFailure();
    r.recordFailure();
    expect(r.isBlocked()).toBe(true);

    c.advance(30_001);
    expect(r.isBlocked()).toBe(false); // sondagem liberada
    expect(r.isBlocked()).toBe(true);  // as demais continuam barradas
    expect(r.isBlocked()).toBe(true);
  });

  it('sondagem bem-sucedida rearma o disjuntor', () => {
    const c = makeClock();
    const r = new TmsResilience({ failureThreshold: 2, openMs: 30_000, now: c.now });
    r.recordFailure();
    r.recordFailure();
    c.advance(30_001);
    r.isBlocked(); // consome a sondagem
    r.recordSuccess();

    expect(r.isBlocked()).toBe(false);
    expect(r.stats().circuitOpen).toBe(false);
  });

  it('sondagem que falha reinicia a espera inteira', () => {
    const c = makeClock();
    const r = new TmsResilience({ failureThreshold: 2, openMs: 30_000, now: c.now });
    r.recordFailure();
    r.recordFailure();
    c.advance(30_001);
    r.isBlocked(); // sondagem
    r.recordFailure(); // TMS ainda ruim

    expect(r.isBlocked()).toBe(true);
    c.advance(29_000);
    expect(r.isBlocked()).toBe(true); // ainda dentro da nova espera
    c.advance(2_000);
    expect(r.isBlocked()).toBe(false); // nova sondagem
  });
});

describe('TmsResilience — stats e reset', () => {
  it('stats não vaza conteúdo cacheado', () => {
    const r = new TmsResilience();
    r.set('cliente:5511', { nome: 'João', cnpj: '123' });
    expect(JSON.stringify(r.stats())).not.toContain('João');
    expect(r.stats().cachedKeys).toBe(1);
  });

  it('reset limpa cache e rearma', () => {
    const r = new TmsResilience({ failureThreshold: 1 });
    r.set('k', 1);
    r.recordFailure();
    r.reset();
    expect(r.isBlocked()).toBe(false);
    expect(r.getStale('k')).toBeUndefined();
  });
});
