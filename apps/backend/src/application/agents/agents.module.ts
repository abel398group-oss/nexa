import { Module } from '@nestjs/common';
import { SupportAgentService } from './support-agent.service';
import { RouterAgentService } from './router-agent.service';
import { SalesAgentService } from './sales-agent.service';
import { SupervisorAgentService } from './supervisor-agent.service';
import { ConversationAgentService } from './conversation-agent.service';
import { CaseClassifierAgentService } from './case-classifier-agent.service';
import { DiagnosticAgentService } from './diagnostic-agent.service';
import { ResolutionAgentService } from './resolution-agent.service';
import { EscalationAgentService } from './escalation-agent.service';
import { TicketIntelligenceService } from './ticket-intelligence.service';
import { KnowledgeModule } from '@/application/knowledge/knowledge.module';
import { ConversationsModule } from '@/application/conversations/conversations.module';
import { SellersModule } from '@/application/sellers/sellers.module';
import { PlaybookModule } from '@/application/playbook/playbook.module';
import { NotificationsModule } from '@/application/notifications/notifications.module';
import { OpportunitiesModule } from '@/application/opportunities/opportunities.module';
import { AgentsController } from '@/presentation/http/agents/agents.controller';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';

@Module({
  imports: [KnowledgeModule, ConversationsModule, SellersModule, PlaybookModule, NotificationsModule, OpportunitiesModule],
  controllers: [AgentsController],
  providers: [
    // Infra
    TmsLookupService,
    // Agentes de suporte — pipeline ADR 015
    CaseClassifierAgentService,
    DiagnosticAgentService,
    ResolutionAgentService,
    EscalationAgentService,
    // Intelligence loop — ADR 019
    TicketIntelligenceService,
    // Agentes principais
    SupportAgentService,
    RouterAgentService,
    SalesAgentService,
    SupervisorAgentService,
    ConversationAgentService,
  ],
  exports: [SupportAgentService, ConversationAgentService, TicketIntelligenceService],
})
export class AgentsModule {}
