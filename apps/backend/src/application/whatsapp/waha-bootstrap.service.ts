import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

/**
 * Registra/recadastra o webhook do WAHA automaticamente ao subir o backend.
 * Resolve o problema P5: webhooks não sobrevivem a `docker compose recreate`.
 *
 * Configuração necessária no .env:
 *   WAHA_API_URL        — ex: http://localhost:3018
 *   WAHA_API_KEY        — chave da API do WAHA
 *   WAHA_SESSION        — nome da sessão (ex: default)
 *   WAHA_WEBHOOK_TOKEN  — token secreto do webhook (obrigatório)
 *   NEXA_PUBLIC_URL     — URL pública deste backend (ex: https://meu-tunnel.com ou https://app.com)
 */
@Injectable()
export class WahaBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('WahaBootstrap');

  async onApplicationBootstrap(): Promise<void> {
    const wahaUrl = process.env.WAHA_API_URL;
    const wahaKey = process.env.WAHA_API_KEY;
    const session = process.env.WAHA_SESSION ?? 'default';
    const webhookToken = process.env.WAHA_WEBHOOK_TOKEN;
    const nexaPublicUrl = process.env.NEXA_PUBLIC_URL;

    if (!wahaUrl || !wahaKey || !webhookToken || !nexaPublicUrl) {
      this.logger.warn(
        'WahaBootstrap: variáveis incompletas (WAHA_API_URL, WAHA_API_KEY, WAHA_WEBHOOK_TOKEN, NEXA_PUBLIC_URL). ' +
        'Webhook NÃO registrado automaticamente.',
      );
      return;
    }

    const webhookUrl = `${nexaPublicUrl}/api/webhooks/waha?token=${webhookToken}`;

    try {
      // Lê a configuração atual da sessão
      const sessionRes = await fetch(`${wahaUrl}/api/sessions/${session}`, {
        headers: { 'X-Api-Key': wahaKey },
      });

      if (!sessionRes.ok) {
        this.logger.warn(`WahaBootstrap: sessão "${session}" não encontrada no WAHA (status ${sessionRes.status}). Aguardando próxima tentativa.`);
        return;
      }

      const sessionData = (await sessionRes.json()) as any;
      const existingWebhooks: any[] = sessionData?.config?.webhooks ?? [];

      // Verifica se o webhook já está registrado com a URL correta
      const alreadyRegistered = existingWebhooks.some((w: any) => w.url === webhookUrl);
      if (alreadyRegistered) {
        this.logger.log(`WahaBootstrap: webhook já registrado — ${webhookUrl}`);
        return;
      }

      // Remove webhooks antigos deste backend (mesmo host, token diferente / URL desatualizada)
      const nexaBase = nexaPublicUrl.replace(/\/$/, '');
      const filtered = existingWebhooks.filter((w: any) => !w.url?.startsWith(nexaBase));

      // Adiciona o webhook atualizado
      filtered.push({
        url: webhookUrl,
        events: ['message', 'message.ack'],
        hmac: null,
        retries: null,
        customHeaders: null,
      });

      // Atualiza a configuração da sessão no WAHA
      const patchRes = await fetch(`${wahaUrl}/api/sessions/${session}`, {
        method: 'PUT',
        headers: {
          'X-Api-Key': wahaKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: {
            ...sessionData?.config,
            webhooks: filtered,
          },
        }),
      });

      if (patchRes.ok) {
        this.logger.log(`WahaBootstrap: webhook registrado com sucesso — ${webhookUrl}`);
      } else {
        const err = await patchRes.text();
        this.logger.error(`WahaBootstrap: falha ao registrar webhook — ${patchRes.status}: ${err}`);
      }
    } catch (err: any) {
      this.logger.error(`WahaBootstrap: erro ao conectar ao WAHA — ${err?.message ?? err}`);
    }
  }
}
