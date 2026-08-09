import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { MarketsService } from '@/application/markets/markets.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('markets')
export class MarketsController {
  constructor(private readonly markets: MarketsService) {}

  /**
   * `?liberados=true` é o que a tela de Disparo consome: devolve só mercados ativos e
   * sem o relatório de pendências. Mercado em rascunho não pode aparecer no seletor do
   * vendedor, senão a trava de liberação não serve para nada (ADR 037).
   */
  @Get()
  @RequirePerm('campaigns')
  list(@CurrentTenant() tenantId: string, @Query('liberados') liberados?: string) {
    return this.markets.list(tenantId, { somenteLiberados: liberados === 'true' });
  }

  @Get(':code/readiness')
  @RequirePerm('settings')
  readiness(@CurrentTenant() tenantId: string, @Param('code') code: string) {
    return this.markets.readiness(tenantId, code);
  }

  // Liberar e suspender mudam o que o vendedor enxerga — ficam atrás de 'settings',
  // não de 'campaigns'.
  @Post(':code/release')
  @RequirePerm('settings')
  release(@CurrentTenant() tenantId: string, @Param('code') code: string) {
    return this.markets.release(tenantId, code);
  }

  @Post(':code/pause')
  @RequirePerm('settings')
  pause(@CurrentTenant() tenantId: string, @Param('code') code: string) {
    return this.markets.pause(tenantId, code);
  }
}
