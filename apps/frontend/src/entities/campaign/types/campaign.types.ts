// Tipos do domínio "campanha de disparo" (FSD — entities/campaign).
export interface Campaign {
  id: string;
  name: string;
  channel?: string;
  template: string;
  subject?: string | null;
  status: string;
  scheduledAt?: string | null;
  counts: Record<string, number>;
}

// Detalhe de uma campanha (modal): campanha + alvos + contadores.
export interface CampaignDetail {
  campaign: Campaign;
  targets: unknown[];
  counts: Record<string, number>;
}

// Resultado da criação de campanha (mensagem de sucesso lê included/skippedOptOut).
export interface CampaignCreateResult {
  included?: number;
  skippedOptOut?: number;
  _count?: { targets?: number };
  [k: string]: unknown;
}

// Número de envio (WhatsApp) com warm-up e limites — superset usado pela tela
// de Saúde dos Números e (parcialmente) pelo formulário de campanha.
export interface SenderNumber {
  id: string;
  phone: string;
  active: boolean;
  dailyLimit: number;
  sentToday: number;
  hourlyLimit: number;
  sentThisHour: number;
  warmupStage: number;
  effectiveDailyLimit: number;
}

// Janela de horário de envio (GET/PUT /sender/settings).
export interface SenderSettings {
  waStartHour: number;
  waEndHour: number;
  emailStartHour: number;
  emailEndHour: number;
}

// Mídia hospedada (retorno de /campaigns/upload).
export interface CampaignMedia {
  url: string;
  name: string;
}
