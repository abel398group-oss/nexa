import { describe, expect, it } from 'vitest';
import { estaAusente, naoAusente } from './seller-availability';

const AGORA = new Date('2026-08-11T14:00:00Z');

describe('ausência se cura sozinha', () => {
  it('quem voltou ontem já não está ausente', () => {
    // É a razão de ser data e não booleano: booleano depende de alguém desmarcar, e
    // quem voltou passa a semana sem receber lead sem entender por quê.
    expect(estaAusente(new Date('2026-08-10T00:00:00Z'), AGORA)).toBe(false);
  });

  it('quem volta semana que vem está ausente', () => {
    expect(estaAusente(new Date('2026-08-20T00:00:00Z'), AGORA)).toBe(true);
  });

  it('sem data é presente', () => {
    expect(estaAusente(null, AGORA)).toBe(false);
    expect(estaAusente(undefined, AGORA)).toBe(false);
  });
});

describe('filtro do Prisma', () => {
  it('aceita quem não tem data e quem já voltou', () => {
    // O mesmo `where` é usado na distribuição e na lista de closers. Se as duas
    // divergirem, o vendedor de férias some de uma tela e continua na outra.
    expect(naoAusente(AGORA)).toEqual({
      OR: [{ awayUntil: null }, { awayUntil: { lte: AGORA } }],
    });
  });
});
