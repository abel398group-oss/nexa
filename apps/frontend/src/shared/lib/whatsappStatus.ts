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
export async function restartWhatsappSession(): Promise<{ ok: boolean; reason?: string }> {
  const r = await api.post('/sender/session/restart');
  return r.data;
}

export interface WhatsappQr {
  status: string; // WORKING | SCAN_QR_CODE | STARTING | FAILED | STOPPED | UNKNOWN
  qr?: string;    // data URL (image/png) — só quando aguardando leitura
  reason?: string;
}

// QR de pareamento + status atual (para a tela mostrar o código a escanear).
export async function getWhatsappQr(): Promise<WhatsappQr> {
  const r = await api.get('/sender/session/qr');
  return r.data;
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
