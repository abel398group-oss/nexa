/**
 * SupportEmailController — e-mail de escalonamento configurável por tenant.
 *
 * GET  /api/settings/support-email  → { supportEmail: string | null }
 * PUT  /api/settings/support-email  → { supportEmail: string | null }
 *
 * Requer perm 'admin'. tenantId vem do @CurrentTenant (JWT).
 * supportEmail null = não configurado; SupportEscalationListener cai para SUPPORT_EMAIL env.
 */
import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional } from 'class-validator';
import { EmailChannelService } from '@/application/email/email-channel.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

class SetSupportEmailDto {
  @IsOptional()
  @IsEmail({}, { message: 'E-mail do suporte inválido' })
  supportEmail?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('admin')
@Controller('settings/support-email')
export class SupportEmailController {
  constructor(private readonly service: EmailChannelService) {}

  @Get()
  get(@CurrentTenant() tenantId: string) {
    return this.service.getSupportEmail(tenantId);
  }

  @Put()
  set(@CurrentTenant() tenantId: string, @Body() body: SetSupportEmailDto) {
    return this.service.setSupportEmail(tenantId, body.supportEmail ?? null);
  }
}
