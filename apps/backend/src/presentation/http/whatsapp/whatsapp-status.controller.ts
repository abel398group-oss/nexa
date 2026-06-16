import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { WahaHealthService } from '@/application/whatsapp/waha-health.service';

/**
 * Status da conexão do WhatsApp (sessão WAHA) para exibir no painel.
 * Protegido só por login (qualquer usuário autenticado pode consultar — não é dado
 * sensível, e tanto o Dashboard quanto a Saúde dos Números usam). Sem RequirePerm
 * para não bloquear o vendedor no Dashboard.
 */
@ApiTags('whatsapp')
@UseGuards(JwtAuthGuard)
@Controller('whatsapp')
export class WhatsappStatusController {
  constructor(private readonly health: WahaHealthService) {}

  @Get('status')
  status() {
    return this.health.getHealth();
  }
}
