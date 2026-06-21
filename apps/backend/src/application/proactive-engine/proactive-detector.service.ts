import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EffectiveRuleConfig, ProactiveRuleConfigService } from './proactive-rule-config.service';

interface EventDraft {
  tenantId: string;
  ruleId: string;
  subjectId: string;
  level: string;
  severity: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ProactiveDetectorService {
  private readonly logger = new Logger(ProactiveDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configSvc: ProactiveRuleConfigService,
  ) {}

  // ─── Public entry point ────────────────────────────────────────────────────

  /** Evaluates all rules for all active tenants. Called by the cron job. */
  async evaluateAll(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    for (const { id: tenantId } of tenants) {
      try {
        await this.evaluateTenant(tenantId);
      } catch (err) {
        this.logger.error(`[proactive] error evaluating tenant ${tenantId}: ${(err as Error).message}`);
      }
    }
  }

  /** Fires the digest rule for all active tenants (called separately once a day). */
  async evaluateDigest(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });
    const now = new Date();
    const bucket = now.toISOString().slice(0, 10); // daily bucket YYYY-MM-DD
    const drafts: EventDraft[] = tenants.map(({ id }) => ({
      tenantId: id,
      ruleId: 'conversation.digest',
      subjectId: id, // tenant-level event
      level: 'L1',
      severity: 'INFO',
    }));
    // Override bucket to daily granularity for digest.
    await Promise.all(
      drafts.map((d) => {
        const dedupeKey = `${d.tenantId}:${d.ruleId}:${d.subjectId}:${bucket}`;
        return this.prisma.pendingConversationEvent
          .upsert({
            where:  { dedupeKey },
            update: {},
            create: {
              tenantId: d.tenantId, ruleId: d.ruleId, subjectId: d.subjectId,
              dedupeKey, level: d.level, severity: d.severity, status: 'OPEN', metadata: {} as any,
            },
          })
          .catch(() => {});
      }),
    );
  }

  // ─── Per-tenant evaluation ─────────────────────────────────────────────────

  private async evaluateTenant(tenantId: string): Promise<void> {
    const config = await this.configSvc.getConfig(tenantId);
    const now = new Date();

    const drafts: EventDraft[] = [
      ...(await this.detectStaleOpen(tenantId, now, config.get('conversation.stale_open')!)),
      ...(await this.detectLeadNoReply(tenantId, now, config.get('conversation.lead_no_reply')!)),
      ...(await this.detectSlaBreach(tenantId, now, config.get('conversation.sla_breach')!)),
      ...(await this.detectCampaignFollowup(tenantId, now, config.get('campaign.followup_due')!)),
      ...(await this.detectAutoClose(tenantId, now, config.get('ticket.auto_close')!)),
    ];

    await this.upsertEvents(drafts, now);
  }

  // ─── Rule detectors ────────────────────────────────────────────────────────

  /** conversation.stale_open — OPEN conversation idle > thresholdMin minutes. */
  private async detectStaleOpen(
    tenantId: string,
    now: Date,
    cfg: EffectiveRuleConfig,
  ): Promise<EventDraft[]> {
    if (!cfg.enabled) return [];

    const cutoff = new Date(now.getTime() - cfg.thresholdMin * 60_000);
    const convs = await this.prisma.aiConversation.findMany({
      where: {
        tenantId,
        status: 'open' as any,
        lastActivityAt: { lt: cutoff },
      },
      select: { id: true, lastActivityAt: true },
    });

    return convs.map((c) => {
      const idleMin = Math.floor((now.getTime() - (c.lastActivityAt ?? now).getTime()) / 60_000);
      return {
        tenantId, ruleId: 'conversation.stale_open', subjectId: c.id,
        level: cfg.level, severity: idleMin > cfg.thresholdMin * 2 ? 'CRITICAL' : 'OVERDUE',
        metadata: { idleMin },
      };
    });
  }

  /** conversation.lead_no_reply — lead replied but went silent > thresholdMin. */
  private async detectLeadNoReply(
    tenantId: string,
    now: Date,
    cfg: EffectiveRuleConfig,
  ): Promise<EventDraft[]> {
    if (!cfg.enabled) return [];

    const cutoff = new Date(now.getTime() - cfg.thresholdMin * 60_000);

    // Conversations where the last message was inbound (lead replied) and idle since cutoff.
    const convs = await this.prisma.aiConversation.findMany({
      where: {
        tenantId,
        status: { in: ['open', 'waiting_internal'] as any[] },
        lastActivityAt: { lt: cutoff },
      },
      select: { id: true, lastActivityAt: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { direction: true } } },
    });

    return convs
      .filter((c) => c.messages[0]?.direction === 'inbound')
      .map((c) => {
        const idleMin = Math.floor((now.getTime() - (c.lastActivityAt ?? now).getTime()) / 60_000);
        return {
          tenantId, ruleId: 'conversation.lead_no_reply', subjectId: c.id,
          level: cfg.level, severity: 'OVERDUE',
          metadata: { idleMin },
        };
      });
  }

  /** conversation.sla_breach — escalated ticket idle > thresholdMin without human reply. */
  private async detectSlaBreach(
    tenantId: string,
    now: Date,
    cfg: EffectiveRuleConfig,
  ): Promise<EventDraft[]> {
    if (!cfg.enabled) return [];

    const cutoff = new Date(now.getTime() - cfg.thresholdMin * 60_000);
    const convs = await this.prisma.aiConversation.findMany({
      where: { tenantId, status: 'escalated' as any, lastActivityAt: { lt: cutoff } },
      select: { id: true, lastActivityAt: true, ticketPriority: true },
    });

    return convs.map((c) => ({
      tenantId, ruleId: 'conversation.sla_breach', subjectId: c.id,
      level: cfg.level, severity: 'CRITICAL',
      metadata: { priority: c.ticketPriority },
    }));
  }

  /** campaign.followup_due — campaign target sent but no inbound reply after thresholdMin. */
  private async detectCampaignFollowup(
    tenantId: string,
    now: Date,
    cfg: EffectiveRuleConfig,
  ): Promise<EventDraft[]> {
    if (!cfg.enabled) return [];

    const cutoff = new Date(now.getTime() - cfg.thresholdMin * 60_000);
    // Use sentAt as the sent timestamp (updatedAt doesn't exist on CampaignTarget).
    const targets = await this.prisma.campaignTarget.findMany({
      where: { tenantId, status: 'sent', sentAt: { lt: cutoff } },
      select: { id: true, phone: true, campaignId: true, sentAt: true },
    });

    if (targets.length === 0) return [];

    // Find if the target's phone has an inbound message after the campaign was sent.
    // Approximation: look for any inbound AiMessage from those phones in this tenant.
    const phones = [...new Set(targets.map((t) => t.phone).filter(Boolean))];
    const repliedConvRows = await this.prisma.aiMessage.findMany({
      where: {
        tenantId,
        direction: 'inbound',
        conversation: { phone: { in: phones } },
      },
      select: { conversation: { select: { phone: true } } },
      distinct: ['conversationId'],
    });
    const repliedPhones = new Set(repliedConvRows.map((r) => r.conversation.phone));

    return targets
      .filter((t) => t.phone && !repliedPhones.has(t.phone))
      .map((t) => ({
        tenantId, ruleId: 'campaign.followup_due', subjectId: t.id,
        level: cfg.level, severity: 'DUE_SOON',
        metadata: { campaignId: t.campaignId, phone: t.phone },
      }));
  }

  /** ticket.auto_close — resolved ticket silent > thresholdMin (no new message). */
  private async detectAutoClose(
    tenantId: string,
    now: Date,
    cfg: EffectiveRuleConfig,
  ): Promise<EventDraft[]> {
    if (!cfg.enabled) return [];

    const cutoff = new Date(now.getTime() - cfg.thresholdMin * 60_000);
    const convs = await this.prisma.aiConversation.findMany({
      where: { tenantId, resolvedAt: { not: null, lt: cutoff }, status: 'open' as any },
      select: { id: true, resolvedAt: true },
    });

    return convs.map((c) => ({
      tenantId, ruleId: 'ticket.auto_close', subjectId: c.id,
      level: cfg.level, severity: 'INFO',
      metadata: { resolvedAt: c.resolvedAt },
    }));
  }

  // ─── Upsert helper ─────────────────────────────────────────────────────────

  /** Idempotently persists events using an hourly bucket in the dedupeKey. */
  private async upsertEvents(drafts: EventDraft[], now: Date): Promise<void> {
    if (drafts.length === 0) return;

    // Bucket: YYYY-MM-DDTHH (hourly — same event won't fire twice in the same hour).
    const bucket = now.toISOString().slice(0, 13);

    await Promise.all(
      drafts.map((d) => {
        const dedupeKey = `${d.tenantId}:${d.ruleId}:${d.subjectId}:${bucket}`;
        return this.prisma.pendingConversationEvent
          .upsert({
            where:  { dedupeKey },
            update: {}, // already exists — don't override status if DISMISSED/RESOLVED
            create: {
              tenantId:  d.tenantId,
              ruleId:    d.ruleId,
              subjectId: d.subjectId,
              dedupeKey,
              level:     d.level,
              severity:  d.severity,
              status:    'OPEN',
              metadata:  (d.metadata ?? {}) as any,
            },
          })
          .catch(() => {}); // unique constraint race — safe to ignore
      }),
    );
  }
}
