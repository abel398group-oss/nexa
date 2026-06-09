import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ContactsService } from '@/application/contacts/contacts.service';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { ConversationAgentService } from '@/application/agents/conversation-agent.service';
import { FollowUpService } from '@/application/followup/followup.service';
import { AutonomyService } from '@/shared/governance/autonomy.service';
import { NotificationsService } from '@/application/notifications/notifications.service';

interface Normalized {
  phone: string;
  from: string;
  text: string;
  normalizedText: string;
  isOptOut: boolean;
  isValidBrazilPhone: boolean;
  isMedia: boolean;
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
    private readonly emitter: EventEmitter2,
  ) {}

  // Recibo do WhatsApp (evento message.ack do WAHA): 1=enviado ✓, 2=entregue ✓✓, 3=lido ✓✓azul.
  async handleAck(rawBody: any) {
    const p = rawBody?.payload ?? rawBody?.body?.payload ?? rawBody?.body ?? rawBody ?? {};
    const id = p.id?._serialized ?? p.id ?? p._data?.id?._serialized ?? p._data?.Info?.ID ?? null;
    const ack = Number(p.ack ?? p._data?.ack ?? 0);
    if (!id || !ack || ack < 1) return { ignored: true, reason: 'sem id/ack' };
    const msg = await this.prisma.aiMessage.findFirst({ where: { externalId: String(id) } });
    if (!msg) return { ignored: true, reason: 'msg não encontrada' };
    if (ack <= msg.ack) return { ignored: true, reason: 'ack não avança' };
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

    return {
      phone,
      from,
      text: String(text),
      normalizedText,
      isOptOut,
      isValidBrazilPhone,
      isMedia,
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
    if (n.isMedia) return { ignored: true, reason: 'mídia sem texto', phone: n.phone };
    if (!n.shouldProcess) return { ignored: true, reason: 'sem texto', phone: n.phone };

    // 1) upsert contato (idempotente por telefone)
    const contact = await this.contacts.create(tenantId, { phone: n.phone, source: 'whatsapp' });

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

    // 2b) contato JÁ optou por sair → a IA não responde mais nada (LGPD). Só registra p/ o humano ver.
    if (contact.status === 'opted_out') {
      const oc = await this.prisma.aiConversation.findFirst({ where: { tenantId, phone: n.phone, status: 'open' } });
      if (oc) await this.conversations.addMessage(tenantId, oc.id, { direction: 'inbound', content: n.text }).catch(() => null);
      this.logger.warn(`Contato opted_out enviou msg (${n.phone}) — IA NÃO responde`);
      return { ok: true, phone: n.phone, ignored: true, reason: 'contato optou por sair' };
    }

    // 3) acha conversa aberta ou fechada (mas não opt_out) do telefone
    //    Ajuste 2: conversa CLOSED pode ser reaberta — o lead voltou.
    //    opt_out NÃO reabre automaticamente (LGPD).
    let conv = await this.prisma.aiConversation.findFirst({
      where: { tenantId, phone: n.phone, status: { in: ['open', 'waiting_customer', 'waiting_internal', 'escalated', 'closed'] as any } },
      orderBy: { startedAt: 'desc' },
    });
    if (!conv) {
      // sem histórico → cria nova conversa
      conv = await this.conversations.create(tenantId, {
        contactId: contact.id,
        phone: n.phone,
        sourceChannel: 'whatsapp',
      });
    } else if ((conv.status as string) === 'closed') {
      // lead voltou após fechamento → reabre e grava histórico
      this.logger.log(`Conversa ${conv.id} reaberta — lead ${n.phone} voltou após fechamento`);
      await this.prisma.$transaction([
        this.prisma.aiConversation.update({
          where: { id: conv.id },
          data: { status: 'open' as any, endedAt: null, lastActivityAt: new Date() },
        }),
        this.prisma.conversationStageHistory.create({
          data: {
            conversationId: conv.id,
            fromStatus: 'closed',
            toStatus: 'open',
            fromOutcome: (conv as any).outcome ?? null,
            toOutcome: (conv as any).outcome ?? null, // preserva outcome anterior como histórico
            reason: 'reaberta_lead_retornou',
          },
        }),
      ]);
      conv = { ...conv, status: 'open' as any, endedAt: null };
    }

    // 4) grava a mensagem inbound (empurra pro inbox via WebSocket)
    await this.conversations.addMessage(tenantId, conv.id, { direction: 'inbound', content: n.text });

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
      this.logger.warn(`Autonomia OFF: ${n.phone} (msg guardada, SEM resposta automática)`);
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
