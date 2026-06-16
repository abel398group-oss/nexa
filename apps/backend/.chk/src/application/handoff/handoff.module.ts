import { Global, Module } from '@nestjs/common';
import { HandoffService } from './handoff.service';
import { HandoffController } from '@/presentation/http/handoff/handoff.controller';

// Global: o ConversationAgentService precisa do HandoffService para resolver tokens
@Global()
@Module({
  controllers: [HandoffController],
  providers: [HandoffService],
  exports: [HandoffService],
})
export class HandoffModule {}
