import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MarketsService } from '@/application/markets/markets.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

class LinkSellerDto {
  @IsOptional()
  @IsIn(['seller', 'lead'])
  role?: 'seller' | 'lead';
}

/// Criação de mercado. `slug` vira o `code` do produto — a chave que separa
/// conhecimento, campanha e conector em todo o sistema (ADR 037). Por isso o formato
/// é validado aqui e não só normalizado no service: um code com espaço ou acento
/// entraria em rota, filtro e chave de Redis e só quebraria muito depois.
class CreateMarketDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do market é obrigatório.' })
  @MaxLength(80)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'O identificador (slug) é obrigatório.' })
  @MaxLength(40)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'O identificador deve ter apenas letras minúsculas, números e hífen (ex.: agabe, oleo-lubrificante).',
  })
  slug!: string;
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
  // `campaigns` OU `settings`: a lista serve a dois públicos — quem dispara escolhe o
  // mercado no formulário, e quem configura a operação abre a tela de Markets. Com
  // `campaigns` sozinho, o segundo recebia 403 e a tela dizia "nenhum mercado
  // cadastrado", que é falso e manda procurar defeito no lugar errado.
  @Get()
  @RequirePerm('campaigns', 'settings')
  list(@CurrentTenant() tenantId: string, @Query('liberados') liberados?: string) {
    return this.markets.list(tenantId, { somenteLiberados: liberados === 'true' });
  }

  /// Criar mercado fica atrás de 'settings', igual a liberar/suspender: é quem monta a
  /// operação, não quem dispara.
  @Post()
  @RequirePerm('settings')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateMarketDto) {
    return this.markets.create(tenantId, dto);
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
