import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MarketAssetsService } from '@/application/markets/market-assets.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';

/**
 * O arquivo chega como TEXTO em JSON, não como `multipart`.
 *
 * O navegador já leu o `.md` com `FileReader` para mostrar a prévia antes de enviar;
 * mandar os mesmos bytes de novo como upload binário só para o servidor decodificar
 * outra vez seria trabalho a troco de nada. `multipart` passa a valer quando entrar
 * PDF, que o navegador não tem como ler.
 */
class SubirAssetDto {
  @IsString()
  @IsNotEmpty({ message: 'O arquivo precisa de um nome.' })
  @MaxLength(200)
  name!: string;

  /// O limite de tamanho de verdade está no service, medido em BYTES — `MaxLength`
  /// conta caracteres, e acento ocupa dois. Aqui é só o teto grosseiro que impede um
  /// corpo absurdo de chegar a ser validado.
  @IsString()
  @IsNotEmpty({ message: 'O arquivo está vazio.' })
  @MaxLength(1_000_000)
  content!: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('markets/:code/assets')
export class MarketAssetsController {
  constructor(private readonly assets: MarketAssetsService) {}

  // Tudo atrás de `settings`, igual a criar e liberar mercado: é quem monta a
  // operação. Aprovar material é decisão de quem responde por ele.
  @Get()
  @RequirePerm('settings')
  listar(@CurrentTenant() tenantId: string, @Param('code') code: string) {
    return this.assets.listar(tenantId, code);
  }

  @Get(':id')
  @RequirePerm('settings')
  ler(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.assets.ler(tenantId, id);
  }

  @Post()
  @RequirePerm('settings')
  subir(
    @CurrentTenant() tenantId: string,
    @Param('code') code: string,
    @Body() dto: SubirAssetDto,
  ) {
    return this.assets.subir(tenantId, code, dto);
  }

  @Post(':id/approve')
  @RequirePerm('settings')
  aprovar(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.assets.aprovar(tenantId, id, user?.id);
  }

  @Post(':id/reject')
  @RequirePerm('settings')
  reprovar(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.assets.reprovar(tenantId, id);
  }

  @Delete(':id')
  @RequirePerm('settings')
  remover(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.assets.remover(tenantId, id);
  }
}
