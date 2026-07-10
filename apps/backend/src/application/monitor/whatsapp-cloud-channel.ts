/**
 * WhatsAppCloudChannel — canal WhatsApp via API OFICIAL (Meta Cloud API) — A5.
 *
 * ATIVAÇÃO: MONITOR_WA_PROVIDER=cloud (default é 'waha' — nada muda até lá).
 *
 * Pré-requisitos operacionais (fora do código):
 *   1. Conta WhatsApp Business + número verificado na Meta
 *   2. Template de digest APROVADO — mensagem iniciada pelo negócio só sai
 *      como template (HSM); texto livre é rejeitado fora da janela de 24h
 *   3. Envs: WA_CLOUD_TOKEN, WA_CLOUD_PHONE_ID, WA_CLOUD_TEMPLATE_DIGEST
 *
 * Formato do template sugerido (submeter à Meta):
 *   "{{1}}" → corpo resumido do digest (o conteúdo completo vai por e-mail;
 *   na API oficial o WhatsApp é o "toque", não o relatório).
 */
import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from './notification-channel.interface';

const GRAPH_BASE = 'https://graph.facebook.com/v20.0';

@Injectable()
export class WhatsAppCloudChannel implements NotificationChannel {
  private readonly logger = new Logger('WhatsAppCloudChannel');

  async sendTo(tenantId: string, to: string, message: string): Promise<{ sent: boolean; reason?: string }> {
    const token = process.env.WA_CLOUD_TOKEN;
    const phoneId = process.env.WA_CLOUD_PHONE_ID;
    const template = process.env.WA_CLOUD_TEMPLATE_DIGEST;

    if (!token || !phoneId || !template) {
      const reason = 'cloud_api_not_configured (WA_CLOUD_TOKEN / WA_CLOUD_PHONE_ID / WA_CLOUD_TEMPLATE_DIGEST)';
      this.logger.error(`Cloud API selecionada mas não configurada — ${reason}`);
      return { sent: false, reason };
    }

    try {
      const res = await fetch(`${GRAPH_BASE}/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: template,
            language: { code: 'pt_BR' },
            components: [
              {
                type: 'body',
                // Template com 1 variável: corpo do digest. Meta limita o tamanho
                // de parâmetros — truncamos defensivamente em 1000 chars.
                parameters: [{ type: 'text', text: message.slice(0, 1000) }],
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const reason = `cloud_api_${res.status}: ${body.slice(0, 300)}`;
        this.logger.warn(`Cloud API falhou para ${to} (tenant=${tenantId}): ${reason}`);
        return { sent: false, reason };
      }

      this.logger.debug(`Cloud API: enviado para ${to} (tenant=${tenantId})`);
      return { sent: true };
    } catch (e: any) {
      const reason = `cloud_api_error: ${e?.message?.slice(0, 300)}`;
      this.logger.warn(`Cloud API erro para ${to} (tenant=${tenantId}): ${reason}`);
      return { sent: false, reason };
    }
  }
}
