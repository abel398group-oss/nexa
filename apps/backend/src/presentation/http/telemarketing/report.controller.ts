import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { TelemarketingReportService } from '@/application/telemarketing/report.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('telemarketing/report')
export class TelemarketingReportController {
  constructor(private readonly report: TelemarketingReportService) {}

  /**
   * Relatório comercial: por lote, por vendedor e por versão de roteiro.
   *
   * Fica atrás de `metrics`, permissão que já existe e já é o "quem pode ver número da
   * operação". Criar uma permissão nova exigiria registrá-la em AREAS e em ALL_AREAS —
   * e esquecer disso é exatamente o que deixou o telemarketing inacessível ontem.
   */
  @Get()
  @RequirePerm('metrics')
  relatorio(
    @CurrentTenant() tenantId: string,
    @Query('productCode') productCode?: string,
  ) {
    return this.report.relatorio(tenantId, productCode);
  }
}
