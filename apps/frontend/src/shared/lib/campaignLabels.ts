/**
 * Rótulos em português para os estados técnicos de campanha (2026-08-01).
 *
 * O painel mostrava os valores crus do banco ("queued", "skipped", "draft") e
 * NUNCA mostrava o motivo do `error` — então o usuário via "skipped" sem saber
 * se o número era cliente do TMS, concorrente ou repetido. Com 4 motivos de
 * pulo diferentes, isso virou informação essencial.
 *
 * Valores desconhecidos caem no próprio valor (nunca quebra a tela).
 */

/** Estado da CAMPANHA: draft | running | paused | done */
const CAMPAIGN_STATUS_PT: Record<string, string> = {
  draft: 'Rascunho',
  running: 'Enviando',
  paused: 'Pausada',
  done: 'Concluída',
};

/** Estado do DESTINATÁRIO: queued | sending | sent | failed | skipped */
const TARGET_STATUS_PT: Record<string, string> = {
  queued: 'Na fila',
  sending: 'Enviando',
  sent: 'Enviado',
  failed: 'Falhou',
  skipped: 'Não enviado',
};

/**
 * Motivo do pulo (coluna `error` quando status='skipped').
 * Espelha os motivos gravados em sender.service.ts / email-campaign-sender.
 */
const SKIP_REASON_PT: Record<string, string> = {
  tms_cliente: 'Já é cliente do HiperTMS',
  ja_enviado: 'Já recebeu campanha anterior',
  bloqueado: 'Bloqueado (concorrente)',
  suspeito_concorrente: 'Parece concorrente',
  opted_out: 'Descadastrado (pediu para sair)',
  // Elegibilidade do telefone (phone-eligibility.ts)
  nao_brasileiro: 'Número de fora do Brasil',
  telefone_fixo: 'Telefone fixo (não tem WhatsApp)',
  ddd_invalido: 'DDD não existe',
  tamanho_invalido: 'Número com tamanho inválido',
  telefone_invalido: 'Telefone inválido',
};

export function campaignStatusLabel(status: string): string {
  return CAMPAIGN_STATUS_PT[(status || '').toLowerCase()] ?? status;
}

export function targetStatusLabel(status: string): string {
  return TARGET_STATUS_PT[(status || '').toLowerCase()] ?? status;
}

export function skipReasonLabel(error: string | null | undefined): string | null {
  const e = (error || '').trim();
  if (!e) return null;
  // Motivo conhecido → texto amigável. Desconhecido (ex.: erro do WAHA) → o
  // texto cru mesmo, truncado, que é melhor que esconder a causa da falha.
  return SKIP_REASON_PT[e.toLowerCase()] ?? (e.length > 60 ? `${e.slice(0, 60)}…` : e);
}
