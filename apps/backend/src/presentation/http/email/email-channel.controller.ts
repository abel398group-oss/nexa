/**
 * EmailChannelController — configurações do canal de e-mail por tenant.
 *
 * GET    /api/settings/email-channel        → lê config (sem senhas)
 * PUT    /api/settings/email-channel        → salva / atualiza config
 * PATCH  /api/settings/email-channel/active → ativa/desativa o canal
 */
import { Controller, Get, Put, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { EmailChannelService, UpsertEmailChannelDto } from '@/application/email/email-channel.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('settings/email-channel')
export class EmailChannelController {
  constructor(private readonly service: EmailChannelService) {}

  @Get()
  get(@Request() req: any) {
    const tenantId = req.user?.tenantId ?? 'default';
    return this.service.get(tenantId);
  }

  @Put()
  upsert(@Request() req: any, @Body() body: UpsertEmailChannelDto) {
    const tenantId = req.user?.tenantId ?? 'default';
    return this.service.upsert(tenantId, body);
  }

  @Patch('active')
  setActive(@Request() req: any, @Body() body: { isActive: boolean }) {
    const tenantId = req.user?.tenantId ?? 'default';
    return this.service.setActive(tenantId, body.isActive);
  }
}
