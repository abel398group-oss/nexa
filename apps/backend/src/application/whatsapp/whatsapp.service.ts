import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ContactsService } from '@/application/contacts/contacts.service';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { ConversationAgentService } from '@/application/agents/conversation-agent.service';
import { FollowUpService } from '@/application/followup/followup.service';
import { AutonomyService } from '@/shared/governance/autonomy.service';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { TranscriptionService } from '@/shared/ai/transcription.service';
import { InternalNumbersService } from './internal-numbers.service';
import { isOptOutMessage } from './opt-out-detection';
import { OptOutRegistryService } from '@/application/contacts/opt-out-registry.service';

interface Normalized {
  phone: string;
  from: string;
  text: string;
  normalizedText: string;
  isOptOut: boolean;
  isValidBrazilPhone: boolean;
  isMedia: boolean;
  pushName: string;
  shouldProcess: boolean;
}

// QUAL-002: 'cancelar' removido — palavra genérica usada em contextos de negócio (ex: "cancelar pedido")
// que causava falsos opt-outs. Opt-out requer palavras inequívocas (parar, sair, stop, unsubscribe).
// A lista de palavras soltas com `includes` saiu de cena em 2026-08-03: deixava
// passar "para de mandar msg" e, pior, descadastrava quem escrevia "parece
// interessante" ('pare' dentro de 'parece'). Ver opt-out-detection.ts.

const RATE_LIMIT_MS = Number(process.env.INBOUND_RATE_LIMIT_MS ?? 12000); // anti-resposta-dupla (G2)

// Agrupamento de mensagens seguidas (2026-08-08). Até aqui, a 2ª e a 3ª mensagem
// dentro da janela do rate-limit eram GRAVADAS no banco e nunca chegavam à IA: o
// lead escrevia "oi" / "quero saber o preço" / "tenho 8 caminhões" e a Lia
// respondia só ao "oi". O conteúdo que qualificava o lead morria no log.
// Agora elas entram num lote e, quando o lead para de digitar, viram UMA chamada
// de IA com o texto completo — mesmo custo de antes, sem perder a mensagem.
const BATCH_QUIET_MS = Number(process.env.INBOUND_BATCH_QUIET_MS ?? 6000);
// Tetos defensivos: um número em flood não pode crescer o lote sem limite nem
// montar um prompt gigante.
const BATCH_MAX_MSGS = 10;
const BATCH_MAX_CHARS = 4000;

// Carência do eco (ADR 035, 2026-08-08): janela após um envio NOSSO na conversa
// em que um `fromMe` sem correspondência ainda é tratado como eco, não como
// digitação humana. Existe porque o WAHA devolve o eco com um id diferente do
// que usamos no envio — o mesmo motivo do fallback tolerante em handleAck().
// Generosa de propósito: ver o comentário de handleOwnNumberOutbound.
const ECHO_GRACE_MS = Number(process.env.WA_ECHO_GRACE_MS ?? 60_000);

interface PendingBatch {
  texts: string[];
  timer: ReturnType<typeof setTimeout>;
  tenantId: string;
  conversationId: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger('WhatsApp');
  private lastProcessed = new Map<string, number>(); // phone → timestamp
  private pending = new Map<string, PendingBatch>(); // phone → mensagens aguardando o lote

  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly conversations: ConversationsService,
    private readonly agent: ConversationAgentService,
    private readonly followup: FollowUpService,
    private readonly autonomy: AutonomyService,
    private readonly notifications: NotificationsService,
    private readonly transcription: TranscriptionService,
    private readonly emitter: EventEmitter2,
    private readonly internalNumbers: InternalNumbersService,
    private readonly optOutRegistry: OptOutRegistryService,
  ) {}

  // Recibo do WhatsApp (evento message.ack do WAHA): 1=enviado ✓, 2=entregue ✓✓, 3=lido ✓✓azul.
  async handleAck(rawBody: any) {
    const p = rawBody?.payload ?? rawBody?.body?.payload ?? rawBody?.body ?? rawBody ?? {};
    const id = p.id?._serialized ?? p.id ?? p._data?.id?._serialized ?? p._data?.Info?.ID ?? null;
    const ack = Number(p.ack ?? p._data?.ack ?? 0);
    // B4 (auditoria 2026-07-08): payload contém dados pessoais → nível debug (off em produção).
    this.logger.debug(`[ack] recebido id=${id} ack=${ack}`);
    if (!id || !ack || ack < 1) return { ignored: true, reason: 'sem id/ack' };

    // 1) match exato pela externalId salva no envio
    let msg = await this.prisma.aiMessage.findFirst({ where: { externalId: String(id) } });
    // 2) fallback tolerante: casa pelo id puro da mensagem (último segmento),
    //    cobre quando o WAHA manda o prefixo fromMe/chat diferente do envio.
    if (!msg) {
      const tail = String(id).split('_').pop();
      if (tail && tail.length >= 8) {
        msg = await this.prisma.aiMessage.findFirst({
          where: { externalId: { endsWith: tail } },
          orderBy: { createdAt: 'desc' },
        });
        if (msg) this.logger.log(`[ack] casou por fallback (tail=${tail}) -> msg ${msg.id}`);
      }
    }
    if (!msg) {
      this.logger.warn(`[ack] msg NÃO encontrada para externalId=${id} (ack ${ack} descartado)`);
      return { ignored: true, reason: 'msg não encontrada' };
    }
    if (ack <= msg.ack) return { ignored: true, reason: 'ack não avança' };
    this.logger.log(`[ack] atualizando msg ${msg.id}: ${msg.ack} → ${ack}`);
    await this.prisma.aiMessage.update({ where: { id: msg.id }, data: { ack } });
    this.emitter.emit('message.updated', { conversationId: msg.conversationId, id: msg.id, ack }); // ao vivo
    return { ok: true, ack };
  }

  // Replica a normalização validada do MVP n8n (fix @lid, opt-out, validação BR).
  normalize(rawBody: any): Normalized {
    const body = rawBody?.body || rawBody || {};
    const payload = body.payload || body;

    const text =
      payload.body ||
      payload.text ||
      payload.message?.text ||
      payload._data?.body ||
      payload._data?.Message?.conversation ||
      payload._data?.Message?.extendedTextMessage?.text ||
      payload._data?.RawMessage?.conversation ||
      payload._data?.RawMessage?.extendedTextMessage?.text ||
      '';

    const candidates = [
      payload._data?.Info?.SenderAlt,
      payload._data?.Info?.Sender,
      payload._data?.Info?.Chat,
      payload._data?.Info?.RecipientAlt,
      payload.from,
      payload.chatId,
      payload._data?.from,
    ];

    const cleanPhone = (v: any) => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    const isValidBR = (p: string) => p.startsWith('55') && p.length >= 12 && p.length <= 13;

    let phone = '';
    let from = '';
    for (const cand of candidates) {
      const cleaned = cleanPhone(cand);
      if (isValidBR(cleaned)) { phone = cleaned; from = cand; break; }
    }
    if (!phone) {
      for (const cand of candidates) {
        if (cand) { from = cand; phone = cleanPhone(cand); break; }
      }
    }

    const isValidBrazilPhone = isValidBR(phone);
    const normalizedText = String(text).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
    const isOptOut = isOptOutMessage(String(text));
    const isMedia = isValidBrazilPhone && normalizedText.length === 0;

    // nome do contato vindo do WhatsApp (pushName) — exibir no inbox (ADR 020: fonte 'pushname')
    const pany = payload as any;
    const pushName = String(
      pany._data?.Info?.PushName || pany.notifyName || pany._data?.PushName || pany._data?.notifyName || '',
    ).trim();

    return {
      phone,
      from,
      text: String(text),
      normalizedText,
      isOptOut,
      isValidBrazilPhone,
      isMedia,
      pushName,
      shouldProcess: isValidBrazilPhone && normalizedText.length > 0,
    };
  }

  /**
   * Numa mensagem que SAI, o outro lado é o destinatário — `from`/`Sender`
   * somos nós. O normalize() procura o remetente, então não serve aqui.
   */
  private counterpartPhone(rawBody: any): string | null {
    const body = rawBody?.body || rawBody || {};
    const p = body.payload || body;
    const cands = [p.to, p._data?.Info?.Chat, p.chatId, p._data?.Info?.RecipientAlt, p._data?.to];
    for (const c of cands) {
      const limpo = String(c || '').split('@')[0].split(':')[0].replace(/\D/g, '');
      if (limpo.startsWith('55') && limpo.length >= 12 && limpo.length <= 13) return limpo;
    }
    return null;
  }

  /**
   * Mensagem com `fromMe` — saiu do NOSSO número. Duas origens possíveis:
   *
   *   a) eco de um envio do próprio Nexa (a Lia, ou alguém pelo inbox);
   *   b) um humano digitou no celular / WhatsApp Web da empresa.
   *
   * Até 2026-08-08 tudo era descartado como (a), e (b) era invisível: o vendedor
   * assumia a conversa pelo celular e a Lia continuava respondendo por cima
   * dele, porque o takeover da ADR 035 só era ativado por envio pelo inbox.
   *
   * A classificação erra de propósito para o lado de (a). Um falso "é nossa"
   * apenas mantém o comportamento antigo; um falso "é humana" CALA a Lia numa
   * conversa em que ninguém assumiu — pior, e silencioso.
   */
  private async handleOwnNumberOutbound(rawBody: any, tenantId: string) {
    const ignorar = (reason: string) => ({ ignored: true, reason });
    try {
      const texto = this.normalize(rawBody).text?.trim();
      if (!texto) return ignorar('fromMe (sem texto)');

      // 1) foi o Nexa que enviou? Match exato e, depois, pelo id puro — o WAHA
      //    devolve o eco com prefixo diferente do usado no envio (mesmo motivo
      //    do fallback tolerante em handleAck).
      const id = this.messageId(rawBody);
      if (id) {
        const tail = String(id).split('_').pop();
        const nossa = await this.prisma.aiMessage.findFirst({
          where: {
            OR: [
              { externalId: String(id) },
              ...(tail && tail.length >= 8 ? [{ externalId: { endsWith: tail } }] : []),
            ],
          },
          select: { id: true },
        });
        if (nossa) return ignorar('fromMe (eco de envio do Nexa)');
      }

      const phone = this.counterpartPhone(rawBody);
      if (!phone) return ignorar('fromMe (destinatário não identificado)');

      const conv: any = await this.prisma.aiConversation.findFirst({
        where: { tenantId, phone, status: { notIn: ['closed', 'opt_out'] as any } },
        orderBy: { lastActivityAt: 'desc' },
        select: { id: true, humanTakeoverAt: true } as any,
      });
      if (!conv) return ignorar('fromMe (sem conversa aberta)');
      if (conv.humanTakeoverAt) return ignorar('fromMe (takeover já ativo)');

      // 2) carência: logo depois de um envio nosso, um fromMe sem match ainda é
      //    eco com id divergente. Erra para o lado de NÃO calar a Lia.
      const envioRecente = await this.prisma.aiMessage.findFirst({
        where: {
          conversationId: conv.id,
          direction: 'outbound',
          createdAt: { gte: new Date(Date.now() - ECHO_GRACE_MS) },
        },
        select: { id: true },
      });
      if (envioRecente) return ignorar('fromMe (dentro da carência de eco)');

      // 3) idempotência: uma reentrega do webhook não pode gravar duas vezes.
      if (id) {
        try {
          await this.prisma.processedMessage.create({ data: { messageId: String(id) } });
        } catch {
          return ignorar('fromMe (duplicada)');
        }
      }

      // 4) sobrou: humano digitou fora do Nexa. Gravar como outbound byHuman
      //    ativa o takeover da ADR 035. `alreadyDelivered` é obrigatório — sem
      //    ele o addMessage DESPACHA a mensagem e o lead a recebe duas vezes.
      await this.conversations.addMessage(tenantId, conv.id, {
        direction: 'outbound',
        content: texto,
        byHuman: true,
        alreadyDelivered: true,
        metadata: { source: 'whatsapp_direto', externalId: id ?? null },
      });
      this.logger.warn(
        `ADR 035: resposta humana pelo WhatsApp da empresa (${phone}) — takeover ativado, Lia em modo rascunho`,
      );
      return { ok: true, reason: 'fromMe (humano assumiu)', conversationId: conv.id };
    } catch (e: any) {
      // Este caminho NUNCA pode derrubar o webhook: na dúvida, comportamento antigo.
      this.logger.warn(`fromMe: falha ao avaliar takeover — ${e?.message}`);
      return ignorar('fromMe (erro na avaliação)');
    }
  }

  // Ignora eco das próprias mensagens (fromMe) — não processa o que NÓS enviamos.
  private isFromMe(rawBody: any): boolean {
    const p = rawBody?.payload || rawBody?.body?.payload || rawBody?.body || rawBody || {};
    return p.fromMe === true || p._data?.Info?.IsFromMe === true;
  }

  // extrai um ID estável da mensagem (p/ dedup)
  private messageId(rawBody: any): string | null {
    const p = rawBody?.payload || rawBody?.body?.payload || rawBody?.body || rawBody || {};
    return p.id || p._data?.Info?.ID || p._data?.id || null;
  }

  // WhatsApp passou a anonimizar remetentes via LID (<id>@lid), sem o numero.
  // Sem resolver, o normalize() rejeita como "telefone invalido" e a Lia nunca processa.
  private extractLid(rawBody: any): string | null {
    const body = rawBody?.body || rawBody || {};
    const payload = body.payload || body;
    const cands = [
      payload._data?.Info?.Sender,
      payload._data?.Info?.Chat,
      payload._data?.Info?.Participant,
      payload.participant,
      payload.from,
      payload.chatId,
      payload._data?.from,
    ];
    for (const c of cands) {
      const ss = String(c || '');
      if (ss.endsWith('@lid')) return ss;
    }
    return null;
  }

  // Resolve um LID para o numero real (<phone>@c.us) consultando os contatos do WAHA.
  private async resolveLidToPhone(lid: string): Promise<string | null> {
    const base = process.env.WAHA_API_URL;
    const key = process.env.WAHA_API_KEY;
    const session = process.env.WAHA_SESSION ?? 'default';
    if (!base || !lid) return null;
    try {
      const url = `${base.replace(/\/+$/, '')}/api/contacts?session=${session}&contactId=${encodeURIComponent(lid)}`;
      const headers: Record<string, string> = {};
      if (key) headers['X-Api-Key'] = key;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(5_000) }); // SEC-002: timeout
      if (!res.ok) return null;
      const data = (await res.json()) as any;
      // WAHA returns { id: "5512988073788@c.us", number: "234754356076551" (LID user, sem código país) }
      // The real phone (with country code) lives in 'id'; 'number' is the LID user portion — not a valid BR phone.
      // M7 (auditoria 2026-07-08): usa SÓ o 'id' e só devolve se for um telefone BR plausível.
      // O antigo fallback para 'number' podia carimbar a conversa com um número inválido/errado.
      const fromId = String(data?.id ?? '').split('@')[0].replace(/\D/g, '');
      const isValidBR = fromId.startsWith('55') && fromId.length >= 12 && fromId.length <= 13;
      return isValidBR ? fromId : null;
    } catch (e: any) {
      this.logger.warn(`resolveLidToPhone falhou para ${lid}: ${e?.message}`); // SEC-002: log errors
      return null;
    }
  }

  // Extrai a referência de áudio (URL + mimetype) do payload do WAHA, se for áudio.
  private extractAudioRef(rawBody: any): { url: string; mimetype: string } | null {
    const p = rawBody?.payload || rawBody?.body?.payload || rawBody?.body || rawBody || {};
    const media = p.media || p._data?.media || {};
    const url = media.url || p.mediaUrl || p._data?.mediaUrl || '';
    const mimetype = String(media.mimetype || p.mimetype || p._data?.mimetype || '').toLowerCase();
    const type = String(p.type || p._data?.type || '').toLowerCase();
    const isAudio = mimetype.startsWith('audio') || ['ptt', 'audio', 'voice'].includes(type) || !!p._data?.Message?.audioMessage;
    if (!url || !isAudio) return null;
    return { url, mimetype: mimetype || 'audio/ogg' };
  }

  // Baixa o áudio do WAHA, salva uma cópia (p/ tocar no inbox) e transcreve.
  // Retorna { transcript, audioUrl } — null/null se falhar (à prova de falha).
  private async transcribeInboundAudio(rawBody: any): Promise<{ transcript: string | null; audioUrl: string | null }> {
    const empty = { transcript: null as string | null, audioUrl: null as string | null };
    if (!this.transcription.enabled) return empty;
    const ref = this.extractAudioRef(rawBody);
    if (!ref) return empty;
    let dlUrl = ref.url;
    try {
      const base = process.env.WAHA_API_URL;
      if (base) { const u = new URL(ref.url); dlUrl = base.replace(/\/+$/, '') + u.pathname + u.search; }
    } catch { /* mantem ref.url */ }
    try {
      const headers: Record<string, string> = {};
      if (process.env.WAHA_API_KEY) headers['X-Api-Key'] = process.env.WAHA_API_KEY;
      const res = await fetch(dlUrl, { headers });
      if (!res.ok) {
        this.logger.warn(`download de áudio falhou (${res.status}) url=${dlUrl}`);
        return empty;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      // salva uma cópia .ogg em uploads/audio (servido em /uploads) p/ tocar no inbox
      let audioUrl: string | null = null;
      try {
        // fs/path vêm do import no topo. `require()` aqui era proibido pelo lint e
        // ainda sombreava os imports, deixando os dois "não usados".
        const dir = path.join(process.cwd(), 'uploads', 'audio');
        fs.mkdirSync(dir, { recursive: true });
        const baseName = (path.basename(new URL(dlUrl).pathname).replace(/\.[^.]+$/, '') || String(Date.now()));
        const file = `${baseName}.ogg`;
        fs.writeFileSync(path.join(dir, file), buf);
        audioUrl = `/uploads/audio/${file}`;
      } catch (e: any) {
        this.logger.warn(`falha ao salvar áudio p/ inbox: ${e?.message}`);
      }
      const transcript = await this.transcription.transcribe(buf);
      return { transcript, audioUrl };
    } catch (e: any) {
      this.logger.warn(`transcrição de áudio inbound falhou: ${e?.message}`);
      return empty;
    }
  }

  /**
   * @param linha Por qual número a mensagem entrou (vem da query do webhook
   *   registrado naquele container). Ausente = linha principal — todo webhook
   *   que já existe hoje continua igual.
   */
  async process(rawBody: any, tenantId = 'default', linha?: string) {
    if (this.isFromMe(rawBody)) return this.handleOwnNumberOutbound(rawBody, tenantId);

    // DEDUP: se já processamos essa mensagem, ignora (evita resposta/processamento dobrado)
    const msgId = this.messageId(rawBody);
    if (msgId) {
      try {
        await this.prisma.processedMessage.create({ data: { messageId: msgId } });
      } catch {
        return { ignored: true, reason: 'duplicada' }; // unique violation = já processada
      }
    }

    const n = this.normalize(rawBody);
    if (!n.phone) return { ignored: true, reason: 'sem telefone' };
    if (!n.isValidBrazilPhone) {
      // LID (privacidade do WhatsApp): tenta resolver o <id>@lid para o numero real.
      const lid = this.extractLid(rawBody);
      const resolved = lid ? await this.resolveLidToPhone(lid) : null;
      if (resolved && resolved.startsWith('55') && resolved.length >= 12 && resolved.length <= 13) {
        this.logger.log(`LID ${lid} resolvido p/ número ${resolved}`);
        n.phone = resolved;
        n.from = `${resolved}@c.us`;
        n.isValidBrazilPhone = true;
        n.isMedia = n.normalizedText.length === 0;
        n.shouldProcess = n.normalizedText.length > 0;
      } else {
        return { ignored: true, reason: `telefone inválido: ${n.phone}` };
      }
    }

    // GATE de números internos (ADR 034/035, brainstorm 2026-07-20): vendedores
    // e contatos de alerta do Monitor NUNCA viram contato/lead — quem responde
    // "ok" a uma notificação de handoff ou a um digest não pode cair no funil
    // da Lia. Descarte ANTES de transcrição/contato/conversa, com log explícito
    // (regra do repo: nenhum drop silencioso).
    const internal = await this.internalNumbers.classify(n.phone);
    if (internal.internal) {
      this.logger.warn(
        `inbound descartado: número interno (${internal.reason}) — ${n.phone} não vira lead/conversa`,
      );
      return { ignored: true, reason: `numero interno: ${internal.reason}` };
    }

    let inboundAudioUrl: string | null = null;
    if (n.isMedia) {
      // áudio (nota de voz): baixa do WAHA + transcreve. Se vier texto, segue o fluxo normal com ele.
      const r = await this.transcribeInboundAudio(rawBody).catch(() => ({ transcript: null, audioUrl: null }));
      if (r.transcript) {
        // B4: telefone + conteúdo transcrito são dados pessoais → debug (off em produção).
        this.logger.debug(`Áudio transcrito de ${n.phone}`);
        n.text = r.transcript;
        n.normalizedText = r.transcript.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
        n.isOptOut = isOptOutMessage(r.transcript);
        n.isMedia = false;
        n.shouldProcess = true;
        inboundAudioUrl = r.audioUrl;
      } else {
        return { ignored: true, reason: 'mídia sem texto (sem transcrição)', phone: n.phone };
      }
    }
    if (!n.shouldProcess) return { ignored: true, reason: 'sem texto', phone: n.phone };

    // 1) upsert contato (idempotente por telefone)
    const contact = await this.contacts.create(tenantId, { phone: n.phone, source: 'whatsapp' });
    // nome do WhatsApp (pushName) → exibir no inbox, respeitando precedência do nameSource (ADR 020)
    if (n.pushName) await this.contacts.applyPushName(tenantId, n.phone, n.pushName).catch(() => null);

    // 2) opt-out tem precedência (LGPD)
    if (n.isOptOut) {
      const wasOptedOut = contact.status === 'opted_out'; // já estava? (evita confirmar/notificar 2x)
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: { status: 'opted_out', interestScore: 0, optOutAt: new Date() },
      });
      // Lista de bloqueio PERMANENTE, fora do contato: se o contato for apagado
      // numa limpeza e a lista reimportada, o pedido continua valendo.
      await this.optOutRegistry.register(tenantId, { phone: n.phone, email: contact.email }, 'pedido');
      const optConv = await this.prisma.aiConversation.findFirst({ where: { tenantId, phone: n.phone, status: 'open' } });
      if (optConv) {
        // registra a mensagem do cliente no histórico
        await this.conversations.addMessage(tenantId, optConv.id, { direction: 'inbound', content: n.text }).catch(() => null);
        await this.followup.stop(optConv.id, 'opt-out');
        // fecha a conversa imediatamente (Regra 1 — opt_out é imediato)
        await this.conversations.closeConversation(tenantId, optConv.id, 'opt_out').catch(() => null);
        // confirmação educada — só na PRIMEIRA vez (transacional/LGPD, independe da autonomia)
        if (!wasOptedOut) {
          await this.conversations
            .addMessage(tenantId, optConv.id, {
              direction: 'outbound',
              content: 'Pronto! ✅ Você não receberá mais mensagens nossas. Se mudar de ideia, é só chamar por aqui. Obrigada! 🙏',
              intent: 'opt_out_ack',
            })
            .catch(() => null);
        }
      }
      this.logger.warn(`Opt-out de ${n.phone}${wasOptedOut ? ' (já estava)' : ''}`);
      if (!wasOptedOut) {
        await this.notifications.create(tenantId, {
          type: 'opt_out',
          title: '🚫 Opt-out',
          body: `${n.phone} pediu para não receber mais mensagens.`,
          link: '/contacts',
        });
      }
      return { ok: true, phone: n.phone, optOut: true, confirmed: !wasOptedOut };
    }

    // 2b) contato JÁ optou por sair mas mandou mensagem nova → re-opt-in implícito (consentimento voluntário).
    if (contact.status === 'opted_out') {
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: { status: 'active', optOutAt: null },
      });
      contact.status = 'active';
      this.logger.log(`Re-opt-in: ${n.phone} voltou a interagir — status reativado`);
    }

    // 3) acha conversa mais recente do telefone (qualquer status, incluindo opt_out — re-opt-in já foi tratado acima)
    let conv = await this.prisma.aiConversation.findFirst({
      where: { tenantId, phone: n.phone },
      orderBy: { startedAt: 'desc' },
    });
    if (!conv) {
      // sem histórico → cria nova conversa
      conv = await this.conversations.create(tenantId, {
        contactId: contact.id,
        phone: n.phone,
        sourceChannel: 'whatsapp',
        // Fixa a linha no nascimento — é o que amarra o invariante de resposta.
        wahaLine: linha,
      });
    } else if ((conv.status as string) === 'opt_out') {
      // opt-out: re-opt-in voluntário — reabre sempre (consentimento implícito de retorno).
      this.logger.log(`Conversa ${conv.id} reaberta (opt_out) — lead ${n.phone} retornou`);
      await this.prisma.$transaction([
        this.prisma.aiConversation.update({
          where: { id: conv.id },
          data: { status: 'open' as any, endedAt: null, lastActivityAt: new Date(), outcome: null, outcomeAt: null },
        }),
        this.prisma.conversationStageHistory.create({
          data: { conversationId: conv.id, fromStatus: 'opt_out', toStatus: 'open', fromOutcome: (conv as any).outcome ?? null, toOutcome: null, reason: 'reaberta_reopt_in' },
        }),
      ]);
      conv = { ...conv, status: 'open' as any, endedAt: null };
    } else if ((conv.status as string) === 'closed') {
      // N1: janela de reabertura — <REOPEN_WINDOW_DAYS reabre; ≥ cria follow-up.
      const windowDays = Number(process.env.REOPEN_WINDOW_DAYS ?? 7);
      const closedAt = (conv as any).endedAt ?? (conv as any).lastActivityAt ?? new Date(0);
      const daysSinceClosed = (Date.now() - new Date(closedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceClosed < windowDays) {
        this.logger.log(`N1 [WhatsApp]: chamado ${conv.id} reaberto por cliente (${Math.floor(daysSinceClosed)}d < ${windowDays}d)`);
        await this.prisma.$transaction([
          this.prisma.aiConversation.update({
            where: { id: conv.id },
            data: {
              status: 'open' as any,
              endedAt: null,
              lastActivityAt: new Date(),
              outcome: null,
              outcomeAt: null,
              resolvedAt: null,
              autoCloseAt: null,
            },
          }),
          this.prisma.conversationStageHistory.create({
            data: { conversationId: conv.id, fromStatus: 'closed', toStatus: 'open', fromOutcome: (conv as any).outcome ?? null, toOutcome: null, reason: 'reaberto_cliente' },
          }),
        ]);
        conv = { ...conv, status: 'open' as any, endedAt: null };
      } else {
        // ≥ windowDays: cria follow-up vinculado ao chamado original.
        this.logger.log(`N1 [WhatsApp]: chamado ${conv.id} fechado há ${Math.floor(daysSinceClosed)}d (≥${windowDays}d) → criando follow-up`);
        const followUp = await this.conversations.create(tenantId, {
          contactId: contact.id,
          phone: n.phone,
          sourceChannel: 'whatsapp',
          agentType: (conv as any).agentType ?? 'router',
          // O follow-up nasce da mensagem que ACABOU de chegar, então herda a
          // linha dela — não a da conversa antiga, que pode ter sido outra.
          wahaLine: linha,
        });
        await this.prisma.aiConversation.update({
          where: { id: followUp.id },
          data: { followUpOfId: conv.id } as any,
        });
        conv = followUp;
      }
    }

    // 4) grava a mensagem inbound (empurra pro inbox via WebSocket)
    await this.conversations.addMessage(tenantId, conv.id, { direction: 'inbound', content: n.text, metadata: inboundAudioUrl ? { audioUrl: inboundAudioUrl, audio: true } : undefined });

    // lead respondeu → para a cadência de follow-up
    await this.followup.stop(conv.id, 'respondeu');

    // 5) se autonomia LIGADA → a Lia processa e (se aprovado) responde sozinha
    //    G2: rate-limit anti-resposta-dupla — não reprocessa se já processou há <12s (lead mandou várias msgs)
    let agentResult: any = null;
    const last = this.lastProcessed.get(n.phone) ?? 0;
    const rateLimited = Date.now() - last < RATE_LIMIT_MS;
    if (this.autonomy.isEnabled('whatsapp') && !rateLimited) {
      this.lastProcessed.set(n.phone, Date.now());
      setTimeout(() => this.lastProcessed.delete(n.phone), RATE_LIMIT_MS + 1000); // BUG-001: prevent memory leak
      agentResult = await this.agent.handle(tenantId, { message: n.text, conversationId: conv.id });
      // diagnóstico: por que respondeu ou não (visível no log)
      this.logger.log(
        `Decisão IA p/ ${n.phone}: agente=${agentResult?.route?.agent} score=${agentResult?.route?.leadScore} ` +
          `autoSent=${agentResult?.autoSent}${agentResult?.blockedReason ? ` BLOQUEIO="${agentResult.blockedReason}"` : ''}`,
      );
    } else if (rateLimited) {
      // G2 + agrupamento: a mensagem NÃO é mais descartada. Entra no lote e a Lia
      // responde tudo junto quando o lead parar de digitar. Com a autonomia OFF o
      // comportamento antigo continua (guardar sem responder) — quem escala nesse
      // caso é o ramo `escalateOnly` abaixo, e ele já rodou na 1ª mensagem.
      if (this.autonomy.isEnabled('whatsapp')) {
        this.bufferInbound(n.phone, tenantId, conv.id, n.text);
      } else {
        this.logger.warn(`Rate-limit: ${n.phone} (autonomia OFF — msg guardada, SEM resposta da IA)`);
      }
    } else if (!this.autonomy.isEnabled('whatsapp')) {
      // IA-3 (complemento): a Lia não responde com a autonomia OFF, mas ainda escala leads
      // quentes / pedidos de humano pro vendedor. Marca lastProcessed p/ aplicar o rate-limit.
      this.lastProcessed.set(n.phone, Date.now());
      setTimeout(() => this.lastProcessed.delete(n.phone), RATE_LIMIT_MS + 1000); // BUG-001: prevent memory leak
      const esc = await this.agent
        .escalateOnly(tenantId, { message: n.text, conversationId: conv.id })
        .catch(() => null);
      this.logger.warn(
        `Autonomia OFF: ${n.phone} (sem resposta; escalada=${esc?.handoff?.assigned ? esc.handoff.sellerName : 'não'})`,
      );
    }

    return {
      ok: true,
      phone: n.phone,
      conversationId: conv.id,
      autoReplied: agentResult?.autoSent ?? false,
      agent: agentResult?.route?.agent,
    };
  }

  /**
   * Guarda uma mensagem que chegou dentro da janela do rate-limit e (re)arma o
   * disparo do lote. Cada mensagem nova adia o disparo em BATCH_QUIET_MS — o
   * efeito é "espera o lead terminar de digitar".
   *
   * A 1ª mensagem NÃO passa por aqui: continua sendo respondida na hora, como
   * sempre foi. O agrupamento vale só para as seguintes, que hoje se perdiam.
   */
  private bufferInbound(phone: string, tenantId: string, conversationId: string, text: string) {
    const cur = this.pending.get(phone);
    if (cur) clearTimeout(cur.timer);

    const texts = cur?.texts ?? [];
    const totalChars = texts.reduce((n, t) => n + t.length, 0);
    if (texts.length < BATCH_MAX_MSGS && totalChars + text.length <= BATCH_MAX_CHARS) {
      texts.push(text);
    } else {
      // Descarte explícito e logado — nunca silencioso (regra do CLAUDE.md).
      this.logger.warn(
        `Agrupamento: teto atingido p/ ${phone} (${texts.length} msgs, ${totalChars} chars) — mensagem fora do lote`,
      );
    }

    const timer = setTimeout(() => {
      this.flushPending(phone).catch((e) =>
        this.logger.error(`Agrupamento: falha ao processar lote de ${phone} — ${e?.message}`),
      );
    }, BATCH_QUIET_MS);

    // conversationId sempre o mais recente: uma reabertura no meio do lote pode
    // ter trocado a conversa, e responder na antiga deixaria o inbox inconsistente.
    this.pending.set(phone, { texts, timer, tenantId, conversationId });
    this.logger.log(
      `Agrupamento: msg de ${phone} entrou no lote (${texts.length} acumulada(s), disparo em ~${BATCH_QUIET_MS / 1000}s)`,
    );
  }

  /**
   * Dispara o lote como UMA chamada de IA. As mensagens já estão gravadas, então
   * o histórico do prompt as enxerga individualmente; o texto juntado vai como
   * "mensagem de agora" para a Lia responder a todas de uma vez.
   */
  private async flushPending(phone: string) {
    const entry = this.pending.get(phone);
    this.pending.delete(phone);
    if (!entry || entry.texts.length === 0) return;

    // A autonomia pode ter sido desligada durante a espera — nesse caso a Lia
    // não responde, mesmo com o lote pronto.
    if (!this.autonomy.isEnabled('whatsapp')) {
      this.logger.warn(
        `Agrupamento: autonomia OFF no disparo de ${phone} — ${entry.texts.length} msg(s) sem resposta`,
      );
      return;
    }

    // Reinicia a janela do rate-limit a partir do disparo (e não da 1ª mensagem),
    // senão o lote responderia e logo em seguida uma msg nova abriria outro ciclo.
    this.lastProcessed.set(phone, Date.now());
    setTimeout(() => this.lastProcessed.delete(phone), RATE_LIMIT_MS + 1000);

    const message = entry.texts.join('\n');
    const result = await this.agent.handle(entry.tenantId, { message, conversationId: entry.conversationId });
    this.logger.log(
      `Agrupamento: ${entry.texts.length} msg(s) de ${phone} respondidas juntas — ` +
        `agente=${result?.route?.agent} score=${result?.route?.leadScore} autoSent=${result?.autoSent}` +
        `${result?.blockedReason ? ` BLOQUEIO="${result.blockedReason}"` : ''}`,
    );
  }
}
