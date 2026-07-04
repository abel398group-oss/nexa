/**
 * IntegrationsController — machine-to-machine endpoints for TMS ↔ Nexa sync.
 *
 * Auth: shared secret via `x-tms-secret` header (env TMS_SYNC_SECRET).
 * No JWT — these are server-to-server calls, not user-facing.
 *
 * POST /integrations/plan-sync   → update PlanLimit.plan for a tenant
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Logger,
  Post,
} from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { PrismaService } from '@/infra/prisma/prisma.service';

/** Plans recognised by Nexa. Mirrors MONITOR_PLANS in monitor.controller.ts. */
const VALID_PLANS = ['free', 'starter', 'pro', 'enterprise', 'profissional', 'corporativo'] as const;
type Plan = (typeof VALID_PLANS)[number];

class PlanSyncDto {
  @IsString()
  tenantId!: string;

  @IsIn(VALID_PLANS)
  plan!: Plan;
}

@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called by HiperTMS whenever a tenant's plan changes.
   * Updates PlanLimit.plan, which gates Monitor Proativo and future gated features.
   *
   * Body:  { tenantId: string, plan: 'free'|'starter'|'pro'|'enterprise'|'profissional'|'corporativo' }
   * Auth:  x-tms-secret header must match env TMS_SYNC_SECRET
   */
  @Post('plan-sync')
  async planSync(
    @Headers('x-tms-secret') secret: string | undefined,
    @Body() dto: PlanSyncDto,
  ) {
    const expected = process.env.TMS_SYNC_SECRET;
    if (!expected || !secret || secret !== expected) {
      this.logger.warn(`plan-sync: tentativa com secret inválido para tenant ${dto.tenantId}`);
      throw new ForbiddenException('Unauthorized');
    }

    const updated = await this.prisma.planLimit.upsert({
      where:  { tenantId: dto.tenantId },
      create: { tenantId: dto.tenantId, plan: dto.plan },
      update: { plan: dto.plan },
      select: { tenantId: true, plan: true, updatedAt: true },
    });

    this.logger.log(`plan-sync: tenant=${dto.tenantId} plan=${dto.plan}`);
    return { synced: true, ...updated };
  }
}
