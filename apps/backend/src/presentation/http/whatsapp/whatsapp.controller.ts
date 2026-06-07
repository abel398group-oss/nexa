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
    // só processa eventos de mensagem
    const event = body?.event ?? body?.body?.event;
    if (event && event !== 'message') {
      return { ignored: true, reason: `evento ${event}` };
    }
    return this.whatsapp.process(body, 'default');
  }
}
