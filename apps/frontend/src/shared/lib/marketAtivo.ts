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
 * Lê o market ativo e re-renderiza quando ele muda.
 *
 * `fallback` é o primeiro market da lista, para a tela não abrir vazia enquanto
 * ninguém escolheu — mas ele NÃO é gravado: gravar transformaria um palpite em
 * escolha, e é assim que se volta a mandar mensagem para o market errado.
 */
export function useMarketAtivo(fallback?: string): [string, (code: string) => void] {
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

  const escolher = useCallback((novo: string) => setMarketAtivo(novo || null), []);

  return [code || fallback || '', escolher];
}
