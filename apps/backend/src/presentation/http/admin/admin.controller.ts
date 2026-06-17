import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { AutonomyService } from '@/shared/governance/autonomy.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { AuditService } from '@/shared/audit/audit.service';

// Patch parcial: manda só o que muda. `enabled` é compat com a versão antiga
// (mapeia pro master / botão de pânico).
class AutonomyToggleDto {
  @IsOptional() @IsBoolean() master?: boolean;
  @IsOptional() @IsBoolean() whatsapp?: boolean;
  @IsOptional() @IsBoolean() email?: boolean;
  @IsOptional() @IsBoolean() enabled?: boolean; // legado -> master
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('ai_control')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly autonomy: AutonomyService,
    private readonly audit: AuditService,
  ) {}

  // Estado atual do kill switch (master + por canal)
  @Get('autonomy')
  status() {
    return this.autonomy.status();
  }

  // Liga/desliga a autonomia da IA — master (pânico) e/ou por canal (ADR 012)
  @Post('autonomy')
  async toggle(@CurrentUser() user: any, @Body() dto: AutonomyToggleDto) {
    const who = user?.userId ?? 'admin';
    const patch = {
      master: dto.master ?? dto.enabled,
      whatsapp: dto.whatsapp,
      email: dto.email,
    };
    const result = await this.autonomy.setState(patch, who);
    await this.audit.log({
      tenantId: user?.tenantId ?? 'default',
      userId: user?.userId ?? null,
      action: 'autonomy.changed',
      resource: 'kill_switch',
      metadata: { by: who, role: user?.role, patch, result },
    });
    return result;
  }
}
