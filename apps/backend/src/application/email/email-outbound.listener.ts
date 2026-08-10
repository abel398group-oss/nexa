/**
 * EmailOutboundListener — entrega por SMTP das mensagens de saída do canal e-mail.
 *
 * Por que um listener e não uma chamada direta: `ConversationsService.addMessage()`
 * é quem decide o despacho por canal, e `ConversationsModule` não pode importar
 * `EmailModule` (o EmailModule já importa o ConversationsModule). Mesmo desacoplamento
 * por evento usado no web chat (ver WebChatService, ADR 027 D2).
 *
 * Contexto (2026-08-07): o canal `email` não tinha ramo de despacho. Toda saída caía
 * na rota do WhatsApp e o WAHA era chamado com `phone = "email:fulano@…"`. Resultado:
 * quem respondia um lead pelo Inbox escrevia no vazio — a mensagem aparecia na thread
 * e nunca saía. A resposta automática da Lia parecia funcionar porque o EmailService
 * disparava o SMTP por fora do fluxo; esse envio paralelo foi removido, e agora existe
 * um caminho único: addMessage → este listener → SMTP.
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EmailReplyService } from './email-reply.service';
import { EMAIL_PHONE_PREFIX } from './email.service';

export interface ConversationOutboundEmailEvent {
  tenantId: string;
  conversationId: string;
  messageId: string;
}

@Injectable()
export class EmailOutboundListener {
  private readonly logger = new Logger('EmailOutbound');

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailReply: EmailReplyService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent('conversation.outbound.email', { async: true })
  async handle(event: ConversationOutboundEmailEvent): Promise<void> {
    const { tenantId, conversationId, messageId } = event;

    const conv = await this.prisma.aiConversation
      .findUnique({
        where: { id: conversationId },
        // productCode: a resposta da Lia sai com a marca do MERCADO da conversa
        // (ADR 037). Sem ele, o disparo ia com a cara do mercado e a resposta
        // seguinte voltava HiperTMS — o lead veria duas marcas no mesmo fio.
        select: { id: true, phone: true, contactId: true, subject: true, productCode: true },
      })
      .catch(() => null);

    if (!conv) {
      this.logger.warn(`msg=${messageId}: conversa ${conversationId} não encontrada — e-mail NÃO enviado`);
      return;
    }

    // O endereço vive no `phone` com o prefixo sintético (ver email.service.ts).
    if (!conv.phone?.startsWith(EMAIL_PHONE_PREFIX)) {
      this.logger.warn(
        `msg=${messageId}: conversa ${conversationId} é do canal email mas phone="${conv.phone}" ` +
        `não tem o prefixo "${EMAIL_PHONE_PREFIX}" — e-mail NÃO enviado`,
      );
      return;
    }
    const to = conv.phone.slice(EMAIL_PHONE_PREFIX.length);

    const message = await this.prisma.aiMessage
      .findUnique({ where: { id: messageId }, select: { content: true } })
      .catch(() => null);

    if (!message?.content?.trim()) {
      this.logger.warn(`msg=${messageId}: sem conteúdo — e-mail NÃO enviado`);
      return;
    }

    // Assunto do thread: o do chamado, senão o da última mensagem recebida (o
    // EmailService grava em metadata.subject). Sem nenhum dos dois, um genérico —
    // o send() prefixa "Re:" quando é resposta.
    const subject = conv.subject?.trim() || (await this.assuntoDoThread(conversationId)) || 'HiperTMS';

    const r = await this.emailReply.send({
      to,
      subject,
      body: message.content,
      tenantId,
      contactId: conv.contactId,
      inReplyToSubject: subject,
      productCode: (conv as any).productCode,
    });

    if (!r.sent) {
      // REGRA 3: caminho de falha SEMPRE registra o motivo. Antes desta correção
      // era exatamente aqui que a mensagem sumia sem deixar rastro.
      this.logger.warn(`E-mail NÃO enviado p/ ${to} (conv=${conversationId} msg=${messageId}): ${r.reason}`);
      return;
    }

    // ✓ enviado — sem isto a mensagem fica marcada como "enviando" para sempre no
    // Inbox (o recibo do frontend lê `ack`, e só o WhatsApp o preenchia).
    // ack=1 e não 2/3: o SMTP confirma que ACEITOU o e-mail, não que foi entregue
    // na caixa nem lido. Afirmar mais que isso seria mentira.
    await this.prisma.aiMessage
      .update({ where: { id: messageId }, data: { ack: 1 } })
      .catch((e: any) => this.logger.warn(`Falha ao marcar ack do msg=${messageId}: ${e?.message}`));

    // Mesmo evento que o recibo do WhatsApp usa — o gateway traduz em 'message:ack'
    // para a sala da conversa (ver conversations.gateway.ts).
    this.events.emit('message.updated', { conversationId, id: messageId, ack: 1 });

    this.logger.log(`E-mail enviado p/ ${to} (conv=${conversationId.slice(0, 8)})`);
  }

  /** Assunto da última mensagem recebida na conversa (gravado em metadata.subject). */
  private async assuntoDoThread(conversationId: string): Promise<string | null> {
    const ultima = await this.prisma.aiMessage
      .findFirst({
        where: { conversationId, direction: 'inbound' },
        orderBy: { createdAt: 'desc' },
        select: { metadata: true },
      })
      .catch(() => null);
    const s = (ultima?.metadata as any)?.subject;
    return typeof s === 'string' && s.trim() ? s.trim() : null;
  }
}
