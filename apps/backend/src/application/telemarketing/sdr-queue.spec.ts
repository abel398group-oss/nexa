import { describe, expect, it } from 'vitest';
import {
  agruparPorContato,
  ordenarFila,
  prioridadeDe,
  type ItemAgrupavel,
  type ItemDaFila,
} from './sdr-queue';

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

describe('agrupamento por contato', () => {
  function op(p: Partial<ItemAgrupavel> & { id: string }): ItemAgrupavel {
    return {
      pausedUntil: null,
      tentativas: 0,
      createdAt: d('2026-08-01T00:00:00Z'),
      ...p,
    };
  }

  it('funde as oportunidades do mesmo contato numa linha só', () => {
    const fila = agruparPorContato(
      [
        op({ id: 'lote-1', contactId: 'ana' }),
        op({ id: 'lote-2', contactId: 'ana' }),
        op({ id: 'lote-3', contactId: 'ana' }),
        op({ id: 'outro', contactId: 'paulo' }),
      ],
      AGORA,
    );

    expect(fila).toHaveLength(2);
    const ana = fila.find((f) => f.contactId === 'ana')!;
    expect(ana.oportunidades).toEqual(['lote-1', 'lote-2', 'lote-3']);
  });

  it('sem contactId, o telefone identifica — mesmo formatado diferente', () => {
    const fila = agruparPorContato(
      [op({ id: 'a', phone: '5512988073788' }), op({ id: 'b', phone: '+55 (12) 98807-3788' })],
      AGORA,
    );
    expect(fila).toHaveLength(1);
  });

  it('dono diferente NÃO funde — conflito de carteira tem que aparecer', () => {
    const fila = agruparPorContato(
      [
        op({ id: 'a', contactId: 'ana', assignedSellerId: 's1' }),
        op({ id: 'b', contactId: 'ana', assignedSellerId: 's2' }),
      ],
      AGORA,
    );
    expect(fila).toHaveLength(2);
  });

  it('sem nada que identifique, cada linha continua sendo ela mesma', () => {
    const fila = agruparPorContato([op({ id: 'a' }), op({ id: 'b' })], AGORA);
    expect(fila).toHaveLength(2);
  });

  it('A ARMADILHA: tentativa registrada numa irmã conta para o contato inteiro', () => {
    // Sem somar, a irmã de tentativas=0 volta como "nunca_tocado", sobe no topo da
    // fila, e o SDR liga de novo achando que o lead nunca foi tocado.
    const fila = ordenarFila(
      agruparPorContato(
        [
          op({ id: 'ja-liguei', contactId: 'ana', tentativas: 1 }),
          op({ id: 'irma-intocada', contactId: 'ana', tentativas: 0 }),
        ],
        AGORA,
      ),
      AGORA,
    );

    expect(fila).toHaveLength(1);
    expect(fila[0].tentativas).toBe(1);
    expect(fila[0].prioridade).toBe('em_andamento');
  });

  it('promessa de retorno é do contato: uma irmã pausada segura o lead inteiro', () => {
    const fila = ordenarFila(
      agruparPorContato(
        [
          op({ id: 'livre', contactId: 'ana' }),
          op({ id: 'prometido', contactId: 'ana', pausedUntil: d('2026-09-01T00:00:00Z') }),
        ],
        AGORA,
      ),
      AGORA,
    );

    expect(fila).toEqual([]);
  });

  it('retorno vencido em qualquer irmã põe o lead como retorno_hoje', () => {
    const fila = ordenarFila(
      agruparPorContato(
        [
          op({ id: 'a', contactId: 'ana', tentativas: 2 }),
          op({ id: 'b', contactId: 'ana', pausedUntil: d('2026-08-10T00:00:00Z') }),
        ],
        AGORA,
      ),
      AGORA,
    );

    expect(fila.map((f) => f.prioridade)).toEqual(['retorno_hoje']);
  });

  it('a representante é a mais antiga, e herda o que faltava nela', () => {
    const fila = agruparPorContato(
      [
        op({ id: 'nova', contactId: 'ana', company: 'Log Minas', createdAt: d('2026-08-05T00:00:00Z') }),
        op({ id: 'antiga', contactId: 'ana', company: null, createdAt: d('2026-06-01T00:00:00Z') }),
      ],
      AGORA,
    );

    expect(fila[0].id).toBe('antiga');
    expect(fila[0].company).toBe('Log Minas');
    expect(fila[0].createdAt).toEqual(d('2026-06-01T00:00:00Z'));
  });

  it('histórico das irmãs vem junto, do mais recente para o mais antigo', () => {
    const fila = agruparPorContato(
      [
        op({ id: 'a', contactId: 'ana', activities: [{ createdAt: d('2026-08-02T00:00:00Z') }] }),
        op({ id: 'b', contactId: 'ana', activities: [{ createdAt: d('2026-08-09T00:00:00Z') }] }),
      ],
      AGORA,
    );

    expect(fila[0].activities?.map((a) => a.createdAt)).toEqual([
      d('2026-08-09T00:00:00Z'),
      d('2026-08-02T00:00:00Z'),
    ]);
  });
});
