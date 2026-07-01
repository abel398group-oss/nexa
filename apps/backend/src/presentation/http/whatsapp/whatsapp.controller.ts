import { Body, Controller, ForbiddenException, Headers, Logger, Post, Query } from '@nestjs/common';
import { WhatsappService } from '@/application/whatsapp/whatsapp.service';
import { WahaHealthService } from '@/application/whatsapp/waha-health.service';

// Webhook do WAHA (inbound WhatsApp). PÚBLICO (sem JWT), protegido por token OBRIGATÓRIO.
// Aceita token no header X-Waha-Token (preferido) OU query string ?token= (legacy).
// Migração: configurar WAHA para enviar X-Waha-Token e remover o fallback de query string.
@Controller('webhooks')
export class WhatsappController {
  private readonly logger = new Logger('WahaWebhook');
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly health: WahaHealthService,
  ) {}

  @Post('waha')
  async waha(
    @Body() body: any,
    @Headers('x-waha-token') headerToken?: string,
    @Query('token') queryToken?: string,
  ) {
    // Header tem prioridade; query string mantida como fallback durante migração
    const token = headerToken ?? queryToken;
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
    // mudança de estado da sessão (CONNECTED/STOPPED/FAILED) → monitor de saúde
    if (event === 'session.status') {
      await this.health.handleStatusEvent(body);
      return { ok: true };
    }
    // só processa eventos de mensagem nova
    if (event && event !== 'message') {
      return { ignored: true, reason: `evento ${event}` };
    }
    return this.whatsapp.process(body, process.env.NEXA_DEFAULT_TENANT_ID ?? 'default');
  }
}
