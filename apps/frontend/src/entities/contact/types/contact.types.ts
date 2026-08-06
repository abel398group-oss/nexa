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
  notes?: string | null;
  // F16: dono da conta no CRM interno — manual, não vem do TMS.
  accountOwner?: string | null;
  createdAt: string;
}

// Dados de criação/edição manual (form do CRM).
export interface ContactInput {
  phone: string;
  name?: string;
  company?: string;
  email?: string;
  notes?: string;
  accountOwner?: string;
}

// F16: item do histórico de chamados de um contato (painel do Inbox).
export interface ContactTicket {
  id: string;
  ticketNumber: number | null;
  status: string;
  ticketCategory: string | null;
  ticketPriority: string | null;
  createdAt: string;
  lastActivityAt: string | null;
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
  offset?: number;
  tag?: string;
  status?: string; // 'active' | 'opted_out'
}

// Tag com contagem de contatos (para filtros e seletor de público).
export interface TagCount {
  tag: string;
  count: number;
}

// Uma campanha que um contato recebeu (histórico via CampaignTarget).
export interface ContactCampaign {
  campaignId: string;
  name: string;
  channel: string; // whatsapp | email
  status: string; // queued | sending | sent | failed | skipped
  sentAt: string | null;
  createdAt: string;
}

export interface ContactListResult {
  items: Contact[];
  total: number;
}

/**
 * Número banido pelo "3 strikes" (guard de saída da Lia — bloqueou 3x uma
 * tentativa de manipulação, ex.: preço inventado, vazamento de dado, ofensa).
 * A Lia para de responder o telefone em silêncio até alguém desbanir aqui.
 */
export interface BannedContact {
  id: string;
  phone: string;
  strikeCount: number;
  lastViolation: string | null;
  lastDetail: string | null;
  lastAt: string | null;
  bannedAt: string;
}
