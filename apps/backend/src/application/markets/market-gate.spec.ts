import { describe, expect, it } from 'vitest';
import { motivoDeBloqueioDoDisparo } from './market-gate';

describe('motivoDeBloqueioDoDisparo (trava de mercado no disparo — ADR 037)', () => {
  it('sem productCode não trava — produto principal e campanhas antigas', () => {
    expect(motivoDeBloqueioDoDisparo(null, null)).toBeNull();
    expect(motivoDeBloqueioDoDisparo(undefined, null)).toBeNull();
    expect(motivoDeBloqueioDoDisparo('', null)).toBeNull();
  });

  it('código que não existe barra — typo desligaria conhecimento e marca em silêncio', () => {
    const motivo = motivoDeBloqueioDoDisparo('hiprtms', null);
    expect(motivo).toContain('"hiprtms"');
    expect(motivo).toContain('não existe');
  });

  it('mercado em rascunho barra e diz o que falta fazer', () => {
    const motivo = motivoDeBloqueioDoDisparo('pneus', { name: 'Pneus Silva', status: 'draft' });
    expect(motivo).toContain('Pneus Silva');
    expect(motivo).toContain('rascunho');
  });

  it('mercado suspenso barra com o caminho de volta', () => {
    const motivo = motivoDeBloqueioDoDisparo('pneus', { name: 'Pneus Silva', status: 'paused' });
    expect(motivo).toContain('suspenso');
  });

  it('mercado ativo passa', () => {
    expect(motivoDeBloqueioDoDisparo('pneus', { name: 'Pneus Silva', status: 'active' })).toBeNull();
  });
});
