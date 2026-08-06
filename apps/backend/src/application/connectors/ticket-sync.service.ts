/**
 * ticket-sync.service.ts — envia o resumo do ticket pro TMS quando ele nasce
 * (ganha número) e quando fecha, com retry durável.
 *
 * ## Por que existe
 *
 * Achado da auditoria de suporte (2026-08-05): o ticket vivia só no banco do
 * Nexa, nada chegava ao TMS. Decisão do Abel: o suporte continua sendo
 * atendido no Nexa (nada muda pro time humano); o TMS recebe só o HISTÓRICO,
 * pra aparecer na tela do cliente lá. Ver
 * docs/features/tms-native-support/especificacao-sync-ticket-tms.md.
 *
 * ## Por que não reaproveitar o WebhookService existente
 *
 * `WebhookService` já tem exatamente este retry (HMAC, 5 tentativas, backoff
 * [10s,30s,2min,10min,30min]) — mas ele entrega pra `WebhookSubscription`,
 * um destino CONFIGURADO PELO TENANT (FK obrigatória). Este envio é diferente:
 * destino fixo (o TMS), sempre o mesmo segredo, não é algo que o tenant
 * assina/desassina. Forçar isso na `WebhookSubscription` exigiria criar uma
 * assinatura "de sistema" fake só pra satisfazer a FK — mistura dois
 * conceitos (integração que o tenant configura vs. integração fixa
 * Nexa↔TMS). Por isso: mesmo padrão de retry, estado próprio (direto nas
 * colunas de `AiConversation` — 1 ticket, 1 destino, não precisa de tabela
 * de delivery separada).
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { HiperTmsConnector } from './hipertms.connector';
import { RedisLockService } from '@/shared/lock/redis-lock.service';

const MAX_ATTEMPTS = 5;
// Mesmo backoff do WebhookService — consistência de comportamento entre as
// duas integrações outbound do sistema.
const BACKOFF_SECONDS = [10, 30, 120, 600, 1800];
const RETRY_LOCK_KEY = 'ticket-sync:retry:lock';

type TicketSyncConversation = {
  id: string;
  tenantId: string;
  externalId: string | null;
  ticketNumber: number | null;
  ticketCategory: string | null;
  ticketPriority: string | null;
  status: string;
  subject: string | null;
  rootCause: string | null;
  resolvedAt: Date | null;
  humanTakeoverAt: Date | null;
  csatScore: number | null;
  ticketSyncAttempts: number;
};

@Injectable()
export class TicketSyncService {
  private readonly logger = new Logger('TicketSync');

  constructor(
    private readonly prisma: PrismaService,
    private readonly connector: HiperTmsConnector,
    private readonly lock: RedisLockService,
  ) {}

  /**
   * Marca a conversa para sincronizar na próxima varredura. Chamado nos dois
   * pontos do ciclo que importam pro TMS: ticketNumber atribuído, e status
   * fechado. Reinicia as tentativas — é uma entrega NOVA (dado mudou), não a
   * repetição de uma tentativa velha.
   *
   * Nunca lança: quem chama isto está no meio de outra operação (classificar
   * chamado, fechar ticket) e uma falha aqui não pode derrubar essa operação.
   */
  async markPending(conversationId: string): Promise<void> {
    await this.prisma.aiConversation
      .update({
        where: { id: conversationId },
        data: {
          ticketSyncStatus: 'pending',
          ticketSyncAttempts: 0,
          ticketSyncNextRetryAt: new Date(),
          ticketSyncError: null,
        } as any,
      })
      .catch((e: any) => this.logger.warn(`markPending falhou p/ conv=${conversationId}: ${e?.message}`));
  }

  /** Monta o payload no formato combinado com o time do TMS e tenta UMA entrega. */
  async syncOne(conversationId: string): Promise<void> {
    const conv = (await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true, tenantId: true, externalId: true, ticketNumber: true,
        ticketCategory: true, ticketPriority: true, status: true, subject: true,
        rootCause: true, resolvedAt: true, humanTakeoverAt: true, csatScore: true,
        ticketSyncAttempts: true,
      } as any,
    })) as TicketSyncConversation | null;
    if (!conv || conv.ticketNumber === null) return; // nada a sincronizar ainda

    const base = (process.env.NEXA_PUBLIC_URL ?? '').replace(/\/$/, '');
    const payload = {
      event: 'ticket.updated',
      tenantId: conv.tenantId,
      externalId: conv.externalId,
      ticketNumber: conv.ticketNumber,
      category: conv.ticketCategory,
      priority: conv.ticketPriority,
      status: conv.status,
      subject: conv.subject,
      rootCause: conv.rootCause,
      // Resolvido pela Lia = ela resolveu sem NENHUM humano assumir. Uma vez que
      // humanTakeoverAt existe, a resolução é creditada ao humano — mesmo que a
      // conversa tenha começado com a Lia tentando.
      resolvedByAi: conv.status === 'closed' ? !conv.humanTakeoverAt : null,
      resolvedAt: conv.resolvedAt?.toISOString() ?? null,
      csatScore: conv.csatScore,
      conversationUrl: base ? `${base}/inbox?c=${conv.id}` : null,
    };

    const result = await this.connector.syncTicket(payload);

    if (result.ok) {
      await this.prisma.aiConversation.update({
        where: { id: conversationId },
        data: { ticketSyncStatus: 'delivered', ticketSyncError: null } as any,
      });
      return;
    }

    const attempts = conv.ticketSyncAttempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: {
        ticketSyncStatus: exhausted ? 'failed' : 'pending',
        ticketSyncAttempts: attempts,
        ticketSyncNextRetryAt: exhausted ? null : new Date(Date.now() + BACKOFF_SECONDS[attempts - 1] * 1000),
        ticketSyncError: result.error?.slice(0, 500) ?? null,
      } as any,
    });
    this.logger.warn(
      `Sync do ticket ${conv.ticketNumber} (conv=${conversationId}) falhou ` +
      `(tentativa ${attempts}/${MAX_ATTEMPTS}): ${result.error}`,
    );
  }

  /** Retry de pendências vencidas. Lock Redis: só uma réplica varre por vez. */
  @Cron('*/1 * * * *')
  async retryPending(): Promise<void> {
    const release = await this.lock.acquire(RETRY_LOCK_KEY, 55);
    if (!release) return;
    try {
      const now = new Date();
      const pending = await this.prisma.aiConversation.findMany({
        where: {
          ticketSyncStatus: 'pending',
          ticketSyncNextRetryAt: { lte: now },
        } as any,
        select: { id: true },
        take: 50,
      });
      for (const c of pending) await this.syncOne(c.id);
    } finally {
      await release();
    }
  }
}
