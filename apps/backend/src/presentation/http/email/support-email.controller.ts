/**
 * SupportEmailController — roteamento de e-mail de escalonamento por tenant/categoria.
 *
 * GET    /api/settings/support-email/routes          → lista rotas do tenant
 * PUT    /api/settings/support-email/routes          → cria/atualiza rota { category?, email, label? }
 * DELETE /api/settings/support-email/routes/:id      → remove rota por id
 *
 * Requer perm 'admin'. tenantId vem do @CurrentTenant (JWT).
 * category = null/ausente = rota padrão (fallback).
 * Listener resolve: rota da categoria → rota padrão → SUPPORT_EMAIL env → não envia.
 */
import { Controller, Get, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { EmailChannelService } from '@/application/email/email-channel.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

class UpsertSupportRouteDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string; // ausente/null = rota padrão

  @IsEmail({}, { message: 'E-mail inválido' })
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('admin')
@Controller('settings/support-email/routes')
export class SupportEmailController {
  constructor(private readonly service: EmailChannelService) {}

  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.service.listSupportRoutes(tenantId);
  }

  @Put()
  upsert(@CurrentTenant() tenantId: string, @Body() body: UpsertSupportRouteDto) {
    return this.service.upsertSupportRoute(
      tenantId,
      body.category?.trim() || null,
      body.email.trim(),
      body.label?.trim(),
    );
  }

  @Delete(':id')
  delete(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.deleteSupportRoute(id, tenantId);
  }
}
