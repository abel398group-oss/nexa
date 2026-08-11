import { describe, expect, it } from 'vitest';
import { ordenarFila, prioridadeDe, type ItemDaFila } from './sdr-queue';

const AGORA = new Date('2026-08-11T14:00:00Z');
const d = (iso: string) => new Date(iso);

function item(p: Partial<ItemDaFila> & { id: string }): ItemDaFila {
  return {
    pausedUntil: null,
    tentativas: 0,
    createdAt: d('2026-08-01T00:00:00Z'),
    ...p,
  };
}

describe('prioridade', () => {
  it('retorno vencido ou de hoje é retorno_hoje', () => {
    expect(prioridadeDe(item({ id: 'a', pausedUntil: d('2026-08-10T00:00:00Z') }), AGORA)).toBe(
      'retorno_hoje',
    );
    expect(prioridadeDe(item({ id: 'b', pausedUntil: AGORA }), AGORA)).toBe('retorno_hoje');
  });

  it('pausado para o futuro sai da fila', () => {
    // Aparecer antes da data combinada faz o SDR ligar cedo — mesmo dano de ligar
    // tarde, e ele acha que o sistema está mandando ligar.
    expect(prioridadeDe(item({ id: 'a', pausedUntil: d('2026-09-01T00:00:00Z') }), AGORA)).toBeNull();
  });

  it('sem tentativa é nunca_tocado; com tentativa é em_andamento', () => {
    expect(prioridadeDe(item({ id: 'a', tentativas: 0 }), AGORA)).toBe('nunca_tocado');
    expect(prioridadeDe(item({ id: 'b', tentativas: 1 }), AGORA)).toBe('em_andamento');
  });
});

describe('ordem da fila', () => {
  it('retorno de hoje vem antes de tudo, mesmo sendo o lead mais novo', () => {
    const fila = ordenarFila(
      [
        item({ id: 'novo-nunca-tocado', createdAt: d('2026-08-01T00:00:00Z') }),
        item({ id: 'em-andamento', tentativas: 3, createdAt: d('2026-07-01T00:00:00Z') }),
        item({
          id: 'prometido-hoje',
          pausedUntil: d('2026-08-11T09:00:00Z'),
          createdAt: d('2026-08-10T00:00:00Z'),
        }),
      ],
      AGORA,
    );

    expect(fila.map((f) => f.id)).toEqual([
      'prometido-hoje',
      'novo-nunca-tocado',
      'em-andamento',
    ]);
  });

  it('empate na prioridade: o mais antigo primeiro', () => {
    const fila = ordenarFila(
      [
        item({ id: 'recente', createdAt: d('2026-08-10T00:00:00Z') }),
        item({ id: 'antigo', createdAt: d('2026-06-01T00:00:00Z') }),
      ],
      AGORA,
    );
    expect(fila.map((f) => f.id)).toEqual(['antigo', 'recente']);
  });

  it('devolve a prioridade junto, pra tela agrupar sem recalcular a regra', () => {
    const fila = ordenarFila([item({ id: 'a', tentativas: 2 })], AGORA);
    expect(fila[0].prioridade).toBe('em_andamento');
  });

  it('fila vazia não quebra', () => {
    expect(ordenarFila([], AGORA)).toEqual([]);
  });
});
