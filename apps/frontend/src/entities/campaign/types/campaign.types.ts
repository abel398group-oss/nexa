// Tipos do domínio "campanha de disparo" (FSD — entities/campaign).
export interface Campaign {
  id: string;
  name: string;
  channel?: string;
  type?: string; // 'message' (padrão) | 'status'
  template: string;
  subject?: string | null;
  status: string;
  scheduledAt?: string | null;
  statusPostedAt?: string | null;
  counts: Record<string, number>;
}

// Detalhe de uma campanha (modal): campanha + alvos + contadores.
export interface CampaignDetail {
  campaign: Campaign;
  targets: unknown[];
  /** Contagem por status da campanha INTEIRA — não muda com paginação/filtro. */
  counts: Record<string, number>;
  /** DISP-003: total que casa com o filtro atual (base da paginação da lista). */
  matching?: number;
  engagement?: { delivered: number; read: number; replied: number };
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
  /**
   * Saúde de engajamento das últimas 24h (freio anti-queima — sender-health.ts).
   * Opcional: vem null quando a apuração falha, e a tela simplesmente omite o bloco
   * em vez de mostrar zeros que pareceriam um número morto.
   */
  health?: {
    sent: number;
    replied: number;
    failed: number;
    replyRate: number;
    failureRate: number;
    healthy: boolean;
    reason?: string;
  } | null;
}

// Janela de horário de envio (GET/PUT /sender/settings).
export interface SenderSettings {
  waStartHour: number;
  waEndHour: number;
  emailStartHour: number;
  emailEndHour: number;
  /**
   * O AMBIENTE permite reenvio total de campanha (inclui quem já recebeu).
   * Somente leitura — não é config de tenant, vem de CAMPAIGN_RESEND_ALL_ENABLED
   * no servidor. Ferramenta de teste; desligada em produção.
   */
  resendAllEnabled?: boolean;
}

// Mídia hospedada (retorno de /campaigns/upload).
export interface CampaignMedia {
  url: string;
  name: string;
}
