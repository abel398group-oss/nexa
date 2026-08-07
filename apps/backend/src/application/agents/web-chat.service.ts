/**
 * WebChatService — ADR 027 D2
 *
 * Escuta o evento 'web_chat.inbound' emitido pelo ConversationsGateway quando o
 * cliente TMS envia uma mensagem pelo widget embutido.
 *
 * Roteamento: delega ao ConversationAgentService.handle() com portalIdentity — o
 * mesmo pipeline do WhatsApp (classify → route → support/sales → supervisor → auto-send).
 * A resposta é persistida por addMessage() → emite 'message.created' → gateway
 * empurra para a sala do socket → widget recebe em tempo real.
 *
 * Separação de responsabilidades:
 *   ConversationsGateway (ConversationsModule) — transporte WS, não conhece agentes.
 *   WebChatService        (AgentsModule)        — lógica IA, não conhece WS.
 *   EventEmitter2                               — barramento entre os dois.
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConversationAgentService } from './conversation-agent.service';

export interface WebChatInboundEvent {
  tenantId: string;
  conversationId: string;
  externalId: string;
  name: string | null;
  // F10: tela do TMS de onde o cliente abriu o chat — já existia no token,
  // só não chegava até aqui. Ver conversations.gateway.ts (WebChatSocketData).
  page: string | null;
  message: string;
  /** Setor escolhido pelo cliente no widget (Fiscal/Frota/…). Indício, não verdade. */
  sector?: string;
}

@Injectable()
export class WebChatService {
  private readonly logger = new Logger('WebChat');

  constructor(private readonly agent: ConversationAgentService) {}

  @OnEvent('web_chat.inbound', { async: true })
  async handleInbound(event: WebChatInboundEvent): Promise<void> {
    this.logger.log(
      `web_chat.inbound: ext=${event.externalId} conv=${event.conversationId.slice(0, 8)} tenant=${event.tenantId}`,
    );
    try {
      const result = await this.agent.handle(event.tenantId, {
        message: event.message,
        conversationId: event.conversationId,
        // portalIdentity → pipeline sabe que é cliente autenticado → rota suporte direto
        // identidade vem do token (TMS autenticado), nunca do que o cliente digitou (LGPD)
        portalIdentity: { externalId: event.externalId, name: event.name, page: event.page },
        sector: event.sector,
      });
      // REGRA 3: o `blockedReason` só era logado no caminho do WhatsApp
      // (whatsapp.service.ts). No web chat ele era descartado — quando a Lia trocava a
      // resposta pelo aceno seguro, não sobrava nenhum rastro de qual gate disparou
      // (supervisora? confiança? guard de saída?). Sem isso, o chamado do CT-e 519 não
      // era diagnosticável pelos logs.
      if (result?.blockedReason) {
        this.logger.warn(
          `conv=${event.conversationId.slice(0, 8)} autoSent=${result.autoSent} ` +
          `agente=${result.route.agent} BLOQUEIO="${result.blockedReason}"`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Erro ao processar web_chat.inbound conv=${event.conversationId.slice(0, 8)}: ${err?.message}`,
        err?.stack,
      );
    }
  }
}
