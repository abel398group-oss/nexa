import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PlatformAdminGuard } from '@/shared/auth/platform-admin.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { TenantsService } from '@/application/admin/tenants.service';

// Rotas exclusivas do admin da plataforma (User.tenantId === null).
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin/tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list() {
    return this.tenants.list();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.tenants.getOne(id);
  }

  // "Entrar" no cliente: nao usa o header X-Acting-Tenant-Id, recebe o id no path.
  // Gera o registro de auditoria da entrada.
  @Post(':id/enter')
  enter(@Param('id') id: string, @CurrentUser() user: any, @Req() req: any) {
    return this.tenants.enter(id, user, req?.correlationId);
  }
}
