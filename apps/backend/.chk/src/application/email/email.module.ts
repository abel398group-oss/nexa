import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailReplyService } from './email-reply.service';
import { EmailOptOutService } from './email-optout.service';
import { EmailImapService } from './email-imap.service';
import { EmailChannelService } from './email-channel.service';
import { EmailCampaignSenderService } from './email-campaign-sender.service';
import { ContactsModule } from '@/application/contacts/contacts.module';
import { ConversationsModule } from '@/application/conversations/conversations.module';
import { AgentsModule } from '@/application/agents/agents.module';
import { NotificationsModule } from '@/application/notifications/notifications.module';
import { EmailController } from '@/presentation/http/email/email.controller';
import { EmailChannelController } from '@/presentation/http/email/email-channel.controller';

@Module({
  imports: [ContactsModule, ConversationsModule, AgentsModule, NotificationsModule],
  controllers: [EmailController, EmailChannelController],
  providers: [
    EmailService,
    EmailReplyService,
    EmailOptOutService,
    EmailImapService,
    EmailChannelService,
    EmailCampaignSenderService,
  ],
  exports: [EmailOptOutService, EmailChannelService, EmailCampaignSenderService],
})
export class EmailModule {}
