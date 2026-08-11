import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';
import { LeadImportService } from '@/application/telemarketing/lead-import.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ImportarLoteDto } from './dto/importar-lote.dto';

/// Um vendedor só já é "dar o lote inteiro pra ele" — por isso lista, não campo único.
class DistribuirDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  sellerIds!: string[];
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('lead-batches')
export class LeadBatchesController {
  constructor(private readonly importer: LeadImportService) {}

  /**
   * Importa uma lista e devolve o relatório da peneira: quantos chegaram, quantos
   * ficaram de fora e por quê, com o número da linha no arquivo.
   *
   * O relatório é o ponto do módulo 1 — a peneira roda aqui, na entrada, e não no
   * disparo, justamente para o operador ver a qualidade da lista antes de gastar
   * trabalho com ela.
   */
  @Post()
  @RequirePerm('lead_batches')
  importar(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: { id?: string } | undefined,
    @Body() dto: ImportarLoteDto,
  ) {
    const { csv, ...resto } = dto;
    return this.importer.importar(
      tenantId,
      { ...resto, uploadedByUserId: user?.id },
      csv,
    );
  }

  /// Lista os lotes com os contadores da peneira. É o histórico que responde "qual
  /// lista presta" — por isso ordena do mais recente e devolve os contadores brutos.
  @Get()
  @RequirePerm('lead_batches')
  listar(@CurrentTenant() tenantId: string) {
    return this.importer.listar(tenantId);
  }

  /**
   * Distribui o lote entre os SDRs escolhidos.
   *
   * Passo separado da importação, e obrigatório: lead sem dono não aparece na fila de
   * ninguém. Importar sem distribuir deixa a lista dentro do sistema e fora do trabalho.
   */
  @Post(':id/distribute')
  @RequirePerm('lead_batches')
  distribuir(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: DistribuirDto,
  ) {
    return this.importer.distribuir(tenantId, id, dto.sellerIds);
  }
}
