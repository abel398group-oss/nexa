import { Module } from '@nestjs/common';
import { MarketsService } from './markets.service';
import { MessageTemplatesService } from './message-templates.service';
import { MarketsController } from '@/presentation/http/markets/markets.controller';
import { MessageTemplatesController } from '@/presentation/http/markets/message-templates.controller';
import { EmailModule } from '@/application/email/email.module';

@Module({
  imports: [EmailModule], // teste de mensagem usa o SMTP (EmailReplyService)
  controllers: [MarketsController, MessageTemplatesController],
  providers: [MarketsService, MessageTemplatesService],
  exports: [MarketsService, MessageTemplatesService],
})
export class MarketsModule {}
