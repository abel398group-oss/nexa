import { Body, Controller, ForbiddenException, Logger, Post, Query } from '@nestjs/common';
import { WhatsappService } from '@/application/whatsapp/whatsapp.service';

// Webhook do WAHA (inbound WhatsApp). PÚBLICO (sem JWT), protegido por token OBRIGATÓRIO.
@Controller('webhooks')
export class WhatsappController {
  private readonly logger = new Logger('WahaWebhook');
  constructor(private readonly whatsapp: WhatsappService) {}

  @Post('waha')
  async waha(@Body() body: any, @Query('token') token?: string) {
    // WAHA_WEBHOOK_TOKEN é OBRIGATÓRIO — rejeita se não configurado ou se token não bate
    const expected = process.env.WAHA_WEBHOOK_TOKEN;
    if (!expected) {
      throw new ForbiddenException('WAHA_WEBHOOK_TOKEN não configurado — configure a variável de ambiente');
    }
    if (token !== expected) {
      throw new ForbiddenException('token inválido');
    }
    const event = body?.event ?? body?.body?.event;
    // DEBUG temporário: ver TODO evento que o WAHA manda (confirma se 'message.ack' chega)
    this.logger.log(`[webhook] evento recebido: ${event ?? '(sem event)'}`);
    // recibos de entrega/leitura (✓✓) → atualiza o status da mensagem
    if (event === 'message.ack') {
      return this.whatsapp.handleAck(body);
    }
    // só processa eventos de mensagem nova
    if (event && event !== 'message') {
      return { ignored: true, reason: `evento ${event}` };
    }
    return this.whatsapp.process(body, 'default');
  }
}
