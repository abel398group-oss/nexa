import { useCallback, useEffect, useState } from 'react';

/**
 * Market sobre o qual o módulo de vendas está trabalhando.
 *
 * ## Por que virou estado compartilhado
 *
 * Cada aba do cockpit tinha o SEU seletor, com `useState('')` próprio: Mensagens,
 * Listas de Leads e Disparos. Três escolhas para a mesma pergunta, todas
 * começando vazias e caindo no primeiro market da lista.
 *
 * O estrago não é o clique repetido — é a deriva. Em 17/08/2026 o cabeçalho dizia
 * HiperTMS, a aba de Markets estava aberta no HiperTMS, e o seletor de Mensagens
 * abriu em `agabe`. Escrever a mensagem ali a mandaria para o market errado, sem
 * nada na tela contradizendo.
 *
 * `sessionStorage` e não `localStorage`, igual ao cliente ativo (`actingTenant`):
 * a escolha morre com a aba. Market lembrado entre sessões é a mesma deriva
 * disfarçada de conveniência.
 *
 * Não confundir com o CLIENTE ativo. São perguntas diferentes que a mesma barra
 * responde lado a lado: de quem é a conta, e o que está sendo vendido.
 */
const KEY = 'nexa_market_ativo';

/** Notifica as outras abas do cockpit na mesma janela — `storage` só cruza abas do navegador. */
const EVENTO = 'nexa:market-ativo';

export function getMarketAtivo(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setMarketAtivo(code: string | null): void {
  try {
    if (code) sessionStorage.setItem(KEY, code);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: code }));
}

/**
 * Qual market a tela mostra enquanto ninguém escolheu.
 *
 * "O primeiro da lista" parecia inofensivo até a lista chegar ordenada por nome: em
 * 18/08/2026 o cabeçalho abriu em `agabe (rascunho)` — um mercado de teste, sem
 * conhecimento e sem mensagem — enquanto todo o resto da tela dizia HiperTMS.
 * Rascunho é o mercado que ainda NÃO pode vender; abrir nele é começar errado.
 *
 * Liberado primeiro, e só depois o primeiro que houver. Se nenhum estiver liberado,
 * não há escolha boa a fazer — mas aí a tela inteira está em montagem, e o rascunho
 * é o assunto mesmo.
 */
export function marketPadrao(markets: { code: string; status?: string }[]): string | undefined {
  return (markets.find((m) => m.status === 'active') ?? markets[0])?.code;
}

/**
 * Lê o market ativo e re-renderiza quando ele muda.
 *
 * `fallback` é o palpite da tela (ver `marketPadrao`), para ela não abrir vazia
 * enquanto ninguém escolheu — mas ele NÃO é gravado: gravar transformaria um palpite
 * em escolha, e é assim que se volta a mandar mensagem para o market errado.
 */
export function useMarketAtivo(
  markets: { code: string; status?: string }[] = [],
  opcoes: { listaCompleta?: boolean } = {},
): [string, (code: string) => void] {
  const [code, setCode] = useState<string | null>(() => getMarketAtivo());

  useEffect(() => {
    const aoMudar = () => setCode(getMarketAtivo());
    window.addEventListener(EVENTO, aoMudar);
    window.addEventListener('storage', aoMudar);
    return () => {
      window.removeEventListener(EVENTO, aoMudar);
      window.removeEventListener('storage', aoMudar);
    };
  }, []);

  /**
   * Mercado guardado que não existe mais é DESCARTADO.
   *
   * A escolha vive na sessão do navegador e sobrevive ao mercado: apagado o
   * `sverino-bot`, a tela continuava dizendo "vendendo Sverino Bot" e oferecendo
   * criar campanha para ele. O disparo até recusaria no fim (a trava de mercado
   * pede um mercado que exista), mas só depois da campanha inteira escrita.
   *
   * A lista VAZIA não descarta nada: ela também é o estado de "ainda carregando",
   * e limpar ali apagaria a escolha legítima a cada abertura de tela.
   */
  useEffect(() => {
    // `listaCompleta` é o que separa "o mercado não existe" de "esta tela não
    // mostra este mercado". A tela de Listas pede só os LIBERADOS: um mercado em
    // rascunho legitimamente escolhido não está lá, e apagá-lo por isso jogaria
    // fora a escolha do operador toda vez que ele abrisse aquela aba.
    if (!opcoes.listaCompleta || !markets.length || !code) return;
    if (!markets.some((m) => m.code === code)) setMarketAtivo(null);
  }, [markets, code, opcoes.listaCompleta]);

  const escolher = useCallback((novo: string) => setMarketAtivo(novo || null), []);

  return [code || marketPadrao(markets) || '', escolher];
}
