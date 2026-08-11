import { describe, expect, it } from 'vitest';
import { agruparPorBloco, blocoDe, type NegocioAberto } from './closer-today';

const AGORA = new Date('2026-08-11T14:00:00Z');
const d = (iso: string) => new Date(iso);

function n(p: Partial<NegocioAberto> & { id: string }): NegocioAberto {
  return {
    stage: 'qualified',
    meetingAt: null,
    pausedUntil: null,
    updatedAt: AGORA,
    ...p,
  };
}

describe('AGORA — o que tem hora marcada hoje', () => {
  it('reunião hoje mais tarde', () => {
    expect(blocoDe(n({ id: 'a', meetingAt: d('2026-08-11T17:00:00Z') }), AGORA)).toBe('agora');
  });

  it('reunião hoje mais cedo, ainda hoje, continua em AGORA', () => {
    // Reunião das 9h com o painel aberto às 14h: foi hoje, ele pode não ter registrado
    // ainda. Jogar pra "precisa de você" no meio do dia bagunçaria a agenda.
    expect(blocoDe(n({ id: 'a', meetingAt: d('2026-08-11T09:00:00Z') }), AGORA)).toBe('agora');
  });

  it('reunião das 21h de Brasília é HOJE, mesmo sendo amanhã em UTC', () => {
    // A4 da auditoria: 2026-08-12T00:30Z = 21:30 de 11/08 em Brasília. Com getDate()
    // puro num servidor UTC, esta reunião só apareceria em AGORA depois de acontecer.
    expect(blocoDe(n({ id: 'a', meetingAt: d('2026-08-12T00:30:00Z') }), AGORA)).toBe('agora');
  });

  it('reunião amanhã fica em ESPERANDO', () => {
    expect(blocoDe(n({ id: 'a', meetingAt: d('2026-08-12T09:00:00Z') }), AGORA)).toBe(
      'esperando',
    );
  });
});

describe('PRECISA DE VOCÊ — o que parou', () => {
  it('reunião de ontem sem desfecho registrado', () => {
    expect(blocoDe(n({ id: 'a', meetingAt: d('2026-08-10T09:00:00Z') }), AGORA)).toBe(
      'precisa_de_voce',
    );
  });

  it('pausa vencida', () => {
    expect(blocoDe(n({ id: 'a', pausedUntil: d('2026-08-11T08:00:00Z') }), AGORA)).toBe(
      'precisa_de_voce',
    );
  });

  it('recebido do SDR e nada agendado', () => {
    // O lead esfriando na mão do closer é o caso que ninguém vê num kanban.
    expect(blocoDe(n({ id: 'a', stage: 'qualified', meetingAt: null }), AGORA)).toBe(
      'precisa_de_voce',
    );
  });

  it('proposta parada há 8 dias', () => {
    const r = blocoDe(
      n({ id: 'a', stage: 'proposal', updatedAt: d('2026-08-03T14:00:00Z') }),
      AGORA,
    );
    expect(r).toBe('precisa_de_voce');
  });

  it('proposta de anteontem ainda está no prazo', () => {
    const r = blocoDe(
      n({ id: 'a', stage: 'proposal', updatedAt: d('2026-08-09T14:00:00Z') }),
      AGORA,
    );
    expect(r).toBe('esperando');
  });

  it('pausa para o futuro não incomoda', () => {
    expect(blocoDe(n({ id: 'a', pausedUntil: d('2026-09-01T00:00:00Z') }), AGORA)).toBe(
      'esperando',
    );
  });
});

describe('fora do painel', () => {
  it.each(['won', 'lost', 'discarded'])('%s não aparece', (stage) => {
    expect(blocoDe(n({ id: 'a', stage }), AGORA)).toBeNull();
  });
});

describe('agrupamento e ordem', () => {
  it('AGORA sai na ordem do relógio', () => {
    const g = agruparPorBloco(
      [
        n({ id: 'tarde', meetingAt: d('2026-08-11T17:00:00Z') }),
        n({ id: 'cedo', meetingAt: d('2026-08-11T09:00:00Z') }),
      ],
      AGORA,
    );
    expect(g.agora.map((x) => x.id)).toEqual(['cedo', 'tarde']);
  });

  it('PRECISA DE VOCÊ sai do mais parado para o mais recente', () => {
    const g = agruparPorBloco(
      [
        n({ id: 'parado-3d', stage: 'qualified', updatedAt: d('2026-08-08T00:00:00Z') }),
        n({ id: 'parado-30d', stage: 'qualified', updatedAt: d('2026-07-12T00:00:00Z') }),
      ],
      AGORA,
    );
    expect(g.precisa_de_voce.map((x) => x.id)).toEqual(['parado-30d', 'parado-3d']);
  });

  it('painel vazio devolve os três blocos, não undefined', () => {
    // A tela renderiza os três cabeçalhos sempre; bloco ausente quebraria o map.
    expect(agruparPorBloco([], AGORA)).toEqual({
      agora: [],
      precisa_de_voce: [],
      esperando: [],
    });
  });
});
