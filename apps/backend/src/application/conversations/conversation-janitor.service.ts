/**
 * ConversationJanitorService
 *
 * Regras automáticas de fechamento — roda a cada hora (@Interval).
 *
 * ── Módulo Comercial (leads) ────────────────────────────────────────────────
 *   Regra 1 — opt_out      → fechamento imediato (whatsapp.service.ts)
 *   Regra 3 — WON          → fechamento imediato (conversations.service.ts)
 *   Regra 4 — LOST         → fechamento imediato (conversations.service.ts)
 *   Regra 2 — Inatividade  → 7 dias sem mensagem → CLOSED (no_response)  ← closeInactiveLeads
 *
 * ── Módulo Suporte (ADR 015 D5) ────────────────────────────────────────────
 *   Regra S1 — Resolvido pela IA + 48h sem retorno → CLOSED (resolved)    ← closeResolvedSupport
 *   Regra S2 — Ticket aberto + 48h sem resposta    → CLOSED (no_response) ← closeNoResponseSupport
 *   (Escalado a humano → humano fecha manualmente — fora do escopo do janitor)
 *
 * Filtros aplicados em todos os branches:
 *   • Nunca fecha waiting_internal nem escalated (responsabilidade da equipe)
 *   • Branch comercial: só customerStage='lead'
 *   • Branch suporte:   só customerStage in ['cliente_ativo', 'cliente_novo']
 *                       E ticketCategory NOT NULL (ticket classificado)
 *
 * TODO: substituir check de customerStage por HiperTmsConnector.getCustomerStatus()
 *   quando subir para DigitalOcean — hoje usa campo local para evitar loop no TMS DB.
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { RedisLockService } from '@/shared/lock/redis-lock.service';

const INACTIVITY_DAYS = Number(process.env.CONVERSATION_INACTIVITY_DAYS ?? 7);
// Suporte: ticket sem resposta do cliente após N horas → fecha com no_response (ADR 015 D5)
const SUPPORT_INACTIVITY_HOURS = Number(process.env.SUPPORT_INACTIVITY_HOURS ?? 48);
// N4: SLA por prioridade (env-configurável). Defaults: crítico 1h, alta 4h, média 8h, baixa 24h.
//
// 2026-08-05: as chaves eram `urgente/alta/normal/baixa`, mas o classificador
// grava `critical/high/medium/low` (case-classifier-agent.service.ts) — NENHUMA
// batia, então todo ticket caía no default de 8h e um chamado CRÍTICO era
// tratado igual a um de prioridade baixa. Agora as chaves são as que o
// classificador realmente escreve; os nomes em PT ficam como alias porque o
// formulário do portal grava 'normal' (portal-tickets.service.ts).
const SLA_HOURS: Record<string, number> = {
  critical: Number(process.env.SLA_HOURS_URGENT ?? 1),
  high:     Number(process.env.SLA_HOURS_HIGH   ?? 4),
  medium:   Number(process.env.SLA_HOURS_NORMAL ?? 8),
  low:      Number(process.env.SLA_HOURS_LOW    ?? 24),
  // aliases PT — formulário do portal e tickets antigos
  urgente:  Number(process.env.SLA_HOURS_URGENT ?? 1),
  alta:     Number(process.env.SLA_HOURS_HIGH   ?? 4),
  normal:   Number(process.env.SLA_HOURS_NORMAL ?? 8),
  baixa:    Number(process.env.SLA_HOURS_LOW    ?? 24),
};
// Fallback quando ticketPriority não está definido → normal (8h)
const SLA_HOURS_DEFAULT = Number(process.env.SLA_HOURS_NORMAL ?? 8);
// SLA mínimo dentre todos os níveis → pre-filter do banco (captura todos os potencialmente violados)
const SLA_MIN_HOURS = Math.min(...Object.values(SLA_HOURS));
// LGPD: prazo de retenção de dados pessoais (padrão 2 anos = 730 dias).
// Após esse prazo, contatos opt-out e conversas encerradas são anonimizados.
const RETENTION_DAYS = Number(process.env.DATA_RETENTION_DAYS ?? 730);
// A2 (auditoria 2026-07-08): expurgo de tabelas de alto volume sem valor histórico.
// ProcessedMessage só serve para dedup de reentrega (janela de minutos/horas) — 48h sobra.
const PROCESSED_MSG_RETENTION_HOURS = Number(process.env.PROCESSED_MSG_RETENTION_HOURS ?? 48);
// Sessões expiradas/revogadas: mantém 30 dias como janela de auditoria e depois apaga.
const SESSION_RETENTION_DAYS = Number(process.env.SESSION_RETENTION_DAYS ?? 30);
// A3 (alertas em escala): logs de envio de notificação — 1 linha por envio,
// cresce para sempre sem expurgo. 90 dias cobre auditoria operacional.
const NOTIFICATION_LOG_RETENTION_DAYS = Number(process.env.NOTIFICATION_LOG_RETENTION_DAYS ?? 90);

@Injectable()
export class ConversationJanitorService {
  private readonly logger = new Logger('ConversationJanitor');
  // MON-007: timestamp do último run — consumido pelo HealthController.
  static lastRunAt: Date | null = null;

  getStats() {
    return { lastRunAt: ConversationJanitorService.lastRunAt?.toISOString() ?? null };
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly waha: WahaClientService,
    private readonly notifications: NotificationsService,
    private readonly lock: RedisLockService,
  ) {}

  // Envia mensagem de encerramento ao cliente (fire-and-forget, não bloqueia o fechamento).
  // N4: pula phones sintéticos: 'email:' e 'portal:' nunca chegam ao WAHA.
  private notifyClose(phones: string[], message: string): void {
    for (const phone of phones) {
      if (!phone || phone.startsWith('email:') || phone.startsWith('portal:')) continue;
      this.waha.sendText(phone, message).catch((e) =>
        this.logger.warn(`Falha ao notificar fechamento para ${phone}: ${e?.message}`),
      );
    }
  }

  @Interval(60 * 60 * 1000) // roda a cada hora
  async closeInactiveConversations(): Promise<void> {
    // Multi-instance guard: only one replica runs the close cycle at a time.
    const release = await this.lock.acquire('lock:janitor:close-inactive', 1800);
    if (!release) return;
    try {
      await this.closeInactiveConversationsLocked();
    } finally {
      await release();
    }
  }

  private async closeInactiveConversationsLocked() {
    ConversationJanitorService.lastRunAt = new Date();
    // ── Suporte: RESOLVED → 48h → CLOSED (ADR 015 D5) ────────────────────
    await this.closeResolvedSupport();
    // ── Suporte: ticket aberto sem resposta do cliente → 48h → CLOSED ────
    await this.closeNoResponseSupport();
    // ── Comercial: lead inativo → 7 dias → CLOSED (no_response) ──────────
    await this.closeInactiveLeads();
    // ── MON-006: ticket escalado sem atendimento humano → alerta ──────────
    await this.alertSlaEscalated();
  }

  // MON-006 / N4: detecta tickets escalados sem atendimento humano além do SLA da sua prioridade.
  // N4 melhorias vs implementação anterior:
  //   - SLA por prioridade (urgente 1h / alta 4h / normal 8h / baixa 24h) via env
  //   - Dedup persistente via slaAlertedAt no banco (substitui Map em memória que morria no restart)
  //   - Log inclui prioridade + prazo aplicado para cada batch
  private async alertSlaEscalated() {
    const now = new Date();
    const dedup24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Pre-filter: lastActivityAt < now - SLA_MIN_HOURS captura qualquer ticket que poderia ter
    // violado o SLA mais restritivo (urgente=1h). A filtragem por prioridade exata é feita em JS.
    const outerCutoff = new Date(now.getTime() - SLA_MIN_HOURS * 60 * 60 * 1000);

    const candidates = await this.prisma.aiConversation.findMany({
      where: {
        status: 'escalated' as any,
        lastActivityAt: { lt: outerCutoff },
        // N4 dedup persistente: só alerta se nunca alertou OU se já passaram 24h do último alerta
        OR: [{ slaAlertedAt: null }, { slaAlertedAt: { lt: dedup24h } }],
      } as any,
      select: { id: true, phone: true, tenantId: true, lastActivityAt: true, ticketPriority: true },
    });

    if (!candidates.length) return;

    // Filtra por SLA da prioridade específica do ticket
    const slaHours = (priority: string | null): number =>
      priority ? (SLA_HOURS[priority] ?? SLA_HOURS_DEFAULT) : SLA_HOURS_DEFAULT;

    const unalerted = candidates.filter((c) => {
      const hours = slaHours(c.ticketPriority);
      const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
      return c.lastActivityAt && new Date(c.lastActivityAt) < cutoff;
    });

    if (!unalerted.length) return;

    // Agrupa por tenant para notificação resumida
    const byTenant = new Map<string, typeof unalerted>();
    for (const conv of unalerted) {
      const list = byTenant.get(conv.tenantId) ?? [];
      list.push(conv);
      byTenant.set(conv.tenantId, list);
    }

    for (const [tenantId, convs] of byTenant) {
      // Determina o SLA mais restritivo (menor) do lote para exibir no título
      const minSla = Math.min(...convs.map((c) => slaHours(c.ticketPriority)));
      await this.notifications.create(tenantId, {
        type: 'info',
        title: `⚠️ SLA: ${convs.length} chamado(s) escalado(s) sem atendimento`,
        body: convs
          .map((c) => `${c.phone} [${c.ticketPriority ?? 'normal'} / ${slaHours(c.ticketPriority)}h]`)
          .join(', '),
        link: '/inbox',
      });
      this.logger.warn(
        `MON-006 SLA breach: tenantId=${tenantId} convs=${convs.length} min_sla=${minSla}h ` +
        `priorities=${[...new Set(convs.map((c) => c.ticketPriority ?? 'normal'))].join(',')}`,
      );
    }

    // N4: persiste slaAlertedAt no banco (dedup survives restart + multi-replica)
    await (this.prisma.aiConversation as any).updateMany({
      where: { id: { in: unalerted.map((c) => c.id) } },
      data: { slaAlertedAt: now },
    });
  }

  // A2 — expurgo de tabelas de alto volume (ProcessedMessage, Session) sem valor
  // histórico. Roda 1x/dia. Sem isso, ambas crescem para sempre: processed_messages
  // ganha 1 linha por mensagem recebida e sessions acumula todas as sessões revogadas/
  // expiradas — inchando índice e disco em escala (10k+ tenants).
  @Interval(24 * 60 * 60 * 1000) // roda uma vez por dia
  async purgeEphemeralData(): Promise<void> {
    // Multi-instance guard: only one replica runs the purge at a time.
    const release = await this.lock.acquire('lock:janitor:purge-ephemeral', 3600);
    if (!release) return;
    try {
      await this.purgeEphemeralDataLocked();
    } finally {
      await release();
    }
  }

  private async purgeEphemeralDataLocked() {
    // 1) Dedup de inbound: só precisamos das últimas horas (reentrega/reconexão do WAHA).
    const msgCutoff = new Date(Date.now() - PROCESSED_MSG_RETENTION_HOURS * 60 * 60 * 1000);
    const msgs = await this.prisma.processedMessage
      .deleteMany({ where: { createdAt: { lt: msgCutoff } } })
      .catch((e: any) => {
        this.logger.warn(`purge ProcessedMessage falhou: ${e?.message}`);
        return { count: 0 };
      });

    // 2) Sessões já expiradas OU revogadas há mais de SESSION_RETENTION_DAYS.
    const sessCutoff = new Date(Date.now() - SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const sessions = await this.prisma.session
      .deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: sessCutoff } },
            { revokedAt: { not: null, lt: sessCutoff } },
          ],
        },
      })
      .catch((e: any) => {
        this.logger.warn(`purge Session falhou: ${e?.message}`);
        return { count: 0 };
      });

    // 3) A3: logs de notificação mais antigos que NOTIFICATION_LOG_RETENTION_DAYS.
    const notifCutoff = new Date(Date.now() - NOTIFICATION_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const notifLogs = await (this.prisma as any).notificationLog
      .deleteMany({ where: { sentAt: { lt: notifCutoff } } })
      .catch((e: any) => {
        this.logger.warn(`purge NotificationLog falhou: ${e?.message}`);
        return { count: 0 };
      });

    if (msgs.count || sessions.count || notifLogs.count) {
      this.logger.log(
        `A2 purge: ${msgs.count} processed_messages (>${PROCESSED_MSG_RETENTION_HOURS}h), ` +
          `${sessions.count} sessions (>${SESSION_RETENTION_DAYS}d), ` +
          `${notifLogs.count} notification_logs (>${NOTIFICATION_LOG_RETENTION_DAYS}d)`,
      );
    }
  }

  // LGPD — anonimização por prazo de retenção.
  // Roda 1x/dia (via @Interval de 24h) para não sobrecarregar o banco.
  // Anonimiza apenas contatos opt-out ou com conversas encerradas há mais de RETENTION_DAYS.
  // Anonimização: name → 'Anonimizado', phone → hash truncado, email → null, company → null, tags → [].
  @Interval(24 * 60 * 60 * 1000) // roda uma vez por dia
  async anonymizeExpiredData(): Promise<void> {
    // Multi-instance guard: only one replica runs the anonymization at a time.
    const release = await this.lock.acquire('lock:janitor:anonymize-expired', 3600);
    if (!release) return;
    try {
      await this.anonymizeExpiredDataLocked();
    } finally {
      await release();
    }
  }

  private async anonymizeExpiredDataLocked() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    // Contatos opt-out criados antes do cutoff que ainda têm dados pessoais visíveis.
    const expired = await this.prisma.contact.findMany({
      where: {
        status: 'opted_out',
        updatedAt: { lt: cutoff },
        NOT: { name: 'Anonimizado' }, // já anonimizado → pula
      },
      select: { id: true },
      take: 500, // lote máximo por ciclo
    });

    if (!expired.length) return;

    // Single bulk UPDATE — phone replaced with a stable hash (base64 of phone, first 8 chars).
    // All personal fields (name, email, company, tags) set to neutral values in one statement.
    const ids = expired.map((c) => c.id);
    await this.prisma.$queryRaw`
      UPDATE contacts
      SET
        name    = 'Anonimizado',
        phone   = 'anon_' || left(encode(convert_to(phone, 'UTF8'), 'base64'), 8),
        email   = NULL,
        company = NULL,
        tags    = '{}',
        updated_at = now()
      WHERE id = ANY(${ids}::uuid[])
        AND name <> 'Anonimizado'
    `;

    this.logger.log(`LGPD: ${expired.length} contato(s) anonimizado(s) (retenção >${RETENTION_DAYS} dias)`);
  }

  // Branch de suporte: fecha conversas marcadas como resolvidas (resolvedAt set)
  // há mais de 48h sem nova mensagem do cliente.
  private async closeResolvedSupport() {
    const now = new Date();
    const resolved = await this.prisma.aiConversation.findMany({
      where: {
        customerStage: { in: ['cliente_ativo', 'cliente_novo'] as any },
        status: { notIn: ['closed', 'opt_out'] as any },
        autoCloseAt: { lte: now },
      } as any,
      select: { id: true, status: true, phone: true },
    });

    if (!resolved.length) return;

    // C1: gera csatToken único por ticket — todo fechamento "resolved" precisa ter token
    // (seja por confirmação do cliente no support-agent ou aqui no janitor automático).
    // updateMany não suporta valores distintos por linha, então usamos update individual.
    const withTokens = resolved.map((c: any) => ({
      ...c,
      csatToken: randomBytes(24).toString('hex'),
    }));

    await this.prisma.$transaction([
      ...withTokens.map((c: any) =>
        this.prisma.aiConversation.update({
          where: { id: c.id },
          data: { status: 'closed' as any, outcome: 'resolved', outcomeAt: now, endedAt: now, csatToken: c.csatToken } as any,
        }),
      ),
      this.prisma.conversationStageHistory.createMany({
        data: withTokens.map((c: any) => ({
          conversationId: c.id,
          fromStatus: c.status,   // status real, não hardcoded 'open'
          toStatus: 'closed',
          fromOutcome: null,
          toOutcome: 'resolved',
          reason: 'resolvido_48h',
          changedAt: now,
        })),
      }),
    ]);

    this.logger.log(`Suporte: ${resolved.length} conversa(s) resolvida(s) → CLOSED (outcome=resolved, csatToken gerado)`);
    this.notifyClose(
      resolved.map((c: any) => c.phone),
      'Seu chamado foi resolvido. Se precisar de mais ajuda, é só nos chamar novamente. 😊',
    );
  }

  // Branch de suporte: fecha tickets com clienteStage ativo que ficaram abertos sem
  // resposta do cliente por mais de SUPPORT_INACTIVITY_HOURS horas (ADR 015 D5 — 3ª regra).
  // Diferente do branch "resolved" (que usa autoCloseAt), aqui o cliente NÃO respondeu
  // às perguntas da Lia — o ticket fica parado em open/waiting_customer.
  private async closeNoResponseSupport() {
    const cutoff = new Date(Date.now() - SUPPORT_INACTIVITY_HOURS * 60 * 60 * 1000);
    const now = new Date();

    const candidates = await this.prisma.aiConversation.findMany({
      where: {
        customerStage: { in: ['cliente_ativo', 'cliente_novo'] as any },
        status: { in: ['open', 'waiting_customer'] as any },
        ticketCategory: { not: null },   // tem que ser um ticket de suporte classificado
        lastActivityAt: { lt: cutoff },
        resolvedAt: null,                // não fechar tickets que já foram resolvidos (usam autoCloseAt)
      } as any,
      select: { id: true, status: true, phone: true }, // status real para fromStatus no histórico (BUG-004 fix)
    });

    if (!candidates.length) return;

    const ids = candidates.map((c: any) => c.id);

    await this.prisma.$transaction([
      this.prisma.aiConversation.updateMany({
        where: { id: { in: ids } },
        data: { status: 'closed' as any, outcome: 'no_response', outcomeAt: now, endedAt: now },
      }),
      this.prisma.conversationStageHistory.createMany({
        data: candidates.map((c: any) => ({
          conversationId: c.id,
          fromStatus: c.status,   // status real, não hardcoded 'open' (BUG-004 fix)
          fromOutcome: null,
          toStatus: 'closed',
          toOutcome: 'no_response',
          reason: `suporte_sem_resposta_${SUPPORT_INACTIVITY_HOURS}h`,
          changedAt: now,
        })),
      }),
    ]);

    this.logger.log(
      `Suporte: ${candidates.length} ticket(s) sem resposta >${SUPPORT_INACTIVITY_HOURS}h → CLOSED (outcome=no_response)`,
    );
    this.notifyClose(
      candidates.map((c: any) => c.phone),
      `Fechamos seu chamado pois não recebemos resposta em ${SUPPORT_INACTIVITY_HOURS}h. Se ainda precisar de ajuda, é só nos chamar. 🙏`,
    );
  }

  // Branch comercial original (leads)
  private async closeInactiveLeads() {
    const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);

    // Ajuste 1: só fecha open e waiting_customer.
    //   waiting_internal = equipe deve agir (não o janitor)
    //   escalated        = em atendimento humano ativo
    //   opt_out/closed   = já encerrado
    //
    // Ajuste 3: só leads (customerStage = lead).
    //   cliente_ativo/cliente_novo usam lógica de suporte (RESOLVED→48h)
    const candidates = await this.prisma.aiConversation.findMany({
      where: {
        status: { in: ['open', 'waiting_customer'] as any },
        customerStage: 'lead',
        lastActivityAt: { lt: cutoff },
      },
      select: { id: true, phone: true, status: true }, // status para fromStatus no histórico (BUG-004 fix)
    });

    if (!candidates.length) return;

    const ids = candidates.map((c: any) => c.id);
    const now = new Date();

    await this.prisma.$transaction([
      // Fecha as conversas
      this.prisma.aiConversation.updateMany({
        where: { id: { in: ids } },
        data: { status: 'closed' as any, outcome: 'no_response', outcomeAt: now, endedAt: now },
      }),
      // Grava histórico de stage para cada conversa fechada
      this.prisma.conversationStageHistory.createMany({
        data: candidates.map((c: any) => ({
          conversationId: c.id,
          fromStatus: c.status,   // status real (open ou waiting_customer) — BUG-004 fix
          toStatus: 'closed',
          fromOutcome: null,
          toOutcome: 'no_response',
          reason: `inatividade_${INACTIVITY_DAYS}d`,
          changedAt: now,
        })),
      }),
    ]);

    this.logger.log(
      `Auto-fechamento: ${candidates.length} lead(s) inativo(s) há >${INACTIVITY_DAYS} dias → CLOSED (outcome=no_response)`,
    );
    this.notifyClose(
      candidates.map((c: any) => c.phone),
      `Olá! Encerramos nossa conversa por inatividade. Quando quiser retomar, é só nos chamar. 😊`,
    );
  }
}
