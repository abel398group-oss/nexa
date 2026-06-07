import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { ContactsModule } from '@/application/contacts/contacts.module';
import { ConversationsModule } from '@/application/conversations/conversations.module';
import { AgentsModule } from '@/application/agents/agents.module';
import { FollowUpModule } from '@/application/followup/followup.module';
import { WhatsappController } from '@/presentation/http/whatsapp/whatsapp.controller';

@Module({
  imports: [ContactsModule, ConversationsModule, AgentsModule, FollowUpModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
})
export class WhatsappModule {}
