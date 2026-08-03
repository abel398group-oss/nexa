import { Injectable, Logger } from '@nestjs/common';

export interface SendResult {
  sent: boolean;
  reason?: string;
  externalId?: string;
  /**
   * DISP-021: só faz sentido quando `sent === false`.
   *
   * `true`  — o WAHA REJEITOU o envio (4xx, sessão não configurada, fora do
   *           allowlist). A mensagem com certeza não saiu: pode marcar falha e
   *           reenviar sem medo.
   * `false` — NÃO SABEMOS. Timeout, queda de rede ou 5xx: o WAHA pode ter
   *           entregue a mensagem e só não ter conseguido responder a tempo.
   *           Tratar como falha aqui gera DUPLICATA no reenvio — foi o que
   *           aconteceu com o Mateus em 2026-08-03 (mensagem chegou 11:35, o
   *           reenvio mandou de novo 11:45).
   */
  definitive?: boolean;
}

export interface StatusPostResult {
  sent: boolean;
  reason?: string;
  postId?: string; // id do post no Status do WhatsApp
}

// Cliente do WAHA — envia mensagens de saída pro WhatsApp (Nexa → WAHA → cliente).
@Injectable()
export class WahaClientService {
  private readonly logger = new Logger('WahaClient');

  private get baseUrl() {
    return process.env.WAHA_API_URL ?? '';
  }
  private get session() {
    return process.env.WAHA_SESSION ?? 'default';
  }
  get configured(): boolean {
    return !!this.baseUrl && !!process.env.WAHA_API_KEY;
  }

  // allowlist de segurança: se setada, só envia pros números listados (evita spam em teste)
  private allowed(phone: string): boolean {
    const list = (process.env.WAHA_SEND_ALLOWLIST ?? '').split(',').map((p) => p.trim()).filter(Boolean);
    if (list.length === 0) return true; // vazio = libera geral
    return list.includes(phone);
  }

  // envia um arquivo (PDF/Word/imagem) via WAHA, por URL
  async sendFile(phone: string, fileUrl: string, filename: string, caption?: string): Promise<SendResult> {
    if (!this.configured) return { sent: false, reason: 'waha_nao_configurado' };
    if (!this.allowed(phone)) return { sent: false, reason: 'fora_do_allowlist' };
    const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
    const ext = (filename.split('.').pop() ?? '').toLowerCase();
    const mimetype =
      ext === 'pdf' ? 'application/pdf'
      : ext === 'doc' ? 'application/msword'
      : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : ext === 'png' ? 'image/png'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : 'application/octet-stream';
    try {
      const res = await fetch(`${this.baseUrl}/api/sendFile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Api-Key': process.env.WAHA_API_KEY as string },
        body: JSON.stringify({ session: this.session, chatId, file: { url: fileUrl, filename, mimetype }, caption }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.logger.error(`WAHA sendFile ${res.status}: ${(await res.text()).slice(0, 160)}`);
        return { sent: false, reason: `waha_${res.status}` };
      }
      return { sent: true };
    } catch (e: any) {
      this.logger.error(`WAHA sendFile falhou: ${e?.message}`);
      return { sent: false, reason: 'erro_rede' };
    }
  }

  // ── Canal Status WhatsApp (ADR-026) ──────────────────────────────────────────
  // Publica um texto no Status (Story) do WhatsApp — visível a todos os contatos
  // salvos, sem destinatário individual. Não usa allowlist (broadcast interno).
  async sendStatusText(text: string, backgroundColor = '#075E54', font = 0): Promise<StatusPostResult> {
    if (!this.configured) return { sent: false, reason: 'waha_nao_configurado' };
    try {
      const res = await fetch(`${this.baseUrl}/api/${this.session}/status/text`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Api-Key': process.env.WAHA_API_KEY as string },
        body: JSON.stringify({ text, backgroundColor, font }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.logger.error(`WAHA sendStatusText ${res.status}: ${(await res.text()).slice(0, 160)}`);
        return { sent: false, reason: `waha_${res.status}` };
      }
      const data: any = await res.json().catch(() => ({}));
      return { sent: true, postId: data?.id?._serialized ?? data?.id ?? data?.key?.id ?? undefined };
    } catch (e: any) {
      this.logger.error(`WAHA sendStatusText falhou: ${e?.message}`);
      return { sent: false, reason: 'erro_rede' };
    }
  }

  // Publica uma imagem (ou vídeo) no Status do WhatsApp com legenda opcional.
  async sendStatusImage(fileUrl: string, caption?: string): Promise<StatusPostResult> {
    if (!this.configured) return { sent: false, reason: 'waha_nao_configurado' };
    try {
      const res = await fetch(`${this.baseUrl}/api/${this.session}/status/image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Api-Key': process.env.WAHA_API_KEY as string },
        body: JSON.stringify({ file: { url: fileUrl }, caption }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.logger.error(`WAHA sendStatusImage ${res.status}: ${(await res.text()).slice(0, 160)}`);
        return { sent: false, reason: `waha_${res.status}` };
      }
      const data: any = await res.json().catch(() => ({}));
      return { sent: true, postId: data?.id?._serialized ?? data?.id ?? data?.key?.id ?? undefined };
    } catch (e: any) {
      this.logger.error(`WAHA sendStatusImage falhou: ${e?.message}`);
      return { sent: false, reason: 'erro_rede' };
    }
  }

  async sendText(phone: string, text: string): Promise<SendResult> {
    if (!this.configured) {
      this.logger.warn('WAHA não configurado — mensagem NÃO enviada ao WhatsApp');
      return { sent: false, reason: 'waha_nao_configurado', definitive: true };
    }
    if (!this.allowed(phone)) {
      this.logger.warn(`Envio bloqueado por allowlist: ${phone}`);
      return { sent: false, reason: 'fora_do_allowlist', definitive: true };
    }

    const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
    try {
      const res = await fetch(`${this.baseUrl}/api/sendText`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Api-Key': process.env.WAHA_API_KEY as string },
        body: JSON.stringify({ session: this.session, chatId, text }),
        // DISP-021: 30s. Com 15s o WAHA sob carga estourava o prazo DEPOIS de já
        // ter entregue a mensagem, e o envio entrava como falha (ver `definitive`).
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`WAHA sendText ${res.status}: ${body.slice(0, 160)}`);
        // 4xx = o WAHA recusou (não saiu). 5xx = pode ter saído antes de quebrar.
        return { sent: false, reason: `waha_${res.status}`, definitive: res.status < 500 };
      }
      const data: any = await res.json().catch(() => ({}));
      return { sent: true, externalId: data?.id?._serialized ?? data?.id ?? undefined };
    } catch (e: any) {
      // timeout/rede: a mensagem PODE ter ido. Nunca assumir que não foi.
      const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      this.logger.error(`WAHA sendText falhou (${timeout ? 'timeout' : 'rede'}): ${e?.message}`);
      return { sent: false, reason: timeout ? 'timeout_sem_confirmacao' : 'erro_rede', definitive: false };
    }
  }

  // ── Gestão da sessão (reconectar número) ────────────────────────────────────
  // Estado atual: WORKING | SCAN_QR_CODE | STARTING | FAILED | STOPPED
  async getSessionStatus(): Promise<{ status: string } | null> {
    if (!this.configured) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions/${this.session}`, {
        headers: { 'X-Api-Key': process.env.WAHA_API_KEY as string },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const data: any = await res.json().catch(() => ({}));
      return { status: data?.status ?? 'UNKNOWN' };
    } catch {
      return null;
    }
  }

  // Reinicia a sessão (recupera de FAILED e força novo pareamento por QR
  // quando o aparelho foi desvinculado do WhatsApp).
  async restartSession(): Promise<{ ok: boolean; reason?: string }> {
    if (!this.configured) return { ok: false, reason: 'waha_nao_configurado' };
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions/${this.session}/restart`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Api-Key': process.env.WAHA_API_KEY as string },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        this.logger.error(`WAHA restart ${res.status}: ${(await res.text()).slice(0, 160)}`);
        return { ok: false, reason: `waha_${res.status}` };
      }
      return { ok: true };
    } catch (e: any) {
      this.logger.error(`WAHA restart falhou: ${e?.message}`);
      return { ok: false, reason: 'erro_rede' };
    }
  }

  // QR de pareamento como data URL (image/png) + status atual.
  // Se já estiver WORKING, não há QR (retorna só o status).
  async getQr(): Promise<{ status: string; qr?: string; reason?: string }> {
    if (!this.configured) return { status: 'UNKNOWN', reason: 'waha_nao_configurado' };
    const st = await this.getSessionStatus();
    const status = st?.status ?? 'UNKNOWN';
    if (status === 'WORKING') return { status };
    try {
      const res = await fetch(`${this.baseUrl}/api/${this.session}/auth/qr?format=image`, {
        headers: { 'X-Api-Key': process.env.WAHA_API_KEY as string, Accept: 'image/png' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { status, reason: `waha_${res.status}` };
      const buf = Buffer.from(await res.arrayBuffer());
      return { status, qr: `data:image/png;base64,${buf.toString('base64')}` };
    } catch (e: any) {
      return { status, reason: 'erro_rede' };
    }
  }
}
