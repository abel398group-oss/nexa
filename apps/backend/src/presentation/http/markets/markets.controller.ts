import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { MarketsService } from '@/application/markets/markets.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

/// `role` distingue quem trabalha o mercado de quem lidera nele. Opcional: o padrão
/// `seller` cobre o caso normal, e um DTO que exigisse o campo faria a tela mandar
/// sempre o mesmo valor à mão.
class LinkSellerDto {
  @IsOptional()
  @IsIn(['seller', 'lead'])
  role?: 'seller' | 'lead';
}

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

  /**
   * Vendedores do mercado (`SellerMarket`) — vinculados e disponíveis.
   *
   * É o que decide quem pode receber lead deste mercado: a transferência do SDR só
   * aceita closer vinculado. Sem esta lista, montar a operação exigia INSERT na mão.
   */
  @Get(':code/sellers')
  @RequirePerm('settings')
  sellers(@CurrentTenant() tenantId: string, @Param('code') code: string) {
    return this.markets.vendedoresDoMercado(tenantId, code);
  }

  @Post(':code/sellers/:sellerId')
  @RequirePerm('settings')
  linkSeller(
    @CurrentTenant() tenantId: string,
    @Param('code') code: string,
    @Param('sellerId') sellerId: string,
    @Body() body: LinkSellerDto,
  ) {
    return this.markets.vincularVendedor(tenantId, code, sellerId, body.role);
  }

  @Delete(':code/sellers/:sellerId')
  @RequirePerm('settings')
  unlinkSeller(
    @CurrentTenant() tenantId: string,
    @Param('code') code: string,
    @Param('sellerId') sellerId: string,
  ) {
    return this.markets.desvincularVendedor(tenantId, code, sellerId);
  }
}
