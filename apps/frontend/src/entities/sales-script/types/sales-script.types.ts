// Roteiro do SDR por mercado (módulo 1, itens 3-6).
// Espelha /api/sales-scripts/:productCode.

export interface Objecao {
  situacao: string;
  resposta: string;
}

export interface SalesScript {
  id: string;
  productCode: string;
  version: number;
  active: boolean;
  aberturaCall: string | null;
  aberturaWhatsapp: string | null;
  aberturaEmail: string | null;
  assuntoEmail: string | null;
  objecoes: Objecao[] | null;
  createdAt: string;
}

/// Campos opcionais: a tela salva um item por vez, e o backend herda o que não vier da
/// versão anterior. Mandar o objeto inteiro a cada salvamento apagaria edições feitas
/// por outra pessoa entre a abertura do popup e o clique em salvar.
export interface RoteiroInput {
  aberturaCall?: string;
  aberturaWhatsapp?: string;
  aberturaEmail?: string;
  assuntoEmail?: string;
  objecoes?: Objecao[];
}

/// Os quatro itens de texto, na ordem em que aparecem na tela. As aberturas são
/// separadas por canal por motivo técnico: o WhatsApp mostra asterisco literal e o
/// e-mail precisa de assunto.
export const ITENS_DO_ROTEIRO = [
  {
    campo: 'aberturaCall' as const,
    titulo: 'Abertura da ligação',
    dica: 'As primeiras frases ao telefone. É o que decide se a conversa continua.',
  },
  {
    campo: 'aberturaWhatsapp' as const,
    titulo: 'Abertura do WhatsApp',
    dica: 'Texto curto. Evite asterisco — o WhatsApp mostra o caractere.',
  },
  {
    campo: 'aberturaEmail' as const,
    titulo: 'Abertura do e-mail',
    dica: 'O único que tem assunto.',
  },
];
