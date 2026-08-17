import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ACTIVITY_TYPES, SellerActivityService } from '@/application/sellers/seller-activity.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '@/shared/dto/pagination.dto';

// Mesmo motivo dos outros: com `forbidNonWhitelisted`, um `@Query('opportunityId')`
// avulso no método não registra o campo — a classe do `@Query()` sem nome é que valida
// a query inteira. Faltando, ver o histórico de uma oportunidade devolvia 400 e a tela
// mostrava "nenhuma atividade".
class ListActivitiesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() opportunityId?: string;
}

class CreateActivityDto {
  // Ignorado quando o usuário é vendedor — o sellerId real vem do escopo do
  // JWT (ver sellerScopeOf), nunca do corpo (mesmo motivo de opportunities).
  @IsOptional() @IsString() sellerId?: string;
  @IsOptional() @IsString() opportunityId?: string;
  @IsIn(ACTIVITY_TYPES as any) type!: string;
  @IsOptional() @IsString() result?: string;
  @IsOptional() @IsInt() @Min(0) durationSec?: number;
  @IsOptional() @IsString() notes?: string;
}

/**
 * F6+ seller-leads: role `vendedor` opera SOMENTE as próprias atividades — o
 * escopo vem do JWT (user.sellerId), nunca de query/body. Vendedor sem
 * sellerId vira '__none__' (não casa com nada). Demais roles: sem escopo.
 */
function sellerScopeOf(user: { role?: string; sellerId?: string | null } | undefined): string | undefined {
  if (user?.role !== 'vendedor') return undefined;
  return user.sellerId ?? '__none__';
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('sellers')
@Controller('seller-activities')
export class SellerActivityController {
  constructor(private readonly activities: SellerActivityService) {}

  @Get()
  findAll(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query() q: ListActivitiesQueryDto,
  ) {
    return this.activities.findAll(tenantId, q, q.opportunityId, sellerScopeOf(user));
  }

  @Get('summary')
  summary(@CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    return this.activities.summary(tenantId, sellerScopeOf(user));
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Body() dto: CreateActivityDto) {
    const scope = sellerScopeOf(user);
    const sellerId = scope ? (scope === '__none__' ? undefined : scope) : dto.sellerId;
    if (!sellerId) {
      throw new BadRequestException('sellerId é obrigatório');
    }
    return this.activities.create(tenantId, { ...dto, sellerId });
  }
}
