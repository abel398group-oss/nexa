import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

export interface RuleDefaults {
  ruleId: string;
  level: string;
  thresholdMin: number;
}

// Global defaults applied when a tenant has no override for a rule.
export const RULE_DEFAULTS: RuleDefaults[] = [
  { ruleId: 'conversation.stale_open',     level: 'L1', thresholdMin: 240  }, // 4h
  { ruleId: 'conversation.lead_no_reply',  level: 'L2', thresholdMin: 1440 }, // 24h
  { ruleId: 'conversation.sla_breach',     level: 'L1', thresholdMin: 60   }, // 1h
  { ruleId: 'campaign.followup_due',       level: 'L2', thresholdMin: 2880 }, // 48h
  { ruleId: 'ticket.auto_close',           level: 'L3', thresholdMin: 2880 }, // 48h
  { ruleId: 'conversation.digest',         level: 'L1', thresholdMin: 0    }, // fired by cron schedule
];

export interface EffectiveRuleConfig {
  ruleId: string;
  enabled: boolean;
  level: string;
  thresholdMin: number;
}

@Injectable()
export class ProactiveRuleConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns effective config for all rules for a tenant (DB overrides merged with defaults). */
  async getConfig(tenantId: string): Promise<Map<string, EffectiveRuleConfig>> {
    const rows = await this.prisma.proactiveRuleConfig.findMany({ where: { tenantId } });
    const overrides = new Map(rows.map((r) => [r.ruleId, r]));

    const result = new Map<string, EffectiveRuleConfig>();
    for (const def of RULE_DEFAULTS) {
      const ov = overrides.get(def.ruleId);
      result.set(def.ruleId, {
        ruleId:       def.ruleId,
        enabled:      ov?.enabled       ?? true,
        level:        ov?.level         ?? def.level,
        thresholdMin: ov?.thresholdMin  ?? def.thresholdMin,
      });
    }
    return result;
  }

  /** Ensures default rows exist for a new tenant (called during onboarding). */
  async seedDefaults(tenantId: string): Promise<void> {
    await Promise.all(
      RULE_DEFAULTS.map((def) =>
        this.prisma.proactiveRuleConfig.upsert({
          where:  { tenantId_ruleId: { tenantId, ruleId: def.ruleId } },
          update: {},
          create: { tenantId, ruleId: def.ruleId, level: def.level, thresholdMin: def.thresholdMin },
        }),
      ),
    );
  }
}
