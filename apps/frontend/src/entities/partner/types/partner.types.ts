// Tipos do domínio "parceiro" (FSD — entities/partner).
// F7 (RevOps): empresa parceira EXTERNA (ex.: fornecedor de pneus) que recebe
// lead qualificado por indicação. NÃO é um tenant — nunca acessa o Nexa.
export interface Partner {
  id: string;
  name: string;
  /** Segmento do parceiro — ex.: 'pneus'. Texto livre (evolui sem migration). */
  type: string;
  active: boolean;
  contactEmail?: string | null;
  contactPhone?: string | null;
  createdAt: string;
}

// Dados de criação/edição (form da tela Parceiros).
export interface PartnerInput {
  name: string;
  type: string;
  contactEmail?: string;
  contactPhone?: string;
}
