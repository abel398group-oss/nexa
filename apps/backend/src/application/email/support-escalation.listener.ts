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
 * Resolução do destinatário (por tenant):
 *   1. Rota específica da categoria do chamado (ex: 'fiscal' → fiscal@empresa.com)
 *   2. Rota padrão do tenant (category = null)
 *   3. SUPPORT_EMAIL env (global)
 *   4. Nenhum → loga debug e não envia
 *
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
    // Carrega todas as rotas do tenant de uma vez (fail-safe: erro → array vazio).
    const routes: Array<{ category: string | null; email: string }> = await (this.prisma as any)
      .supportEmailRoute.findMany({ where: { tenantId: event.tenantId } })
      .catch(() => []);

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
      const category: string | null = c.ticketCategory ?? null;

      // Resolução: rota por categoria → rota padrão (null) → env.
      const to =
        routes.find((r) => r.category !== null && r.category === category)?.email ||
        routes.find((r) => r.category === null)?.email ||
        process.env.SUPPORT_EMAIL;

      if (!to) {
        this.logger.debug(
          `support.escalated tenant=${event.tenantId} categoria=${category ?? 'null'} — sem e-mail configurado, notificação não enviada`,
        );
        return;
      }

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
        `Categoria: ${category ?? '-'} | Prioridade: ${c.ticketPriority ?? 'normal'}`,
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
