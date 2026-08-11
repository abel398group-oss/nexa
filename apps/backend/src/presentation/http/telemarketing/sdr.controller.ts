import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SdrService } from '@/application/telemarketing/sdr.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';
import { DescartarDto, PausarDto, RegistrarAtividadeDto } from './dto/sdr.dto';

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
    return this.sdr.pausar(tenantId, user, id, new Date(dto.retornoEm), dto.notes);
  }

  @Patch('opportunities/:id/discard')
  @RequirePerm('telemarketing')
  descartar(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: Usuario,
    @Param('id') id: string,
    @Body() dto: DescartarDto,
  ) {
    return this.sdr.descartar(tenantId, user, id, dto.motivo, dto.notes);
  }

  // FALTA: passar pro closer. Depende de uma decisão do Abel — o SDR escolhe o closer
  // numa lista, ou o sistema distribui por round-robin entre os membros do mercado
  // (`SellerMarket`)? Existe `pickAndClaimSeller` fazendo round-robin, e ele foi o
  // centro do incidente de 09/07/2026, então não se mexe nele por palpite.
}
