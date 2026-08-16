/**
 * WahaNotificationChannel — canal WhatsApp via WAHA (não-oficial).
 *
 * A2: o canal é "burro" — só envia para o destinatário informado. A resolução
 * de destinatários (recipients por setor, legado, ALERT_ADMIN_PHONE, seller)
 * vive no MonitorNotificationService.
 */
import { Injectable, Logger } from '@nestjs/common';
import { WahaClientService, LINHA_PRINCIPAL } from '@/shared/waha/waha-client.service';
import { NotificationChannel } from './notification-channel.interface';

/**
 * Do-not-reply notice (2026-07-20 brainstorm, Abel's decision): every Monitor
 * WhatsApp message opens with this line. Alerts are outbound-only — replies
 * land in the shared Lia number and are discarded by the internal-numbers
 * gate (InternalNumbersService), so we prevent them at the source. Prepended
 * HERE (single choke point: direct sends AND the dispatch queue both call
 * sendTo) instead of in each message builder, so e-mail bodies and specs that
 * assert on builder output stay untouched.
 */
// 2026-07-21: encurtada. A bolha do WhatsApp tem a largura da linha MAIS LARGA
// — a versão longa ("Mensagem automática — não é necessário responder") esticava
// a bolha muito além dos blocos de 32 chars e deixava um vazio à direita.
export const DO_NOT_REPLY_NOTICE = '🔕 _Automático — não responda._';

@Injectable()
export class WahaNotificationChannel implements NotificationChannel {
  private readonly logger = new Logger('WahaNotificationChannel');

  constructor(private readonly waha: WahaClientService) {}

  async sendTo(tenantId: string, to: string, message: string): Promise<{ sent: boolean; reason?: string }> {
    // Guard against double-prepend (e.g. a re-enqueued job whose message was
    // already decorated on a previous attempt).
    const text = message.startsWith(DO_NOT_REPLY_NOTICE)
      ? message
      : `${DO_NOT_REPLY_NOTICE}\n\n${message}`;
    // Linha EXPLÍCITA, e não pela omissão do parâmetro. O alerta sempre saiu pela
    // principal porque `resolveLinha(undefined)` cai nela — comportamento idêntico, mas
    // por acidente de default. Declarado aqui, `grep "linha:"` responde por qual número
    // cada coisa sai, e uma mudança de default não move alerta para a linha de vendas
    // sem ninguém notar.
    const result = await this.waha.sendText(to, text, { origin: 'monitor', linha: LINHA_PRINCIPAL });
    if (!result.sent) {
      this.logger.warn(`WAHA: falha ao enviar para ${to} (tenant=${tenantId}): ${result.reason}`);
      return { sent: false, reason: result.reason ?? 'waha_send_failed' };
    }
    this.logger.debug(`WAHA: enviado para ${to} (tenant=${tenantId})`);
    return { sent: true };
  }
}
