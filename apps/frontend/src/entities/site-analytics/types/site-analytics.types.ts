/** Tipos da audiência do site. Espelham o retorno de GET /api/analytics/site. */

export interface PontoDiario {
  /** YYYY-MM-DD */
  dia: string;
  visitas: number;
  /**
   * Visitantes distintos NAQUELE dia. O hash de visitante muda à meia-noite por
   * decisão de privacidade, então este número só é "gente distinta" dentro do dia.
   */
  unicos: number;
}

export interface ItemContado {
  rotulo: string;
  visitas: number;
}

export interface VisaoGeralSite {
  visitas: number;
  /**
   * SOMA dos únicos de cada dia, não gente distinta no período: quem visitou terça
   * e quinta conta duas vezes. Consequência do hash rotativo; a tela precisa
   * rotular isso, e não chamar de "visitantes únicos" seco.
   */
  unicosPorDia: number;
  /**
   * Recortes do período (18/08/2026). `visitas` acima é TUDO, incluindo o time entrando
   * no painel — no HiperTMS eram 19 de 40 num período de 7 dias. Estes quatro é que
   * respondem a pergunta da tela: a campanha trouxe gente?
   */
  visitasSite: number;
  /** Gente distinta no período — diferente de `unicosPorDia`, que soma por dia. */
  pessoasSite: number;
  acessosApp: number;
  deCampanha: number;
  cadastros: number;
  serie: PontoDiario[];
  topPaginas: ItemContado[];
  topOrigens: ItemContado[];
  /** Visitas por campanha de disparo (utm_campaign do link marcado). */
  topCampanhas: ItemContado[];
  topReferrers: ItemContado[];
  dispositivos: ItemContado[];
}
