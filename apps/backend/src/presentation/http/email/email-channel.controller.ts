/**
 * EmailChannelController — caixas de e-mail do tenant.
 *
 * GET    /api/settings/email-channel            -> lista as caixas (sem senhas)
 * PUT    /api/settings/email-channel            -> cria (sem id) ou edita (com id)
 * POST   /api/settings/email-channel/:id/sender -> escolhe quem envia
 * PATCH  /api/settings/email-channel/:id/active -> ativa/desativa a caixa
 * DELETE /api/settings/email-channel/:id        -> remove a caixa
 *
 * Perfis de remetente (10/08/2026): o tenant tem mais de uma caixa — a da Lia e a
 * do vendedor que prospecta. Todas as ativas são lidas; só a remetente envia.
 *
 * tenantId vem do @CurrentTenant (fail-closed): usuario comum -> tenant do token;
 * platform admin sem cliente selecionado -> 403. Nunca cai em 'default' silencioso.
 */
import { Controller, Get, Put, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { EmailChannelService, UpsertEmailChannelDto } from '@/application/email/email-channel.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

// Só `JwtAuthGuard` aqui deixava QUALQUER usuário autenticado do tenant trocar o
// SMTP, escolher a caixa remetente, desativar ou APAGAR o canal de e-mail. A
// rota estava escondida do menu (`<Perm perm="admin">` no App.tsx), mas esconder
// não recusa — bastava digitar a URL. Achado em 12/08/2026.
//
// `'admin'` não está em `AREAS`, então nenhum usuário pode receber essa
// permissão na lista: na prática só `role === 'admin'` passa, que é exatamente o
// que a tela já prometia. Mesmo par usado por `support-email.controller`.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('admin')
@Controller('settings/email-channel')
export class EmailChannelController {
  constructor(private readonly service: EmailChannelService) {}

  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.service.list(tenantId);
  }

  @Put()
  upsert(@CurrentTenant() tenantId: string, @Body() body: UpsertEmailChannelDto) {
    return this.service.upsert(tenantId, body);
  }

  @Post(':id/sender')
  setSender(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.setSender(tenantId, id);
  }

  @Patch(':id/active')
  setActive(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.service.setActive(tenantId, id, body.isActive);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.remove(tenantId, id);
  }
}
