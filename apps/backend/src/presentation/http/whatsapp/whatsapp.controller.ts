import { Body, Controller, ForbiddenException, Post, Query } from '@nestjs/common';
import { WhatsappService } from '@/application/whatsapp/whatsapp.service';

// Webhook do WAHA (inbound WhatsApp). PÚBLICO (sem JWT), protegido por token opcional.
@Controller('webhooks')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Post('waha')
  async waha(@Body() body: any, @Query('token') token?: string) {
    // se WAHA_WEBHOOK_TOKEN estiver configurado, exige ?token= igual
    const expected = process.env.WAHA_WEBHOOK_TOKEN;
    if (expected && token !== expected) {
      throw new ForbiddenException('token inválido');
    }
    const event = body?.event ?? body?.body?.event;
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
