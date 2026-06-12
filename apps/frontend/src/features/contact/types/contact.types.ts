// Tipos do domínio "contato" (FSD — espelha o padrão do HiperTMS).
export interface Contact {
  id: string;
  phone: string;
  name?: string;
  company?: string;
  email?: string;
  leadStatus?: string;
  status?: string; // active | opted_out
  source?: string;
  tags?: string[];
  createdAt: string;
}

// Dados de criação/edição manual (form do CRM).
export interface ContactInput {
  phone: string;
  name?: string;
  company?: string;
  email?: string;
}

// Linha de importação em lote (CSV já parseado).
export interface ImportContactInput {
  phone: string;
  name?: string;
  company?: string;
  source: string;
  tags?: string[];
}

export interface ContactListParams {
  search?: string;
  limit?: number;
  tag?: string;
}

// Tag com contagem de contatos (para filtros e seletor de público).
export interface TagCount {
  tag: string;
  count: number;
}

export interface ContactListResult {
  items: Contact[];
  total: number;
}
