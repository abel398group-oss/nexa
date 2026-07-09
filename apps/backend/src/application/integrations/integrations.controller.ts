/**
 * IntegrationsController — machine-to-machine endpoints for TMS ↔ Nexa sync.
 *
 * Auth: shared secret via `x-tms-secret` header (env TMS_SYNC_SECRET).
 * No JWT — these are server-to-server calls, not user-facing.
 *
 * POST /integrations/plan-sync   → update PlanLimit.plan for a tenant
 */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Logger,
  Post,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { safeEqual } from '@/shared/utils/safe-compare';

/** Plans recognised by Nexa. Mirrors MONITOR_PLANS in monitor.controller.ts. */
const VALID_PLANS = ['free', 'starter', 'pro', 'enterprise', 'profissional', 'corporativo'] as const;
type Plan = (typeof VALID_PLANS)[number];

class PlanSyncDto {
  /** ID do tenant NO NEXA. Opcional quando `tmsTenantId` é enviado. */
  @IsOptional()
  @IsString()
  tenantId?: string;

  /**
   * ID do tenant NO TMS. O Nexa resolve para o tenant local via env
   * TMS_TENANT_ID_<SLUG> — mesmo mapeamento do POST /monitor/ingest.
   * Preferir este campo: o TMS não precisa conhecer IDs do Nexa.
   */
  @IsOptional()
  @IsString()
  tmsTenantId?: string;

  @IsIn(VALID_PLANS)
  plan!: Plan;
}

// C2 (auditoria 2026-07-08): endpoint server-to-server (TMS → Nexa), autenticado por
// x-tms-secret. Isento do ThrottlerGuard global para não descartar sincronizações de
// plano sob rajada — o TMS pode disparar vários plan-sync em sequência.
@SkipThrottle()
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
    // B1 (auditoria 2026-07-08): comparação em tempo constante (evita timing attack no secret).
    if (!expected || !safeEqual(secret, expected)) {
      this.logger.warn(`plan-sync: tentativa com secret inválido para tenant ${dto.tenantId ?? dto.tmsTenantId}`);
      throw new ForbiddenException('Unauthorized');
    }

    const tenantId = dto.tenantId ?? (dto.tmsTenantId ? await this.resolveTmsTenant(dto.tmsTenantId) : null);
    if (!tenantId) {
      throw new BadRequestException(
        dto.tmsTenantId
          ? `tmsTenantId "${dto.tmsTenantId}" não mapeado para nenhum tenant ativo do Nexa`
          : 'Informe tenantId (Nexa) ou tmsTenantId (TMS)',
      );
    }

    const updated = await this.prisma.planLimit.upsert({
      where:  { tenantId },
      create: { tenantId, plan: dto.plan },
      update: { plan: dto.plan },
      select: { tenantId: true, plan: true, updatedAt: true },
    });

    this.logger.log(`plan-sync: tenant=${tenantId} plan=${dto.plan}`);
    return { synced: true, ...updated };
  }

  /**
   * tmsTenantId → tenant Nexa via env TMS_TENANT_ID_<SLUG> (mesmo mapeamento
   * usado pelo monitor/ingest — fonte única do vínculo entre os dois sistemas).
   */
  private async resolveTmsTenant(tmsTenantId: string): Promise<string | null> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, slug: true },
    });
    const match = tenants.find((t) => {
      const key = `TMS_TENANT_ID_${t.slug.toUpperCase().replace(/-/g, '_')}`;
      return process.env[key] === tmsTenantId;
    });
    return match?.id ?? null;
  }
}
