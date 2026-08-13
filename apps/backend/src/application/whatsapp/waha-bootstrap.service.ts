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
    // Linha principal: sempre registrada, com a URL de webhook EXATAMENTE como
    // era antes da divisão de números — sem parâmetro `linha`. Mexer nela faria
    // o bootstrap reescrever um webhook que já funciona, sem ganho nenhum.
    await this.registrarLinha();

    // Linhas adicionais, por nome: `WAHA_LINHAS=vendas` procura
    // `WAHA_VENDAS_API_URL` / `_API_KEY` / `_SESSION` e registra o webhook com
    // `&linha=vendas`, que é como o controller sabe por onde a mensagem entrou.
    // Vazio (o caso de hoje) = nada além da principal.
    const extras = (process.env.WAHA_LINHAS ?? '')
      .split(',')
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
    for (const linha of extras) {
      await this.registrarLinha(linha);
    }
  }

  /** Registra o webhook do Nexa numa linha. Sem `linha` = a principal. */
  private async registrarLinha(linha?: string): Promise<void> {
    const p = linha ? `WAHA_${linha.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_` : 'WAHA_';
    const wahaUrl = process.env[`${p}API_URL`];
    const wahaKey = process.env[`${p}API_KEY`] ?? process.env.WAHA_API_KEY;
    const session = process.env[`${p}SESSION`] ?? (linha ? 'default' : process.env.WAHA_SESSION ?? 'default');
    const webhookToken = process.env.WAHA_WEBHOOK_TOKEN;
    const nexaPublicUrl = process.env.NEXA_PUBLIC_URL;

    if (linha && !wahaUrl) {
      this.logger.warn(`WahaBootstrap: linha "${linha}" declarada em WAHA_LINHAS mas sem ${p}API_URL — ignorada.`);
      return;
    }

    if (!wahaUrl || !wahaKey || !webhookToken || !nexaPublicUrl) {
      this.logger.warn(
        'WahaBootstrap: variáveis incompletas (WAHA_API_URL, WAHA_API_KEY, WAHA_WEBHOOK_TOKEN, NEXA_PUBLIC_URL). ' +
        'Webhook NÃO registrado automaticamente.',
      );
      return;
    }

    const webhookUrl =
      `${nexaPublicUrl}/api/webhooks/waha?token=${webhookToken}` +
      (linha ? `&linha=${encodeURIComponent(linha)}` : '');

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
      // `message` do WAHA é SÓ o que ENTRA. O que sai do nosso número — inclusive
      // um humano digitando no WhatsApp Web da empresa — só chega por `message.any`.
      //
      // Sem ele o takeover da ADR 035 nunca dispara nesse caminho: o vendedor
      // assume a conversa pelo celular e a Lia segue respondendo por cima dele.
      // Confirmado em produção em 09/08/2026 — o log não tinha uma linha sequer de
      // ADR 035, porque o webhook não existia.
      //
      // Os dois convivem de propósito. `message.any` também repete o que entra, e a
      // segunda entrega morre no dedup por `messageId` (ver whatsapp.service:
      // processedMessage). Trocar `message` por `message.any` seria mais enxuto,
      // mas mexeria no caminho de TODA mensagem que entra para consertar o de saída
      // — e o WAHA roda `latest` aqui, com formato de payload que já mudou antes.
      const desiredEvents = ['message', 'message.any', 'message.ack', 'session.status'];

      // Já registrado COM a URL certa E todos os eventos desejados?
      // Se faltar algum evento (ex.: session.status novo), re-registra.
      const alreadyRegistered = existingWebhooks.some(
        (w: any) => w.url === webhookUrl && desiredEvents.every((e) => (w.events ?? []).includes(e)),
      );
      if (alreadyRegistered) {
        this.logger.log(`WahaBootstrap: webhook já registrado — ${webhookUrl}`);
        return;
      }

      // Remove TODOS os webhooks do Nexa (qualquer host) — evita duplicação quando
      // NEXA_PUBLIC_URL muda entre dev (localhost) e produção.
      // Identifica pelo path /api/webhooks/waha (token pode variar).
      const filtered = existingWebhooks.filter((w: any) => !String(w.url ?? '').includes('/api/webhooks/waha'));

      // Adiciona o webhook atualizado
      filtered.push({
        url: webhookUrl,
        events: desiredEvents,
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
