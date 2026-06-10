import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailReplyService } from './email-reply.service';
import { EmailOptOutService } from './email-optout.service';
import { ContactsModule } from '@/application/contacts/contacts.module';
import { ConversationsModule } from '@/application/conversations/conversations.module';
import { AgentsModule } from '@/application/agents/agents.module';
import { NotificationsModule } from '@/application/notifications/notifications.module';
import { EmailController } from '@/presentation/http/email/email.controller';

@Module({
  imports: [ContactsModule, ConversationsModule, AgentsModule, NotificationsModule],
  controllers: [EmailController],
  providers: [EmailService, EmailReplyService, EmailOptOutService],
  exports: [EmailOptOutService],
})
export class EmailModule {}
