import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CloserService } from '@/application/telemarketing/closer.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';
import {
  AdiarDto,
  GanhouDto,
  PerdeuDto,
  PropostaDto,
  ReagendarDto,
} from './dto/closer.dto';

type Usuario = { userId?: string; role?: string; sellerId?: string | null };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('closer')
export class CloserController {
  constructor(private readonly closer: CloserService) {}

  /// Painel "HOJE": os 3 blocos já agrupados e ordenados. Sempre devolve as três
  /// chaves, mesmo vazias — a tela renderiza os cabeçalhos de qualquer forma.
  @Get('today')
  @RequirePerm('closer')
  hoje(@CurrentTenant() tenantId: string, @CurrentUser() user: Usuario) {
    return this.closer.hoje(tenantId, user);
  }

  /// Material aprovado do mercado (roteiro + portfólio validados na Validação de
  /// Campanha) — a mesma leitura que a mesa do SDR tem, agora do lado do closer.
  @Get('material-aprovado')
  @RequirePerm('closer')
  materialAprovado(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: Usuario,
    @Query('productCode') productCode: string,
  ) {
    return this.closer.materialAprovadoDoMercado(tenantId, productCode, user);
  }

  @Patch('opportunities/:id/proposal')
  @RequirePerm('closer')
  proposta(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: Usuario,
    @Param('id') id: string,
    @Body() dto: PropostaDto,
  ) {
    return this.closer.registrarProposta(tenantId, user, id, dto.valor, dto.notes);
  }

  @Patch('opportunities/:id/reschedule')
  @RequirePerm('closer')
  reagendar(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: Usuario,
    @Param('id') id: string,
    @Body() dto: ReagendarDto,
  ) {
    return this.closer.reagendar(
      tenantId,
      user,
      id,
      new Date(dto.meetingAt),
      dto.meetingUrl,
      dto.notes,
    );
  }

  /// Ganhou: etapa, valor e `Contact.customerSince` na mesma transação — é o que
  /// impede o cliente novo de receber campanha fria antes de existir no TMS.
  @Patch('opportunities/:id/win')
  @RequirePerm('closer')
  ganhou(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: Usuario,
    @Param('id') id: string,
    @Body() dto: GanhouDto,
  ) {
    return this.closer.ganhou(tenantId, user, id, dto.valor, dto.notes);
  }

  @Patch('opportunities/:id/lose')
  @RequirePerm('closer')
  perdeu(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: Usuario,
    @Param('id') id: string,
    @Body() dto: PerdeuDto,
  ) {
    return this.closer.perdeu(tenantId, user, id, dto.motivo, dto.notes);
  }

  /// Perda por timing: volta pra fila na data, em vez de morrer. É a versão mínima do
  /// "cultivador" sem módulo novo.
  @Patch('opportunities/:id/postpone')
  @RequirePerm('closer')
  adiar(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: Usuario,
    @Param('id') id: string,
    @Body() dto: AdiarDto,
  ) {
    return this.closer.adiar(
      tenantId,
      user,
      id,
      new Date(dto.voltarEm),
      dto.motivo,
      dto.notes,
    );
  }
}
