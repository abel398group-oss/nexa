import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { AutonomyService } from '@/shared/governance/autonomy.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { AuditService } from '@/shared/audit/audit.service';

class ToggleDto {
  @IsBoolean() enabled!: boolean;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('ai_control')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly autonomy: AutonomyService,
    private readonly audit: AuditService,
  ) {}

  // Estado atual do kill switch
  @Get('autonomy')
  status() {
    return this.autonomy.status();
  }

  // Liga/desliga a autonomia da IA (botão de pânico — ADR 012)
  @Post('autonomy')
  async toggle(@CurrentUser() user: any, @Body() dto: ToggleDto) {
    const who = user?.userId ?? 'admin';
    const result = this.autonomy.setEnabled(dto.enabled, who);
    await this.audit.log({
      tenantId: user?.tenantId ?? 'default',
      userId: user?.userId ?? null,
      action: dto.enabled ? 'autonomy.enabled' : 'autonomy.disabled',
      resource: 'kill_switch',
      metadata: { by: who, role: user?.role },
    });
    return result;
  }
}
