// Status da conexão do WhatsApp (sessão WAHA) — consumido pelo Dashboard e pela
// Saúde dos Números. GET /whatsapp/status (protegido só por login).
import { api } from './api';

export interface WhatsappStatus {
  configured: boolean;
  status: string; // WORKING | STOPPED | FAILED | SCAN_QR_CODE | STARTING | UNREACHABLE | NOT_CONFIGURED | HTTP_x
  connected: boolean;
  downSince: string | null;
  downMinutes: number | null;
  checkedAt: string;
}

export async function getWhatsappStatus(): Promise<WhatsappStatus> {
  const r = await api.get('/whatsapp/status');
  return r.data;
}

// Reinicia a sessão do WhatsApp (recuperar de "Falha na sessão" / reparear via QR).
//
// `linha` é obrigatório na prática desde a divisão de números: reiniciar sem
// dizer qual derruba a linha principal — que costuma ser a que estava
// funcionando. Continua opcional na assinatura só para não quebrar chamadas
// antigas, mas a tela sempre passa.
export async function restartWhatsappSession(linha?: string): Promise<{ ok: boolean; reason?: string }> {
  const r = await api.post('/sender/session/restart', null, { params: linha ? { linha } : undefined });
  return r.data;
}

export interface WhatsappLinha {
  linha: string;
  configurada: boolean;
  status: string;
  conectada: boolean;
}

// Linhas configuradas no servidor + estado de cada uma.
export async function listWhatsappLinhas(): Promise<WhatsappLinha[]> {
  const r = await api.get('/sender/session/linhas');
  return r.data;
}

export interface WhatsappQr {
  status: string; // WORKING | SCAN_QR_CODE | STARTING | FAILED | STOPPED | UNKNOWN
  qr?: string;    // data URL (image/png) — só quando aguardando leitura
  reason?: string;
}

// QR de pareamento + status atual (para a tela mostrar o código a escanear).
export async function getWhatsappQr(linha?: string): Promise<WhatsappQr> {
  const r = await api.get('/sender/session/qr', { params: linha ? { linha } : undefined });
  return r.data;
}

/** Rótulo da linha para a tela. `principal` é o número que já existia. */
export function linhaLabel(linha: string): string {
  if (linha === 'principal') return 'Principal — alertas e cotação';
  if (linha === 'vendas') return 'Vendas — prospecção';
  return linha;
}

// Rótulo amigável do estado bruto da sessão (pt-BR).
export function whatsappStatusLabel(s: WhatsappStatus): string {
  if (s.connected) return 'Conectado';
  if (!s.configured || s.status === 'NOT_CONFIGURED') return 'Não configurado';
  switch (s.status) {
    case 'SCAN_QR_CODE': return 'Aguardando leitura do QR';
    case 'STARTING': return 'Iniciando…';
    case 'STOPPED': return 'Parado';
    case 'FAILED': return 'Falha na sessão';
    case 'UNREACHABLE': return 'Servidor WAHA inacessível';
    default:
      return s.status?.startsWith('HTTP_') ? 'Erro de comunicação' : 'Fora do ar';
  }
}

// 'ok' | 'off' | 'idle' — cor do indicador.
export function whatsappStatusTone(s: WhatsappStatus): 'ok' | 'off' | 'idle' {
  if (s.connected) return 'ok';
  if (!s.configured || s.status === 'NOT_CONFIGURED') return 'idle';
  return 'off';
}
