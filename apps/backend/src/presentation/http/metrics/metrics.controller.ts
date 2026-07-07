import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { MetricsService } from '@/application/metrics/metrics.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('overview')
  overview(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const sellerId = user?.role === 'vendedor' ? (user.sellerId ?? '__none__') : undefined;
    return this.metrics.overview(tenantId, sellerId, { from, to });
  }

  @Get('timeseries')
  timeseries(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const sellerId = user?.role === 'vendedor' ? (user.sellerId ?? '__none__') : undefined;
    return this.metrics.timeseries(tenantId, sellerId, { from, to });
  }

  @Get('sellers')
  sellersKpi(@CurrentTenant() tenantId: string) {
    return this.metrics.sellersKpi(tenantId);
  }

  @Get('support')
  supportOverview(
    @CurrentTenant() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.metrics.supportOverview(tenantId, { from, to });
  }

  // A1: taxa IA vs humano (últimos N dias, padrão 7)
  @Get('resolution')
  resolution(
    @CurrentTenant() tenantId: string,
    @Query('days') days?: string,
  ) {
    return this.metrics.resolutionMetrics(tenantId, days ? Math.min(parseInt(days, 10), 90) : 7);
  }

  // Gaps do KB: tickets escalados com pergunta original + frequência
  @Get('support/gaps')
  escalationGaps(
    @CurrentTenant() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.metrics.escalationGaps(
      tenantId,
      { from, to },
      limit ? Math.min(parseInt(limit, 10), 100) : 30,
    );
  }

  // A2: efetividade de uma campanha individual
  @Get('campaigns/:id')
  async campaignMetrics(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    const result = await this.metrics.campaignMetrics(tenantId, id);
    if (!result) throw new NotFoundException('Campanha não encontrada');
    return result;
  }
}
