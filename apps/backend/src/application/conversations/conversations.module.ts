import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationJanitorService } from './conversation-janitor.service';
import { ConversationsController } from '@/presentation/http/conversations/conversations.controller';
import { ConversationsGateway } from '@/presentation/ws/conversations.gateway';

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsGateway, ConversationJanitorService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
