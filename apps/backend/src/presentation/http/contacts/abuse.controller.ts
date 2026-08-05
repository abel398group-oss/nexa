/**
 * Painel de moderação — números banidos por tentativa de manipular a Lia.
 *
 * O banimento em si acontece sozinho (AbuseGuardService, "3 strikes"). Este
 * controller é só a janela pro admin ver quem foi banido e reverter se algum
 * caso for falso positivo — regex de detecção erra ocasionalmente, e um
 * banimento sem saída manual seria pior que o problema que resolve.
 */
import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AbuseGuardService } from '@/application/contacts/abuse-guard.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('contacts')
@Controller('contacts/abuse')
export class AbuseController {
  constructor(private readonly abuseGuard: AbuseGuardService) {}

  @Get('banned')
  listBanned(@CurrentTenant() tenantId: string) {
    return this.abuseGuard.listBanned(tenantId);
  }

  @Post(':phone/unban')
  unban(@CurrentTenant() tenantId: string, @Param('phone') phone: string) {
    return this.abuseGuard.unban(tenantId, phone);
  }
}
