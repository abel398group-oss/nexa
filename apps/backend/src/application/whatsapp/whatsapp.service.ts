import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ContactsService } from '@/application/contacts/contacts.service';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { ConversationAgentService } from '@/application/agents/conversation-agent.service';
import { FollowUpService } from '@/application/followup/followup.service';
import { AutonomyService } from '@/shared/governance/autonomy.service';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { TranscriptionService } from '@/shared/ai/transcription.service';

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

const STOP_WORDS = ['parar', 'sair', 'remover', 'nao quero', 'descadastrar', 'cancelar', 'pare', 'stop', 'unsubscribe'];

const RATE_LIMIT_MS = Number(process.env.INBOUND_RATE_LIMIT_MS ?? 12000); // anti-resposta-dupla (G2)

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger('WhatsApp');
  private lastProcessed = new Map<string, number>(); // phone → timestamp

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
  ) {}

  // Recibo do WhatsApp (evento message.ack do WAHA): 1=enviado ✓, 2=entregue ✓✓, 3=lido ✓✓azul.
  async handleAck(rawBody: any) {
    const p = rawBody?.payload ?? rawBody?.body?.payload ?? rawBody?.body ?? rawBody ?? {};
    const id = p.id?._serialized ?? p.id ?? p._data?.id?._serialized ?? p._data?.Info?.ID ?? null;
    const ack = Number(p.ack ?? p._data?.ack ?? 0);
    // DEBUG temporário: ver se os recibos de ACK estão chegando do WAHA + estrutura do id
    this.logger.log(`[ack] recebido id=${id} ack=${ack} payload=${JSON.stringify(p).slice(0, 300)}`);
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
    const isOptOut = STOP_WORDS.some((w) =>
      normalizedText.includes(w.normalize('NFD').replace(/\p{Diacritic}/gu, '')),
    );
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
        const fs = require('node:fs');
        const path = require('node:path');
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

  async process(rawBody: any, tenantId = 'default') {
    if (this.isFromMe(rawBody)) return { ignored: true, reason: 'fromMe' };

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
    if (!n.isValidBrazilPhone) return { ignored: true, reason: `telefone inválido: ${n.phone}` };
    let inboundAudioUrl: string | null = null;
    if (n.isMedia) {
      // áudio (nota de voz): baixa do WAHA + transcreve. Se vier texto, segue o fluxo normal com ele.
      const r = await this.transcribeInboundAudio(rawBody).catch(() => ({ transcript: null, audioUrl: null }));
      if (r.transcript) {
        this.logger.log(`Áudio transcrito de ${n.phone}: "${r.transcript.slice(0, 80)}"`);
        n.text = r.transcript;
        n.normalizedText = r.transcript.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
        n.isOptOut = STOP_WORDS.some((w) => n.normalizedText.includes(w.normalize('NFD').replace(/\p{Diacritic}/gu, '')));
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
      });
    } else if ((conv.status as string) === 'closed' || (conv.status as string) === 'opt_out') {
      // lead voltou (após fechamento normal ou opt-out) → reabre preservando histórico
      const fromStatus = conv.status as string;
      this.logger.log(`Conversa ${conv.id} reaberta (${fromStatus}) — lead ${n.phone} voltou`);
      await this.prisma.$transaction([
        this.prisma.aiConversation.update({
          where: { id: conv.id },
          // ao reabrir de um opt-out, limpa o outcome (a conversa voltou a ficar ativa)
          data: {
            status: 'open' as any,
            endedAt: null,
            lastActivityAt: new Date(),
            ...(fromStatus === 'opt_out' ? { outcome: null, outcomeAt: null } : {}),
          },
        }),
        this.prisma.conversationStageHistory.create({
          data: {
            conversationId: conv.id,
            fromStatus,
            toStatus: 'open',
            fromOutcome: (conv as any).outcome ?? null,
            toOutcome: null,
            reason: fromStatus === 'opt_out' ? 'reaberta_reopt_in' : 'reaberta_lead_retornou',
          },
        }),
      ]);
      conv = { ...conv, status: 'open' as any, endedAt: null };
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
    if (this.autonomy.isEnabled() && !rateLimited) {
      this.lastProcessed.set(n.phone, Date.now());
      agentResult = await this.agent.handle(tenantId, { message: n.text, conversationId: conv.id });
      // diagnóstico: por que respondeu ou não (visível no log)
      this.logger.log(
        `Decisão IA p/ ${n.phone}: agente=${agentResult?.route?.agent} score=${agentResult?.route?.leadScore} ` +
          `autoSent=${agentResult?.autoSent}${agentResult?.blockedReason ? ` BLOQUEIO="${agentResult.blockedReason}"` : ''}`,
      );
    } else if (rateLimited) {
      this.logger.warn(`Rate-limit: ${n.phone} (msg guardada, SEM resposta da IA — última há <${RATE_LIMIT_MS / 1000}s)`);
    } else if (!this.autonomy.isEnabled()) {
      // IA-3 (complemento): a Lia não responde com a autonomia OFF, mas ainda escala leads
      // quentes / pedidos de humano pro vendedor. Marca lastProcessed p/ aplicar o rate-limit.
      this.lastProcessed.set(n.phone, Date.now());
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
}
