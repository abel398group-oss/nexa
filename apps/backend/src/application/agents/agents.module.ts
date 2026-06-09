import { Module } from '@nestjs/common';
import { SupportAgentService } from './support-agent.service';
import { RouterAgentService } from './router-agent.service';
import { SalesAgentService } from './sales-agent.service';
import { SupervisorAgentService } from './supervisor-agent.service';
import { ConversationAgentService } from './conversation-agent.service';
import { KnowledgeModule } from '@/application/knowledge/knowledge.module';
import { ConversationsModule } from '@/application/conversations/conversations.module';
import { SellersModule } from '@/application/sellers/sellers.module';
import { PlaybookModule } from '@/application/playbook/playbook.module';
import { NotificationsModule } from '@/application/notifications/notifications.module';
import { AgentsController } from '@/presentation/http/agents/agents.controller';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';

@Module({
  imports: [KnowledgeModule, ConversationsModule, SellersModule, PlaybookModule, NotificationsModule],
  controllers: [AgentsController],
  providers: [
    SupportAgentService,
    RouterAgentService,
    SalesAgentService,
    SupervisorAgentService,
    ConversationAgentService,
    TmsLookupService,
  ],
  exports: [SupportAgentService, ConversationAgentService],
})
export class AgentsModule {}
