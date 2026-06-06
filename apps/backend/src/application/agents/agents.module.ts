import { Module } from '@nestjs/common';
import { SupportAgentService } from './support-agent.service';
import { RouterAgentService } from './router-agent.service';
import { SalesAgentService } from './sales-agent.service';
import { SupervisorAgentService } from './supervisor-agent.service';
import { ConversationAgentService } from './conversation-agent.service';
import { KnowledgeModule } from '@/application/knowledge/knowledge.module';
import { ConversationsModule } from '@/application/conversations/conversations.module';
import { AgentsController } from '@/presentation/http/agents/agents.controller';

@Module({
  imports: [KnowledgeModule, ConversationsModule],
  controllers: [AgentsController],
  providers: [
    SupportAgentService,
    RouterAgentService,
    SalesAgentService,
    SupervisorAgentService,
    ConversationAgentService,
  ],
  exports: [SupportAgentService, ConversationAgentService],
})
export class AgentsModule {}
