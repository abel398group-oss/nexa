import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EmailReplyService } from './email-reply.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';

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
    private readonly waha: WahaClientService,
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
      // Deep link no formato que o Inbox realmente entende (/inbox?c=<id> —
      // ADR 034, mesmo padrão do handoff de vendas). O formato antigo
      // (/inbox/<id>) não casava com nenhuma rota do frontend.
      const base = (process.env.NEXA_APP_URL ?? process.env.APP_BASE_URL ?? '').trim().replace(/\/$/, '');
      const inboxLink = base ? `${base}/inbox?c=${event.conversationId}` : '';
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
        inboxLink ? `Atenda no Inbox: ${inboxLink}` : 'Atenda pelo Inbox do painel Nexa.',
      ].join('\n');

      await this.email.sendAlertEmail(to, subject, text, event.tenantId);

      // ADR 034 (2026-07-20): aviso também por WhatsApp quando SUPPORT_WHATSAPP
      // está configurado — o atendente na rua abre o chamado pelo deep link no
      // navegador do celular, igual ao vendedor. Sem env → segue só o e-mail.
      // O número do suporte é tratado como interno pelo gate (InternalNumbers),
      // então responder a esta notificação não vira lead.
      const supportWa = (process.env.SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');
      if (supportWa) {
        const waMsg =
          `🛟 *Chamado ${numero}* — ${origem}\n` +
          `Cliente: ${contact?.name ?? '-'} (${phone})\n` +
          `Assunto: ${c.subject ?? '-'}\n` +
          (inboxLink ? `👉 Atender agora: ${inboxLink}` : `👉 Atenda pelo Inbox do painel Nexa.`);
        const r = await this.waha.sendText(supportWa, waMsg);
        if (!r.sent) {
          this.logger.warn(`WhatsApp de escalação falhou (conv=${event.conversationId}): ${r.reason}`);
        }
      }
    } catch (e: any) {
      // Nunca propaga: e-mail é notificação, não parte do fluxo do chamado.
      this.logger.warn(`Falha no e-mail de escalação (conv=${event.conversationId}): ${e?.message}`);
    }
  }
}
