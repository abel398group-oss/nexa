import { describe, expect, it } from 'vitest';
import { decidirDonos, type ContextoDaDistribuicao, type LeadParaDistribuir } from './lead-distribution';

const lead = (id: string, contactId: string | null = null): LeadParaDistribuir => ({ id, contactId });

function ctx(p: Partial<ContextoDaDistribuicao> = {}): ContextoDaDistribuicao {
  return {
    alvos: ['mateus', 'uelder'],
    donoDoContato: new Map(),
    aindaNaCasa: new Set(['mateus', 'uelder']),
    ...p,
  };
}

describe('distribuição de lote', () => {
  it('lead sem dono vai no rodízio, na ordem dos alvos', () => {
    const d = decidirDonos([lead('a'), lead('b'), lead('c')], ctx());
    expect(d.map((x) => x.dono)).toEqual(['mateus', 'uelder', 'mateus']);
    expect(d.every((x) => x.carteiraVaga)).toBe(true);
  });

  it('O BUG: contato que já tem dono NÃO é sorteado de novo', () => {
    // Reimportar a mesma lista criava oportunidade nova sem dono; o rodízio dava ela
    // para outro SDR e sobrescrevia o dono do contato. Os dois ligavam para o mesmo lead.
    const d = decidirDonos([lead('nova-op', 'rota-certa')], ctx({
      donoDoContato: new Map([['rota-certa', 'mateus']]),
      alvos: ['uelder'],
    }));

    expect(d[0].dono).toBe('mateus');
    // carteiraVaga=false é o que impede a gravação do ownerSellerId no contato.
    expect(d[0].carteiraVaga).toBe(false);
  });

  it('o rodízio não perde a vez com os leads que já tinham dono', () => {
    // Se o rodízio avançasse também nos respeitados, uelder receberia o 'c' e mateus
    // ficaria com um lead novo só — torto sem motivo.
    const d = decidirDonos(
      [lead('a'), lead('ja-tem-dono', 'x'), lead('b'), lead('c')],
      ctx({ donoDoContato: new Map([['x', 'terceiro']]), aindaNaCasa: new Set(['mateus', 'uelder', 'terceiro']) }),
    );
    expect(d.map((x) => x.dono)).toEqual(['mateus', 'terceiro', 'uelder', 'mateus']);
  });

  it('dono que saiu da empresa não segura carteira — volta pro rodízio', () => {
    const d = decidirDonos([lead('a', 'x')], ctx({
      donoDoContato: new Map([['x', 'quem-saiu']]),
      aindaNaCasa: new Set(['mateus', 'uelder']),
    }));
    expect(d[0].dono).toBe('mateus');
    expect(d[0].carteiraVaga).toBe(true);
  });

  it('dono de férias CONTINUA com a carteira', () => {
    // Férias tiram o vendedor de RECEBER lead novo (`naoAusente` na consulta de alvos),
    // não do que já é dele. Repartir a carteira de quem volta semana que vem é o
    // caminho mais curto para o contato duplo.
    const d = decidirDonos([lead('a', 'x')], ctx({
      donoDoContato: new Map([['x', 'de-ferias']]),
      alvos: ['mateus'],
      aindaNaCasa: new Set(['mateus', 'de-ferias']),
    }));
    expect(d[0].dono).toBe('de-ferias');
    expect(d[0].carteiraVaga).toBe(false);
  });

  it('dois leads do mesmo contato na MESMA rodada vão para o mesmo dono', () => {
    const d = decidirDonos([lead('a', 'x'), lead('b', 'x')], ctx());
    expect(d[0].dono).toBe('mateus');
    expect(d[1].dono).toBe('mateus');
    // O segundo não regrava o contato — o primeiro já resolveu.
    expect(d[1].carteiraVaga).toBe(false);
  });

  it('lead sem contato nenhum entra no rodízio e não trava', () => {
    const d = decidirDonos([lead('a', null), lead('b', null)], ctx());
    expect(d.map((x) => x.dono)).toEqual(['mateus', 'uelder']);
  });

  it('donoDoContato com valor nulo é tratado como carteira vaga', () => {
    const d = decidirDonos([lead('a', 'x')], ctx({ donoDoContato: new Map([['x', null]]) }));
    expect(d[0].dono).toBe('mateus');
    expect(d[0].carteiraVaga).toBe(true);
  });

  it('sem alvo nenhum devolve vazio em vez de estourar', () => {
    expect(decidirDonos([lead('a')], ctx({ alvos: [] }))).toEqual([]);
  });

  it('fila vazia não quebra', () => {
    expect(decidirDonos([], ctx())).toEqual([]);
  });
});
