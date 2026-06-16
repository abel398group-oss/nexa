import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MetricsService } from '@/application/metrics/metrics.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
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
}
