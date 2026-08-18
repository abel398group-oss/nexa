import { Module } from '@nestjs/common';
import { QuoteSessionService } from './quote-session.service';
import { QuoteTmsClient } from './quote-tms.client';
import { QuoteConversationService } from './quote-conversation.service';

/**
 * Cotacao de frete por WhatsApp.
 *
 * Nao tem controller: quem aciona e o webhook do WhatsApp, que ja existe. Um endpoint
 * proprio so criaria uma segunda porta para o mesmo fluxo.
 *
 * `TmsLookupService` vem do `TmsModule`, que e @Global — nada a importar aqui.
 */
@Module({
  providers: [QuoteSessionService, QuoteTmsClient, QuoteConversationService],
  exports: [QuoteConversationService],
})
export class QuoteModule {}
