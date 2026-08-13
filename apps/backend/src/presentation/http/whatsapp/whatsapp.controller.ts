import { Body, Controller, ForbiddenException, Headers, Logger, Post, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { WhatsappService } from '@/application/whatsapp/whatsapp.service';
import { WahaHealthService } from '@/application/whatsapp/waha-health.service';
import { safeEqual } from '@/shared/utils/safe-compare';

// Webhook do WAHA (inbound WhatsApp). PÚBLICO (sem JWT), protegido por token OBRIGATÓRIO.
// Aceita token no header X-Waha-Token (preferido) OU query string ?token= (legacy).
// Migração: configurar WAHA para enviar X-Waha-Token e remover o fallback de query string.
//
// C2 (auditoria 2026-07-08): isento do ThrottlerGuard global (100 req/min por IP).
// O WAHA entrega TODOS os eventos (message, message.ack, session.status) de um único
// IP — sob rajada de campanha/ACKs o rate-limit global devolvia 429 e mensagens de
// clientes eram perdidas silenciosamente. A autenticação aqui é o WAHA_WEBHOOK_TOKEN.
@SkipThrottle()
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
    @Query('linha') linha?: string,
  ) {
    // Header tem prioridade; query string mantida como fallback durante migração
    const token = headerToken ?? queryToken;
    // WAHA_WEBHOOK_TOKEN é OBRIGATÓRIO — rejeita se não configurado ou se token não bate
    const expected = process.env.WAHA_WEBHOOK_TOKEN;
    if (!expected) {
      throw new ForbiddenException('WAHA_WEBHOOK_TOKEN não configurado — configure a variável de ambiente');
    }
    // B1 (auditoria 2026-07-08): comparação em tempo constante (evita timing attack no token).
    if (!safeEqual(token, expected)) {
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
    // Só processa evento de mensagem nova.
    //
    // `message.any` entra junto desde 13/08/2026: é o ÚNICO que traz o que SAI do
    // nosso número — sem ele o takeover da ADR 035 nunca vê o humano digitando no
    // WhatsApp Web da empresa. A assinatura foi feita em `waha-bootstrap`, mas o
    // filtro aqui continuava recusando o evento, então o conserto não chegava a
    // rodar. Entrega dobrada do que ENTRA morre no dedup por `messageId`.
    if (event && event !== 'message' && event !== 'message.any') {
      return { ignored: true, reason: `evento ${event}` };
    }
    // `linha` diz por QUAL número a mensagem entrou (query da URL registrada no
    // webhook daquele container). Ausente = linha principal — todo webhook que já
    // existe continua funcionando sem mudar nada.
    return this.whatsapp.process(body, process.env.NEXA_DEFAULT_TENANT_ID ?? 'default', linha);
  }
}
