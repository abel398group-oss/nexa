/**
 * market-readiness.ts — a trava de liberação do mercado (ADR 037).
 *
 * Mercado nasce em `draft` e o vendedor não o enxerga. Só vira `active` quando tem o
 * mínimo para funcionar. Não é burocracia: cada peça faltando tem consequência.
 *
 *   • sem conhecimento → a Lia não tem o que responder. Ela é proibida por prompt de
 *     afirmar o que não está na base, então ou trava ou improvisa.
 *   • sem modelo de mensagem → o operador digita do zero toda vez, e a base de
 *     produção vira o que já é hoje: "Cópia de Cópia de teste".
 *   • sem vendedor ativo → o lead quente é atribuído a ninguém e esfria no inbox.
 *
 * Liberar um mercado vazio é soltar a Lia falando de um produto que ela não conhece,
 * com um parceiro assistindo.
 *
 * Função PURA de propósito: a decisão é a parte que precisa de teste, e ela não deveria
 * exigir banco para ser verificada.
 */

/** O que foi contado no banco para decidir. */
export interface MarketCounts {
  /** Artigos aprovados E sem pendência de fonte. */
  conhecimentoUtil: number;
  /** Artigos aprovados que ainda dependem de confirmação de fonte. */
  conhecimentoSemFonte: number;
  /** Modelos de mensagem ativos do mercado. */
  modelos: number;
  /** Vendedores ativos do tenant (com um número de WhatsApp, o time é um só). */
  vendedores: number;
  /** Nome de exibição + remetente preenchidos. */
  temIdentidade: boolean;
}

export interface MarketPendencia {
  /** Chave estável — a tela usa para linkar direto na seção. */
  campo: 'identidade' | 'conhecimento' | 'modelos' | 'vendedores';
  /** Frase que aparece ao lado do botão desabilitado. */
  motivo: string;
  /** false = não impede liberar, mas o operador deveria saber. */
  bloqueia: boolean;
}

export interface MarketReadiness {
  pronto: boolean;
  pendencias: MarketPendencia[];
  /**
   * O que foi contado para chegar ao veredito.
   *
   * Vai junto porque a lista de mercados só sabia dizer o que FALTA. Um mercado
   * sem pendência nenhuma virava uma linha muda — "completo", e nada sobre o
   * tamanho do que existe atrás dele. Com os números na linha, dá para ver de
   * relance que um mercado tem 1483 fatos e o outro tem 3.
   */
  counts: MarketCounts;
}

/** Mínimo de artigos úteis para a Lia não depender de improviso. */
export const MIN_CONHECIMENTO = 3;

export function avaliarMercado(c: MarketCounts): MarketReadiness {
  const pendencias: MarketPendencia[] = [];

  if (!c.temIdentidade) {
    pendencias.push({
      campo: 'identidade',
      motivo: 'Falta o nome de exibição e o remetente do e-mail',
      bloqueia: true,
    });
  }

  if (c.conhecimentoUtil < MIN_CONHECIMENTO) {
    pendencias.push({
      campo: 'conhecimento',
      motivo:
        c.conhecimentoUtil === 0
          ? 'A Lia não tem o que responder sobre este mercado'
          : `Só ${c.conhecimentoUtil} de ${MIN_CONHECIMENTO} fatos aprovados`,
      bloqueia: true,
    });
  }

  if (c.modelos === 0) {
    pendencias.push({
      campo: 'modelos',
      motivo: 'Nenhuma mensagem pronta para o vendedor disparar',
      bloqueia: true,
    });
  }

  if (c.vendedores === 0) {
    pendencias.push({
      campo: 'vendedores',
      motivo: 'Sem vendedor ativo, o lead quente não tem para quem ir',
      bloqueia: true,
    });
  }

  // AVISO, não bloqueio: número sem fonte não impede o mercado de existir, mas quem
  // libera precisa saber que aquilo está lá esperando confirmação — senão descobre
  // quando a Lia repetir "98% de aprovação" para o lead do parceiro.
  if (c.conhecimentoSemFonte > 0) {
    pendencias.push({
      campo: 'conhecimento',
      motivo: `${c.conhecimentoSemFonte} fato(s) com número sem fonte, aguardando confirmação`,
      bloqueia: false,
    });
  }

  return { pronto: !pendencias.some((p) => p.bloqueia), pendencias, counts: c };
}
