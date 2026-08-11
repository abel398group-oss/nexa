import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SdrService } from '@/application/telemarketing/sdr.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';
import {
  DescartarDto,
  PausarDto,
  RegistrarAtividadeDto,
  TransferirDto,
} from './dto/sdr.dto';

type Usuario = { userId?: string; role?: string; sellerId?: string | null };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sdr')
export class SdrController {
  constructor(private readonly sdr: SdrService) {}

  /// Fila do SDR numa chamada só — oportunidade, contato, lote e histórico juntos.
  /// Já ordenada e com a prioridade calculada, pra tela agrupar sem repetir a regra.
  @Get('queue')
  @RequirePerm('telemarketing')
  fila(@CurrentTenant() tenantId: string, @CurrentUser() user: Usuario) {
    return this.sdr.fila(tenantId, user);
  }

  @Post('activity')
  @RequirePerm('telemarketing')
  registrar(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: Usuario,
    @Body() dto: RegistrarAtividadeDto,
  ) {
    return this.sdr.registrarAtividade(tenantId, user, dto);
  }

  @Patch('opportunities/:id/pause')
  @RequirePerm('telemarketing')
  pausar(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: Usuario,
    @Param('id') id: string,
    @Body() dto: PausarDto,
  ) {
    return this.sdr.pausar(
      tenantId,
      user,
      id,
      new Date(dto.retornoEm),
      dto.notes,
      dto.scriptVersion,
    );
  }

  @Patch('opportunities/:id/discard')
  @RequirePerm('telemarketing')
  descartar(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: Usuario,
    @Param('id') id: string,
    @Body() dto: DescartarDto,
  ) {
    return this.sdr.descartar(tenantId, user, id, dto.motivo, dto.notes, dto.scriptVersion);
  }

  /// Closers elegíveis para um mercado — é a lista que o SDR escolhe na tela.
  @Get('closers')
  @RequirePerm('telemarketing')
  closers(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: Usuario,
    @Query('productCode') productCode: string,
  ) {
    return this.sdr.closersDoMercado(tenantId, productCode, user?.sellerId);
  }

  /// Material de consulta do mercado — a base de conhecimento filtrada, só leitura.
  /// Fica em `telemarketing` e não em `knowledge`: aquela permissão deixa editar o
  /// acervo, e o SDR precisa consultar durante a ligação, não reescrever.
  @Get('knowledge')
  @RequirePerm('telemarketing')
  material(
    @CurrentTenant() tenantId: string,
    @Query('productCode') productCode: string,
    @Query('q') q?: string,
  ) {
    return this.sdr.materialDoMercado(tenantId, productCode, q);
  }

  /// Passa pro closer: escolha direta pelo SDR (decidido 11/08), sem round-robin —
  /// `pickAndClaimSeller` foi o centro do incidente de 09/07 e não se mexe nele para
  /// atender uma tela nova.
  @Patch('opportunities/:id/transfer')
  @RequirePerm('telemarketing')
  transferir(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: Usuario,
    @Param('id') id: string,
    @Body() dto: TransferirDto,
  ) {
    return this.sdr.transferir(tenantId, user, id, {
      closerId: dto.closerId,
      meetingAt: dto.meetingAt ? new Date(dto.meetingAt) : undefined,
      meetingUrl: dto.meetingUrl,
      notes: dto.notes,
      scriptVersion: dto.scriptVersion,
    });
  }
}
