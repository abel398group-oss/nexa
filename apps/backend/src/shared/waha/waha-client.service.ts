import { Injectable, Logger, Optional } from '@nestjs/common';
import { NumberBudgetService } from './number-budget.service';

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

/** Opções de envio — `origin` rotula o débito no orçamento do número. */
export interface SendOptions {
  /**
   * Simula presença antes de mandar: marca a conversa como lida e mostra
   * "digitando…" por um tempo proporcional ao texto.
   *
   * Ligado só onde faz sentido (resposta em conversa, disparo de campanha). Um
   * alerta automático para o admin não precisa fingir que alguém digitou.
   */
  presence?: boolean;
  /** Rótulo do caminho de envio: `campaign`, `lia`, `monitor`, `janitor`, … */
  origin?: string;
  /**
   * Por qual LINHA sai (2026-08-13). Ausente = linha principal, que é o
   * comportamento de sempre — nada muda para quem não passa nada.
   *
   * Linha é o número, não a sessão do WAHA: com dois containers as duas sessões
   * se chamam `default`, então o nome da sessão não distingue nada. Ver
   * `resolveLinha()`.
   */
  linha?: string;
}

/**
 * Onde cada linha vive. `principal` é o número que já existe (alertas, cotação
 * e tudo mais); as demais são opcionais e caem na principal quando não
 * configuradas — assim uma linha mal configurada envia pelo número certo em vez
 * de falhar em silêncio.
 *
 * Convenção de env: `WAHA_<LINHA>_API_URL` · `_API_KEY` · `_SESSION`.
 * Exemplo para a linha `vendas`: `WAHA_VENDAS_API_URL=http://waha-vendas:3000`.
 */
export interface WahaTarget {
  baseUrl: string;
  apiKey: string;
  session: string;
}

export const LINHA_PRINCIPAL = 'principal';

/**
 * Linhas configuradas: a principal (sempre) mais as declaradas em `WAHA_LINHAS`.
 *
 * O painel precisa disto porque a lista vive só no ambiente do servidor — sem
 * esta função a tela não teria como saber que existe um segundo número, e o
 * botão de reconectar continuaria mirando às cegas na principal.
 */
/**
 * Telefone do chip pareado, tirado da resposta de `/api/sessions/{session}`.
 *
 * O campo é `me.id` ("5512997880659@c.us"). **Nunca `me.number`**: em outros endpoints
 * do WAHA esse campo vem sem código de país e não é telefone válido — foi exatamente o
 * erro que fez a resolução de LID gravar número inválido em 16/08/2026. `id` é o que
 * carrega o número completo.
 *
 * Só existe quando a sessão está pareada; em SCAN_QR_CODE o WAHA não tem `me`.
 */
export function telefonePareado(sessao: any): string | null {
  const id = sessao?.me?.id;
  if (typeof id !== 'string') return null;
  // Corta no `@` E no `:`. O sufixo depois dos dois-pontos é o número do APARELHO
  // ("5512997880659:15@s.whatsapp.net"); colado no telefone ele produz 15 dígitos que
  // passariam pela checagem de tamanho abaixo e virariam um número que não existe.
  const digitos = id.split('@')[0]?.split(':')[0]?.replace(/\D/g, '') ?? '';
  // Sanidade: telefone com DDI tem 12 ou 13 dígitos no Brasil. Fora dessa faixa é
  // identificador interno, e devolver isso viraria um número falso na tela de saúde.
  return digitos.length >= 12 && digitos.length <= 13 ? digitos : null;
}

export function linhasConfiguradas(): string[] {
  const extras = (process.env.WAHA_LINHAS ?? '')
    .split(',')
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
  return [LINHA_PRINCIPAL, ...extras.filter((l) => l !== LINHA_PRINCIPAL)];
}

const PRESENCE_ENABLED = () => process.env.WHATSAPP_PRESENCE_ENABLED !== 'false';
const TYPING_MAX_MS = () => Number(process.env.WHATSAPP_TYPING_MAX_MS ?? 5000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cliente do WAHA — envia mensagens de saída pro WhatsApp (Nexa → WAHA → cliente).
@Injectable()
export class WahaClientService {
  private readonly logger = new Logger('WahaClient');

  // Opcional de propósito: várias specs constroem este cliente posicionalmente
  // (`new WahaClientService()`), e contar envio não pode ser condição para
  // enviar. Sem o serviço o envio segue normal, só não é debitado.
  constructor(@Optional() private readonly budget?: NumberBudgetService) {}

  private get baseUrl() {
    return process.env.WAHA_API_URL ?? '';
  }
  private get session() {
    return process.env.WAHA_SESSION ?? 'default';
  }
  get configured(): boolean {
    return !!this.baseUrl && !!process.env.WAHA_API_KEY;
  }

  /**
   * A linha tem env próprio configurado? (`WAHA_<LINHA>_API_URL`)
   *
   * DISP-022: o disparo de CAMPANHA usa isto para recusar o start e pausar o tick
   * quando a linha da campanha não existe — prospecção fria saindo pelo chip de
   * atendimento é exatamente o que o fallback do `resolveLinha` produzia em
   * silêncio. O fallback continua existindo para RESPOSTA em conversa (lá, não
   * responder é pior que responder pelo número errado).
   */
  linhaEstaConfigurada(linha?: string): boolean {
    if (!linha || linha === LINHA_PRINCIPAL) return this.configured;
    const p = `WAHA_${linha.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_`;
    return !!process.env[`${p}API_URL`];
  }

  /**
   * Resolve a linha para o container/sessão onde ela vive.
   *
   * Linha desconhecida ou sem env cai na PRINCIPAL de propósito: mandar pelo
   * número principal é errado, mas não mandar é pior — e o log diz qual foi.
   * Lida a cada chamada (não em campo) para respeitar mudança de env em runtime
   * e teste, mesmo padrão do resto do arquivo.
   *
   * ⚠️ Vale para RESPOSTA em conversa. Campanha NÃO passa por este fallback:
   * o worker checa `linhaEstaConfigurada` antes de despachar (DISP-022).
   */
  resolveLinha(linha?: string): WahaTarget {
    const principal: WahaTarget = {
      baseUrl: this.baseUrl,
      apiKey: process.env.WAHA_API_KEY ?? '',
      session: this.session,
    };
    if (!linha || linha === LINHA_PRINCIPAL) return principal;

    const p = `WAHA_${linha.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_`;
    const baseUrl = process.env[`${p}API_URL`];
    if (!baseUrl) {
      this.logger.warn(`Linha "${linha}" sem ${p}API_URL — enviando pela linha principal`);
      return principal;
    }
    return {
      baseUrl,
      apiKey: process.env[`${p}API_KEY`] ?? principal.apiKey,
      session: process.env[`${p}SESSION`] ?? 'default',
    };
  }

  // allowlist de segurança: se setada, só envia pros números listados (evita spam em teste)
  private allowed(phone: string): boolean {
    const list = (process.env.WAHA_SEND_ALLOWLIST ?? '').split(',').map((p) => p.trim()).filter(Boolean);
    if (list.length === 0) return true; // vazio = libera geral
    return list.includes(phone);
  }

  // envia um arquivo (PDF/Word/imagem) via WAHA, por URL
  async sendFile(phone: string, fileUrl: string, filename: string, caption?: string, origin?: string, linha?: string): Promise<SendResult> {
    const alvo = this.resolveLinha(linha);
    if (!alvo.baseUrl || !alvo.apiKey) return { sent: false, reason: 'waha_nao_configurado' };
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
      const res = await fetch(`${alvo.baseUrl}/api/sendFile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Api-Key': alvo.apiKey },
        body: JSON.stringify({ session: alvo.session, chatId, file: { url: fileUrl, filename, mimetype }, caption }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.logger.error(`WAHA sendFile ${res.status}: ${(await res.text()).slice(0, 160)}`);
        return { sent: false, reason: `waha_${res.status}` };
      }
      await this.debit(origin ?? 'anexo', linha);
      return { sent: true };
    } catch (e: any) {
      this.logger.error(`WAHA sendFile falhou: ${e?.message}`);
      await this.debit(origin ?? 'anexo', linha);
      return { sent: false, reason: 'erro_rede' };
    }
  }

  // ── Canal Status WhatsApp (ADR-026) ──────────────────────────────────────────
  // Publica um texto no Status (Story) do WhatsApp — visível a todos os contatos
  // salvos, sem destinatário individual. Não usa allowlist (broadcast interno).
  async sendStatusText(text: string, backgroundColor = '#075E54', font = 0, linha?: string): Promise<StatusPostResult> {
    const alvo = this.resolveLinha(linha);
    if (!alvo.baseUrl || !alvo.apiKey) return { sent: false, reason: 'waha_nao_configurado' };
    try {
      const res = await fetch(`${alvo.baseUrl}/api/${alvo.session}/status/text`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Api-Key': alvo.apiKey },
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
  async sendStatusImage(fileUrl: string, caption?: string, linha?: string): Promise<StatusPostResult> {
    const alvo = this.resolveLinha(linha);
    if (!alvo.baseUrl || !alvo.apiKey) return { sent: false, reason: 'waha_nao_configurado' };
    try {
      const res = await fetch(`${alvo.baseUrl}/api/${alvo.session}/status/image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Api-Key': alvo.apiKey },
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

  // ── Presença (anti-bloqueio) ────────────────────────────────────────────────
  // Um número que nunca marca mensagem como lida e responde do nada em 1,5s é
  // perfil de robô — a documentação do WAHA lista "sendSeen" e "startTyping"
  // como as primeiras recomendações contra bloqueio. Os endpoints sempre
  // existiram; só não eram chamados.
  //
  // Best-effort por definição: falha de presença NUNCA pode impedir o envio da
  // mensagem em si, então estes três engolem o erro e seguem (só log em debug).
  private async presenceCall(path: string, phone: string): Promise<void> {
    if (!this.configured) return;
    const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
    try {
      await fetch(`${this.baseUrl}/api/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Api-Key': process.env.WAHA_API_KEY as string },
        body: JSON.stringify({ session: this.session, chatId }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch (e: any) {
      this.logger.debug(`presença ${path} falhou para ${phone}: ${e?.message}`);
    }
  }

  /** Marca a conversa como lida (dá o "check azul" nas mensagens recebidas). */
  async sendSeen(phone: string): Promise<void> {
    return this.presenceCall('sendSeen', phone);
  }

  /** Liga o "digitando…" no aparelho de quem vai receber. */
  async startTyping(phone: string): Promise<void> {
    return this.presenceCall('startTyping', phone);
  }

  /** Desliga o "digitando…". */
  async stopTyping(phone: string): Promise<void> {
    return this.presenceCall('stopTyping', phone);
  }

  /**
   * Quanto tempo "digitando" antes de mandar. Proporcional ao tamanho do texto
   * (a doc do WAHA pede "random interval depending on the size"), com teto para
   * não travar o worker de campanha, e piso para não parecer instantâneo.
   */
  private typingDelayMs(text: string): number {
    const base = 800 + text.length * 25;
    const jitter = Math.random() * 700;
    return Math.min(Math.round(base + jitter), TYPING_MAX_MS());
  }

  async sendText(phone: string, text: string, opts: SendOptions = {}): Promise<SendResult> {
    // A linha decide o container e a sessão. Sem `opts.linha` isto devolve
    // exatamente o que os getters devolviam antes — nenhum chamador muda.
    const alvo = this.resolveLinha(opts.linha);

    if (!alvo.baseUrl || !alvo.apiKey) {
      this.logger.warn('WAHA não configurado — mensagem NÃO enviada ao WhatsApp');
      return { sent: false, reason: 'waha_nao_configurado', definitive: true };
    }
    if (!this.allowed(phone)) {
      this.logger.warn(`Envio bloqueado por allowlist: ${phone}`);
      return { sent: false, reason: 'fora_do_allowlist', definitive: true };
    }

    if (opts.presence && PRESENCE_ENABLED()) {
      await this.sendSeen(phone);
      await this.startTyping(phone);
      await sleep(this.typingDelayMs(text));
      await this.stopTyping(phone);
    }

    const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
    try {
      const res = await fetch(`${alvo.baseUrl}/api/sendText`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Api-Key': alvo.apiKey },
        body: JSON.stringify({ session: alvo.session, chatId, text }),
        // DISP-021: 30s. Com 15s o WAHA sob carga estourava o prazo DEPOIS de já
        // ter entregue a mensagem, e o envio entrava como falha (ver `definitive`).
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`WAHA sendText ${res.status}: ${body.slice(0, 160)}`);
        // 4xx = o WAHA recusou (não saiu). 5xx = pode ter saído antes de quebrar.
        const definitive = res.status < 500;
        // 5xx entra no orçamento: a mensagem PODE ter saído, e um teto que
        // subestima o que o número mandou não serve para nada. Mesmo critério
        // do DISP-021 usado no worker de campanha.
        if (!definitive) await this.debit(opts.origin, opts.linha);
        return { sent: false, reason: `waha_${res.status}`, definitive };
      }
      const data: any = await res.json().catch(() => ({}));
      await this.debit(opts.origin, opts.linha);
      return { sent: true, externalId: data?.id?._serialized ?? data?.id ?? undefined };
    } catch (e: any) {
      // timeout/rede: a mensagem PODE ter ido. Nunca assumir que não foi.
      const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      this.logger.error(`WAHA sendText falhou (${timeout ? 'timeout' : 'rede'}): ${e?.message}`);
      await this.debit(opts.origin, opts.linha);
      return { sent: false, reason: timeout ? 'timeout_sem_confirmacao' : 'erro_rede', definitive: false };
    }
  }

  /**
   * Debita um envio no orçamento do número. Nunca lança — ver NumberBudgetService.
   *
   * `linha` importa: sem ela o orçamento da linha vendas cairia no mesmo balde
   * da principal, e as duas mostrariam um teto que não é o delas.
   */
  private async debit(origin?: string, linha?: string): Promise<void> {
    await this.budget?.record(origin ?? 'outros', linha ?? LINHA_PRINCIPAL).catch(() => undefined);
  }

  // ── Gestão da sessão (reconectar número) ────────────────────────────────────
  //
  // Os três métodos abaixo aceitam LINHA desde 13/08/2026. Sem isso o painel só
  // enxergava o número principal, e o segundo número não teria como ser pareado
  // pela tela — nem no primeiro dia, nem nas quedas seguintes, que são o caso
  // que mais dói (sessão cai, e quem recupera precisa do QR na hora).
  //
  // Estado atual: WORKING | SCAN_QR_CODE | STARTING | FAILED | STOPPED
  async getSessionStatus(linha?: string): Promise<{ status: string; phone: string | null } | null> {
    const alvo = this.resolveLinha(linha);
    if (!alvo.baseUrl || !alvo.apiKey) return null;
    try {
      const res = await fetch(`${alvo.baseUrl}/api/sessions/${alvo.session}`, {
        headers: { 'X-Api-Key': alvo.apiKey },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const data: any = await res.json().catch(() => ({}));
      return { status: data?.status ?? 'UNKNOWN', phone: telefonePareado(data) };
    } catch {
      return null;
    }
  }

  // Reinicia a sessão (recupera de FAILED e força novo pareamento por QR
  // quando o aparelho foi desvinculado do WhatsApp).
  async restartSession(linha?: string): Promise<{ ok: boolean; reason?: string }> {
    const alvo = this.resolveLinha(linha);
    if (!alvo.baseUrl || !alvo.apiKey) return { ok: false, reason: 'waha_nao_configurado' };
    try {
      const res = await fetch(`${alvo.baseUrl}/api/sessions/${alvo.session}/restart`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Api-Key': alvo.apiKey },
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
  async getQr(linha?: string): Promise<{ status: string; qr?: string; reason?: string }> {
    const alvo = this.resolveLinha(linha);
    if (!alvo.baseUrl || !alvo.apiKey) return { status: 'UNKNOWN', reason: 'waha_nao_configurado' };
    const st = await this.getSessionStatus(linha);
    const status = st?.status ?? 'UNKNOWN';
    if (status === 'WORKING') return { status };
    try {
      const res = await fetch(`${alvo.baseUrl}/api/${alvo.session}/auth/qr?format=image`, {
        headers: { 'X-Api-Key': alvo.apiKey, Accept: 'image/png' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { status, reason: `waha_${res.status}` };
      const buf = Buffer.from(await res.arrayBuffer());
      return { status, qr: `data:image/png;base64,${buf.toString('base64')}` };
    } catch (e: any) {
      // REGRA 3: nenhum caminho de erro sai calado. Sem isto, "não aparece o QR"
      // chegava ao suporte sem nada no log para dizer se foi rede, timeout ou
      // sessão — e o único sintoma era a tela em branco.
      this.logger.warn(`WAHA getQr falhou (status=${status}): ${e?.message}`);
      return { status, reason: 'erro_rede' };
    }
  }
}
