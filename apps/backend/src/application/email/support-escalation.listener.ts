import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EmailReplyService } from './email-reply.service';

export interface SupportEscalatedEvent {
  tenantId: string;
  conversationId: string;
  /** 'portal' = aberto pelo cliente no widget; 'chat' = Lia não resolveu e escalou. */
  origin: 'portal' | 'chat';
}

/**
 * P2 — E-mail ao suporte humano quando um chamado entra na fila.
 *
 * Ouve o evento 'support.escalated' (emitido pelo portal-tickets.open e pelo
 * conversation-agent na escalação da Lia) e envia e-mail operacional para
 * SUPPORT_EMAIL (env). Vive no módulo de e-mail para evitar dependência circular
 * (EmailModule já importa AgentsModule — agentes não podem importar e-mail).
 *
 * Sem SUPPORT_EMAIL configurado → loga em debug e não envia (dev mode).
 * Falha de SMTP nunca derruba o fluxo do chamado (try/catch + fire-and-forget).
 */
@Injectable()
export class SupportEscalationListener {
  private readonly logger = new Logger('SupportEscalation');

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailReplyService,
  ) {}

  @OnEvent('support.escalated', { async: true })
  async handle(event: SupportEscalatedEvent): Promise<void> {
    // Resolução do destinatário: DB do tenant tem prioridade sobre env.
    // Garante que cada cliente pode configurar seu próprio e-mail sem alterar .env.
    const tenant = await this.prisma.tenant
      .findUnique({ where: { id: event.tenantId }, select: { supportEmail: true } as any })
      .catch(() => null);
    const to = (tenant as any)?.supportEmail || process.env.SUPPORT_EMAIL;
    if (!to) {
      this.logger.debug(`support.escalated tenant=${event.tenantId} — sem e-mail de suporte configurado, notificação não enviada`);
      return;
    }
    try {
      const conv = await this.prisma.aiConversation.findUnique({
        where: { id: event.conversationId },
        select: {
          ticketNumber: true,
          subject: true,
          ticketCategory: true,
          ticketPriority: true,
          phone: true,
          contactId: true,
        } as any,
      });
      if (!conv) {
        this.logger.warn(`support.escalated para conversa inexistente: ${event.conversationId}`);
        return;
      }
      const c = conv as any;
      const contact = c.contactId
        ? await this.prisma.contact.findUnique({ where: { id: c.contactId }, select: { name: true } })
        : null;

      const numero = c.ticketNumber ? `#${c.ticketNumber}` : event.conversationId.slice(0, 8);
      const origem = event.origin === 'portal' ? 'aberto pelo cliente no portal' : 'escalado pela Lia (chat)';
      const base = (process.env.APP_BASE_URL ?? '').replace(/\/$/, '');
      const phone = c.phone && !String(c.phone).includes(':') ? c.phone : '-';

      const subject = `[Suporte] Chamado ${numero} ${origem}`;
      const text = [
        `Chamado ${numero} aguardando atendimento humano.`,
        '',
        `Cliente: ${contact?.name ?? '-'} (${phone})`,
        `Assunto: ${c.subject ?? '-'}`,
        `Categoria: ${c.ticketCategory ?? '-'} | Prioridade: ${c.ticketPriority ?? 'normal'}`,
        `Origem: ${origem}`,
        '',
        `Atenda no Inbox: ${base}/inbox/${event.conversationId}`,
      ].join('\n');

      await this.email.sendAlertEmail(to, subject, text, event.tenantId);
    } catch (e: any) {
      // Nunca propaga: e-mail é notificação, não parte do fluxo do chamado.
      this.logger.warn(`Falha no e-mail de escalação (conv=${event.conversationId}): ${e?.message}`);
    }
  }
}
