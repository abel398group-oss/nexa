import { Module } from '@nestjs/common';
import { MarketsService } from './markets.service';
import { MessageTemplatesService } from './message-templates.service';
import { MarketAssetsService } from './market-assets.service';
import { MarketsController } from '@/presentation/http/markets/markets.controller';
import { MessageTemplatesController } from '@/presentation/http/markets/message-templates.controller';
import { MarketAssetsController } from '@/presentation/http/markets/market-assets.controller';
import { EmailModule } from '@/application/email/email.module';
import { KnowledgeModule } from '@/application/knowledge/knowledge.module';
import { PlaybookModule } from '@/application/playbook/playbook.module';

@Module({
  // EmailModule: teste de mensagem usa o SMTP (EmailReplyService).
  // KnowledgeModule: roteiro aprovado vira artigo na base que a Lia lê.
  // PlaybookModule: o rascunho de mensagem lê dali as frases que o operador recusou.
  // Módulo folha (só controller + service), então não fecha ciclo.
  imports: [EmailModule, KnowledgeModule, PlaybookModule],
  controllers: [MarketsController, MessageTemplatesController, MarketAssetsController],
  providers: [MarketsService, MessageTemplatesService, MarketAssetsService],
  exports: [MarketsService, MessageTemplatesService, MarketAssetsService],
})
export class MarketsModule {}
