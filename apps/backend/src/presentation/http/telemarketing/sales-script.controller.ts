import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SalesScriptService } from '@/application/telemarketing/sales-script.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';

class ObjecaoDto {
  @IsString()
  @MaxLength(200)
  situacao!: string;

  @IsString()
  @MaxLength(4000)
  resposta!: string;
}

/// Campos opcionais porque a tela salva um item por vez (o popup do duplo clique). O que
/// não vier é herdado da versão anterior — sem isso, editar a abertura do WhatsApp
/// apagaria as outras seis.
class SalvarRoteiroDto {
  @IsOptional() @IsString() @MaxLength(4000) aberturaCall?: string;
  @IsOptional() @IsString() @MaxLength(4000) aberturaWhatsapp?: string;
  @IsOptional() @IsString() @MaxLength(8000) aberturaEmail?: string;
  @IsOptional() @IsString() @MaxLength(200) assuntoEmail?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObjecaoDto)
  objecoes?: ObjecaoDto[];
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sales-scripts')
export class SalesScriptController {
  constructor(private readonly scripts: SalesScriptService) {}

  /**
   * Roteiro vigente do mercado.
   *
   * Perm `telemarketing` e não `settings`: o SDR PRECISA ler — é o que ele fala. Escrever
   * é que fica atrás de `settings`, e essa separação é a regra "o SDR lê, não edita".
   */
  @Get(':productCode')
  @RequirePerm('telemarketing')
  vigente(@CurrentTenant() tenantId: string, @Param('productCode') code: string) {
    return this.scripts.vigente(tenantId, code);
  }

  @Get(':productCode/history')
  @RequirePerm('settings')
  historico(@CurrentTenant() tenantId: string, @Param('productCode') code: string) {
    return this.scripts.historico(tenantId, code);
  }

  /// PUT e não PATCH: cada salvamento publica uma versão nova inteira, não altera a
  /// existente.
  @Put(':productCode')
  @RequirePerm('settings')
  salvar(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: { userId?: string } | undefined,
    @Param('productCode') code: string,
    @Body() dto: SalvarRoteiroDto,
  ) {
    return this.scripts.salvar(tenantId, code, dto, user?.userId);
  }
}
