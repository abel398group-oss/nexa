import { describe, expect, it } from 'vitest';
import { montarLinhaDoTempo } from './timeline';
import type { CampanhaRecebida } from '../api/sdr.api';
import type { AtividadeRecente } from '../types/sdr.types';

const atividade = (p: Partial<AtividadeRecente>): AtividadeRecente => ({
  id: 'a1',
  type: 'call',
  result: 'atendeu',
  notes: null,
  createdAt: '2026-08-10T12:00:00.000Z',
  ...p,
});

const campanha = (p: Partial<CampanhaRecebida>): CampanhaRecebida => ({
  campaignId: 'c1',
  name: 'Campanha',
  channel: 'email',
  status: 'sent',
  sentAt: '2026-08-10T09:00:00.000Z',
  createdAt: '2026-08-09T08:00:00.000Z',
  ...p,
});

describe('montarLinhaDoTempo', () => {
  it('intercala os dois tipos em ordem cronológica decrescente', () => {
    const eventos = montarLinhaDoTempo(
      [atividade({ id: 'ligacao', createdAt: '2026-08-10T15:00:00.000Z' })],
      [campanha({ campaignId: 'email-manha', sentAt: '2026-08-10T09:00:00.000Z' })],
    );

    expect(eventos.map((e) => e.kind)).toEqual(['atividade', 'campanha']);
  });

  it('campanha sem sentAt (na fila, ainda não saiu) usa createdAt — não some da timeline', () => {
    const eventos = montarLinhaDoTempo(
      [],
      [campanha({ sentAt: null, createdAt: '2026-08-11T00:00:00.000Z' })],
    );

    expect(eventos).toHaveLength(1);
    expect(eventos[0].quando).toBe('2026-08-11T00:00:00.000Z');
  });

  it('sem nenhum dos dois, devolve lista vazia', () => {
    expect(montarLinhaDoTempo([], [])).toEqual([]);
  });

  it('mistura vários de cada tipo e mantém a ordem só pela data, não pelo tipo', () => {
    const eventos = montarLinhaDoTempo(
      [
        atividade({ id: 'a-meio', createdAt: '2026-08-10T10:00:00.000Z' }),
        atividade({ id: 'a-mais-nova', createdAt: '2026-08-12T00:00:00.000Z' }),
      ],
      [
        campanha({ campaignId: 'c-mais-antiga', sentAt: '2026-08-01T00:00:00.000Z' }),
        campanha({ campaignId: 'c-entre', sentAt: '2026-08-11T00:00:00.000Z' }),
      ],
    );

    expect(
      eventos.map((e) => (e.kind === 'atividade' ? e.atividade.id : e.campanha.campaignId)),
    ).toEqual(['a-mais-nova', 'c-entre', 'a-meio', 'c-mais-antiga']);
  });
});
