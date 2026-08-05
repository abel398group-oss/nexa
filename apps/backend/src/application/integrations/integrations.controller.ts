/**
 * IntegrationsController — machine-to-machine endpoints for TMS ↔ Nexa sync.
 *
 * Auth: shared secret via `x-tms-secret` header (env TMS_SYNC_SECRET).
 * No JWT — these are server-to-server calls, not user-facing.
 *
 * POST /integrations/plan-sync   → update PlanLimit.plan (and monitorExtraNumbers) for a tenant
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
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { safeEqual } from '@/shared/utils/safe-compare';

/**
 * Plans recognised by Nexa. Mirrors MONITOR_PLANS in monitor.controller.ts.
 * Keep in sync when adding new plan codes.
 */
const VALID_PLANS = [
  'free', 'starter',
  'basico',
  'essencial',
  'pro', 'professional',
  'enterprise', 'corporativo', 'corporate',
  'profissional',
] as const;
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

  /**
   * Extra WhatsApp numbers purchased by the tenant (R$ 29.90/number/month).
   * Optional — when omitted the existing value is preserved (no reset to 0).
   * Billed by TMS/Asaas; Nexa only stores the count to compute the limit.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  monitorExtraNumbers?: number;

  /**
   * WhatsApp numbers included in the plan, as defined in the TMS plan catalogue
   * (system_admin_plan.monitor_numbers_included). The TMS owns this number —
   * Nexa only enforces it (ADR 011). `-1` means unlimited (Corporativo); Nexa
   * caps it at its own technical limit.
   *
   * Optional for backward compatibility: omitting it preserves the current
   * value, and a tenant that was never synced falls back to MONITOR_WA_INCLUDED.
   */
  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(100)
  monitorNumbersIncluded?: number;
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
   * Called by HiperTMS whenever a tenant's plan or extra WhatsApp licenses change.
   * Updates PlanLimit.plan and (optionally) PlanLimit.monitorExtraNumbers.
   *
   * Body:  { tenantId?, tmsTenantId?, plan, monitorExtraNumbers?, monitorNumbersIncluded? }
   * Auth:  x-tms-secret header must match env TMS_SYNC_SECRET
   *
   * monitorExtraNumbers and monitorNumbersIncluded are optional — omitting either
   * preserves its current value. The TMS must send monitorExtraNumbers when the
   * tenant buys or cancels add-on numbers, and monitorNumbersIncluded on every
   * sync so the plan catalogue stays authoritative (ADR 011).
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

    // Only update these when the TMS explicitly sends them.
    // Omitting a field preserves the current value (no accidental reset to 0).
    const extraUpdate =
      dto.monitorExtraNumbers !== undefined
        ? { monitorExtraNumbers: dto.monitorExtraNumbers }
        : {};
    const includedUpdate =
      dto.monitorNumbersIncluded !== undefined
        ? { monitorNumbersIncluded: dto.monitorNumbersIncluded }
        : {};

    const updated = await this.prisma.planLimit.upsert({
      where:  { tenantId },
      create: {
        tenantId,
        plan: dto.plan,
        monitorExtraNumbers: dto.monitorExtraNumbers ?? 0,
        // null when the TMS omits it → monitorWaIncluded() falls back to the table
        monitorNumbersIncluded: dto.monitorNumbersIncluded ?? null,
      },
      update: { plan: dto.plan, ...extraUpdate, ...includedUpdate },
      select: {
        tenantId: true,
        plan: true,
        monitorExtraNumbers: true,
        monitorNumbersIncluded: true,
        updatedAt: true,
      },
    });

    this.logger.log(
      `plan-sync: tenant=${tenantId} plan=${dto.plan}` +
      (dto.monitorExtraNumbers !== undefined ? ` extraNumbers=${dto.monitorExtraNumbers}` : '') +
      (dto.monitorNumbersIncluded !== undefined ? ` included=${dto.monitorNumbersIncluded}` : ''),
    );
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
