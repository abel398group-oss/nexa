import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { getMarketAtivo, marketPadrao, setMarketAtivo, useMarketAtivo } from './marketAtivo';

/**
 * O que este arquivo protege é a única coisa que o bug de 17/08/2026 provou ser
 * frágil: DUAS telas perguntando "qual market?" e recebendo respostas diferentes.
 * Por isso quase todo teste aqui monta dois hooks e compara os dois.
 */
describe('useMarketAtivo', () => {
  beforeEach(() => sessionStorage.clear());

  it('sem escolha nenhuma, cai no fallback', () => {
    const { result } = renderHook(() => useMarketAtivo([{ code: 'hipertms', status: 'active' }]));
    expect(result.current[0]).toBe('hipertms');
  });

  // O ponto do arquivo inteiro: escolher numa aba muda a outra na mesma janela.
  // `storage` não serve — ele só dispara para OUTRAS abas do navegador.
  it('escolher num lugar muda em todos', () => {
    const cabecalho = renderHook(() => useMarketAtivo([{ code: 'hipertms', status: 'active' }]));
    const mensagens = renderHook(() => useMarketAtivo([{ code: 'hipertms', status: 'active' }]));

    act(() => cabecalho.result.current[1]('agabe'));

    expect(cabecalho.result.current[0]).toBe('agabe');
    expect(mensagens.result.current[0]).toBe('agabe');
  });

  // O fallback é palpite, não escolha. Se ele fosse gravado, a primeira tela a
  // renderizar decidiria pelas outras — que é exatamente a deriva que o hook
  // existe para acabar, só que mais difícil de enxergar.
  it('o fallback não vira escolha gravada', () => {
    renderHook(() => useMarketAtivo([{ code: 'hipertms', status: 'active' }]));
    expect(getMarketAtivo()).toBeNull();
  });

  // Duas telas podem ter fallbacks diferentes (uma lista todos os markets, outra
  // só os liberados). Havendo escolha, o fallback de ninguém conta.
  it('havendo escolha, o fallback de cada tela é ignorado', () => {
    setMarketAtivo('agabe');

    const todos = renderHook(() => useMarketAtivo([{ code: 'hipertms', status: 'active' }]));
    const liberados = renderHook(() => useMarketAtivo([{ code: 'outro', status: 'active' }]));

    expect(todos.result.current[0]).toBe('agabe');
    expect(liberados.result.current[0]).toBe('agabe');
  });

  it('limpar a escolha devolve a tela ao fallback', () => {
    const { result } = renderHook(() => useMarketAtivo([{ code: 'hipertms', status: 'active' }]));

    act(() => result.current[1]('agabe'));
    act(() => result.current[1](''));

    expect(getMarketAtivo()).toBeNull();
    expect(result.current[0]).toBe('hipertms');
  });

  // Aba anônima com storage bloqueado, ou cota estourada: a tela pode ficar sem
  // memória, não pode ficar em branco.
  it('sem sessionStorage, não explode', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')!;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('bloqueado'); },
    });
    try {
      const { result } = renderHook(() => useMarketAtivo([{ code: 'hipertms', status: 'active' }]));
      expect(result.current[0]).toBe('hipertms');
      act(() => result.current[1]('agabe'));
    } finally {
      Object.defineProperty(window, 'sessionStorage', original);
    }
  });
});

/**
 * O palpite da tela. Existe porque "primeiro da lista" tem um significado que só
 * aparece quando a lista está ordenada por nome — e aí `agabe`, o mercado de teste
 * em rascunho, ganha do HiperTMS que está no ar.
 */
describe('marketPadrao', () => {
  it('prefere o liberado, mesmo quando o rascunho vem primeiro', () => {
    expect(marketPadrao([
      { code: 'd', status: 'draft' },
      { code: 'hipertms', status: 'active' },
    ])).toBe('hipertms');
  });

  it('sem nenhum liberado, cai no primeiro — a operação inteira está em montagem', () => {
    expect(marketPadrao([
      { code: 'd', status: 'draft' },
      { code: 'outro', status: 'paused' },
    ])).toBe('d');
  });

  // Suspenso não é liberado: o vendedor não o enxerga no Disparo, então abrir nele
  // mostraria uma tela que não pode disparar nada.
  it('suspenso não conta como liberado', () => {
    expect(marketPadrao([
      { code: 'pausado', status: 'paused' },
      { code: 'hipertms', status: 'active' },
    ])).toBe('hipertms');
  });

  it('lista vazia não tem palpite', () => {
    expect(marketPadrao([])).toBeUndefined();
  });
});

/**
 * Mercado apagado não pode continuar escolhido.
 *
 * A escolha vive na sessão do navegador e sobrevivia ao mercado: apagado o
 * `sverino-bot`, o cockpit seguia dizendo "vendendo Sverino Bot" e oferecendo criar
 * campanha para ele. O disparo recusaria no fim — a trava de mercado exige um que
 * exista — mas só depois da campanha inteira escrita.
 */
describe('useMarketAtivo — mercado que não existe mais', () => {
  it('descarta o guardado quando ele sumiu da lista', async () => {
    setMarketAtivo('sverino-bot');
    const { result } = renderHook(() =>
      useMarketAtivo([{ code: 'hipertms', status: 'active' }], { listaCompleta: true }),
    );

    await waitFor(() => expect(result.current[0]).toBe('hipertms'));
    expect(getMarketAtivo()).toBeNull();
  });

  it('mantém o guardado quando ele ainda existe', async () => {
    setMarketAtivo('hipertms');
    const { result } = renderHook(() =>
      useMarketAtivo(
        [
          { code: 'hipertms', status: 'active' },
          { code: 'pneus', status: 'draft' },
        ],
        { listaCompleta: true },
      ),
    );

    expect(result.current[0]).toBe('hipertms');
    expect(getMarketAtivo()).toBe('hipertms');
  });

  // Lista vazia é também o estado de "ainda carregando": limpar ali apagaria a
  // escolha legítima a cada abertura de tela.
  it('lista vazia não descarta nada', () => {
    setMarketAtivo('hipertms');
    renderHook(() => useMarketAtivo([], { listaCompleta: true }));
    expect(getMarketAtivo()).toBe('hipertms');
  });
});

/**
 * Lista PARCIAL não descarta.
 *
 * A tela de Listas de lead pede só os mercados liberados. Um mercado em rascunho
 * legitimamente escolhido não aparece ali — e apagar a escolha por isso jogaria
 * fora a decisão do operador toda vez que ele abrisse aquela aba.
 */
describe('useMarketAtivo — lista parcial', () => {
  it('sem listaCompleta, o guardado sobrevive mesmo fora da lista', () => {
    setMarketAtivo('pneus');
    const { result } = renderHook(() =>
      useMarketAtivo([{ code: 'hipertms', status: 'active' }]),
    );

    expect(result.current[0]).toBe('pneus');
    expect(getMarketAtivo()).toBe('pneus');
  });
});
