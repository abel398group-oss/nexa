// Tipos do domínio "vendedor" (FSD — entities/seller).
export interface Seller {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  /** ADR 034 ("Estou fora"): true → handoff também notifica no WhatsApp do vendedor. */
  outOfOffice?: boolean;
  /**
   * "Ausente até" (módulo 1): férias, atestado, afastamento. Enquanto a data não passa,
   * não entra na distribuição de lote nem na lista de closers.
   *
   * Data e não booleano porque ausência tem fim — quem voltou ontem volta a receber hoje
   * sem ninguém precisar desmarcar. Não confundir com `outOfOffice` acima.
   */
  awayUntil?: string | null;
  assignedCount: number;
  loginEmail?: string | null;
}

// KPIs de conversão por vendedor (GET /metrics/sellers).
export interface SellerKpi {
  id: string;
  name: string;
  leads: number;
  emAndamento: number;
  ganhos: number;
  perdidos: number;
  taxaConversao: number;
  // F7 (RevOps): atividade registrada manualmente pelo vendedor
  // (SellerActivity). Diferente dos campos acima, que derivam do que a IA
  // processou — estes medem o trabalho humano: telefone e e-mail.
  calls: number;
  emails: number;
  notes: number;
}

// Forma reduzida usada em seletores (ex.: reatribuir lead no Inbox).
export interface SellerMini {
  id: string;
  name: string;
}

// Dados de criação/edição (form da tela Vendedores).
export interface SellerInput {
  name: string;
  phone: string;
  email?: string;
  password?: string;
}
