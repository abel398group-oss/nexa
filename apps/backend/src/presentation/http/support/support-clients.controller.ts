import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { SupportClientsService } from '@/application/conversations/support-clients.service';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';
import { IsIntInRange } from '@/shared/dto/is-int-in-range.validator';

/// Todos os filtros num DTO só — com `forbidNonWhitelisted`, parâmetro fora dele
/// derruba a requisição inteira com 400. Ver `query-whitelist.spec.ts`.
class ListarClientesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIntInRange(1, 2000)
  limite: number = 500;
}

/**
 * A base de clientes do módulo TMS: as empresas que usam o produto.
 *
 * A tela "Clientes" montava a lista a partir das CONVERSAS de suporte — era "quem abriu
 * chamado" com nome de "Clientes", e cliente que paga e nunca reclamou não aparecia. Este
 * endpoint devolve a base de verdade, lida do banco do TMS (apenas SELECT).
 *
 * Separado do controller de conversas de propósito: a origem do dado é outro banco, e
 * `falhou` aqui significa "o TMS não respondeu", não "não há clientes". Misturar isso com
 * a listagem de conversas esconderia a diferença.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('support')
@Controller('support')
export class SupportClientsController {
  constructor(private readonly clientes: SupportClientsService) {}

  @Get('clients')
  listar(@CurrentTenant() tenantId: string, @Query() q: ListarClientesQueryDto) {
    return this.clientes.listar(tenantId, q.limite);
  }
}
