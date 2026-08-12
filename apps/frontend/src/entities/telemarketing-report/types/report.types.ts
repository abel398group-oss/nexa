// Relatório comercial — espelha GET /api/telemarketing/report.

/**
 * `percentual: null` NÃO é zero: é "não tenho dado suficiente para afirmar".
 *
 * A tela precisa mostrar "—" nesse caso. Renderizar 0% seria uma afirmação que o backend
 * deliberadamente se recusou a fazer.
 */
export interface TaxaCalculada {
  percentual: number | null;
  amostraPequena: boolean;
  base: number;
}

export interface LoteNoRelatorio {
  nome: string;
  productCode: string;
  recebidos: number;
  validos: number;
  oportunidades: number;
  ganhos: number;
  perdidos: number;
  emAndamento: number;
  conversao: TaxaCalculada;
}

export interface VendedorNoRelatorio {
  nome: string;
  atividades: number;
  atendeu: number;
  passouCloser: number;
  ganhos: number;
  aproveitamento: TaxaCalculada;
}

export interface RelatorioComercial {
  lotes: LoteNoRelatorio[];
  vendedores: VendedorNoRelatorio[];
  roteiros: {
    comparaveis: { versao: number; acoes: number; atendeu: number; percentual: number }[];
    /// Quantas versões ficaram fora por amostra pequena. Sem mostrar isso, quem lê conclui
    /// que só existiram as versões listadas.
    omitidasPorAmostra: number;
  };
}
