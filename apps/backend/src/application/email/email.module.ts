import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailReplyService } from './email-reply.service';
import { EmailOptOutService } from './email-optout.service';
import { EmailImapService } from './email-imap.service';
import { EmailChannelService } from './email-channel.service';
import { EmailCampaignSenderService } from './email-campaign-sender.service';
import { SupportEscalationListener } from './support-escalation.listener';
import { EmailOutboundListener } from './email-outbound.listener';
import { ContactsModule } from '@/application/contacts/contacts.module';
import { ConversationsModule } from '@/application/conversations/conversations.module';
import { AgentsModule } from '@/application/agents/agents.module';
import { NotificationsModule } from '@/application/notifications/notifications.module';
import { EmailController } from '@/presentation/http/email/email.controller';
import { EmailChannelController } from '@/presentation/http/email/email-channel.controller';
import { SupportEmailController } from '@/presentation/http/email/support-email.controller';
import { EmailCryptoModule } from '@/shared/email-crypto/email-crypto.module';

@Module({
  imports: [ContactsModule, ConversationsModule, AgentsModule, NotificationsModule, EmailCryptoModule],
  controllers: [EmailController, EmailChannelController, SupportEmailController],
  providers: [
    EmailService,
    EmailReplyService,
    EmailOptOutService,
    EmailImapService,
    EmailChannelService,
    EmailCampaignSenderService,
    SupportEscalationListener, // P2: e-mail ao suporte no evento 'support.escalated'
    EmailOutboundListener,     // entrega SMTP das mensagens de saída do canal e-mail
  ],
  exports: [EmailReplyService, EmailOptOutService, EmailChannelService, EmailCampaignSenderService],
})
export class EmailModule {}
