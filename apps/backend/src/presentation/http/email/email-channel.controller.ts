/**
 * EmailChannelController — configuracoes do canal de e-mail por tenant.
 *
 * GET    /api/settings/email-channel        -> le config (sem senhas)
 * PUT    /api/settings/email-channel        -> salva / atualiza config
 * PATCH  /api/settings/email-channel/active -> ativa/desativa o canal
 *
 * tenantId vem do @CurrentTenant (fail-closed): usuario comum -> tenant do token;
 * platform admin sem cliente selecionado -> 403. Nunca cai em 'default' silencioso.
 */
import { Controller, Get, Put, Patch, Body, UseGuards } from '@nestjs/common';
import { EmailChannelService, UpsertEmailChannelDto } from '@/application/email/email-channel.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('settings/email-channel')
export class EmailChannelController {
  constructor(private readonly service: EmailChannelService) {}

  @Get()
  get(@CurrentTenant() tenantId: string) {
    return this.service.get(tenantId);
  }

  @Put()
  upsert(@CurrentTenant() tenantId: string, @Body() body: UpsertEmailChannelDto) {
    return this.service.upsert(tenantId, body);
  }

  @Patch('active')
  setActive(@CurrentTenant() tenantId: string, @Body() body: { isActive: boolean }) {
    return this.service.setActive(tenantId, body.isActive);
  }
}
