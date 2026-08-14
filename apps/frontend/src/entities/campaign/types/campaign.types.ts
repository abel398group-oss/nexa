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
  /** Linha de WhatsApp por onde dispara (13/08/2026). Ausente = 'principal' (campanha antiga). */
  linha?: string;
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
  /**
   * DISP-009: alvos marcados como enviados que o WhatsApp nunca confirmou.
   *
   * `status` diz o que o worker fez; o `ack` diz o que voltou. Os dois podiam
   * divergir sem aviso — inclusive de propósito, porque uma entrega não
   * confirmada é gravada como 'sent' para não gerar reenvio duplicado
   * (DISP-021). Número alto aqui costuma ser sessão do WAHA instável: o disparo
   * "funcionou" e a mensagem pode não ter chegado a ninguém.
   */
  deliveryUnconfirmed?: number;
}

// Resultado da criação de campanha (mensagem de sucesso lê included/skippedOptOut).
export interface CampaignCreateResult {
  included?: number;
  skippedOptOut?: number;
  /** E-mail: endereços com devolução permanente — nunca mais recebem. */
  skippedBounced?: number;
  /** E-mail: endereços que nem chegam a ser um endereço (linha vazia, sem @). */
  skippedInvalid?: number;
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
  /**
   * Uso REAL do número, somando todos os canais (NumberBudgetService).
   *
   * `sentToday` acima conta só o disparo de campanha. O mesmo chip também
   * responde lead, manda digest do Monitor, avisa vendedor e fecha conversa —
   * é este bloco que mostra quanto ele realmente mandou. Global ao número, não
   * por tenant.
   *
   * Opcional: vem null quando a apuração falha (ex.: Redis fora), e a tela
   * omite o bloco em vez de mostrar zeros que pareceriam um chip ocioso.
   */
  budget?: {
    today: number;
    thisHour: number;
    byOrigin: Record<string, number>;
    dailyCeiling: number;
    hourlyCeiling: number;
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

/** Contato que receberá a campanha de e-mail (pré-visualização). */
export interface AudienceContact {
  id: string;
  name: string | null;
  email: string | null;
  company: string | null;
  createdAt: string;
}

export interface EmailAudience {
  items: AudienceContact[];
  /** Total que casa com a BUSCA atual. */
  total: number;
  /** Total que realmente receberá (ignora a busca). */
  totalAudiencia: number;
}
