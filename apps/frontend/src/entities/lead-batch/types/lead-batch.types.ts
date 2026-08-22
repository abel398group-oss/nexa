// Tipos do módulo 1 do telemarketing (lotes de lead).
// Espelham a resposta de POST/GET /api/lead-batches — ver
// docs/features/telemarketing/prd.md §Módulo 1.

/// Motivos de descarte na peneira de importação. Só `ja_na_base` é forçável, e quem
/// decide isso é o backend: a UI lê o `forcavel` de cada linha e não reimplementa a
/// regra.
export type MotivoDescarte =
  | 'duplicado'
  | 'ja_na_base'
  | 'cliente'
  | 'telefone_invalido'
  | 'email_invalido'
  | 'concorrente'
  | 'opt_out'
  | 'sem_telefone'
  | 'ja_tem_oportunidade';

export interface ContadoresLote {
  received: number;
  duplicate: number;
  invalid: number;
  valid: number;
  /// Quantos válidos chegaram sem nome — decide se a saudação vai sair sem o primeiro
  /// nome na ligação.
  noName: number;
  /// Entraram com lixo na coluna de telefone ("abc", ramal, "não tem"): o e-mail salvou
  /// a linha, mas o SDR não vai poder ligar pra eles.
  foneLixo: number;
  porMotivo: Partial<Record<MotivoDescarte, number>>;
}

export interface DescarteDeLinha {
  /// Número da linha no arquivo, contando o cabeçalho — é o que o operador vê no Excel.
  linha: number;
  motivo: MotivoDescarte;
  forcavel: boolean;
}

export interface RelatorioImportacao {
  /// `null` em prévia: nada foi gravado.
  batchId: string | null;
  contadores: ContadoresLote;
  colunasIgnoradas: string[];
  descartes: DescarteDeLinha[];
}

export interface LeadBatch {
  id: string;
  productCode: string;
  name: string;
  source: string | null;
  consentBasis: string | null;
  receivedCount: number;
  duplicateCount: number;
  invalidCount: number;
  validCount: number;
  noNameCount: number;
  status: string;
  createdAt: string;
}

export interface ImportarLotePayload {
  productCode: string;
  name: string;
  csv: string;
  dryRun: boolean;
  forcarJaNaBase?: boolean;
  /** A coluna "nome" desta lista é o nome fantasia da empresa, não de uma pessoa. */
  nomeEhDaEmpresa?: boolean;
  source?: string;
  consentBasis?: string;
}

export const ROTULO_MOTIVO: Record<MotivoDescarte, string> = {
  duplicado: 'Repetido na própria lista',
  ja_na_base: 'Já está na base',
  cliente: 'Já é cliente',
  telefone_invalido: 'Telefone inválido',
  email_invalido: 'E-mail inválido',
  concorrente: 'Concorrente',
  opt_out: 'Pediu para não receber',
  sem_telefone: 'Sem telefone (limite atual)',
  ja_tem_oportunidade: 'Já tem oportunidade ativa em andamento',
};

/// Por que cada motivo não pode ser forçado. Mostrado no lugar do botão — operador que
/// não sabe o motivo tenta de novo amanhã.
export const PORQUE_TRAVADO: Partial<Record<MotivoDescarte, string>> = {
  opt_out: 'LGPD — não é preferência, é lei',
  email_invalido: 'Endereço morto queima a reputação do domínio',
  cliente: 'Receberia oferta do que já paga',
  concorrente: 'Receberia o roteiro de vendas',
  telefone_invalido: 'Sem canal para contato',
  duplicado: 'Já entrou por outra linha desta lista',
  sem_telefone: 'A base aceita um lead novo sem telefone por vez — acrescente o telefone na planilha',
  ja_tem_oportunidade:
    'O SDR/Closer já está trabalhando este negócio — reimportar criaria uma segunda oportunidade duplicada',
};
