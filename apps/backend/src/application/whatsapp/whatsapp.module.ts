import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WahaBootstrapService } from './waha-bootstrap.service';
import { WahaHealthService } from './waha-health.service';
import { ContactsModule } from '@/application/contacts/contacts.module';
import { ConversationsModule } from '@/application/conversations/conversations.module';
import { AgentsModule } from '@/application/agents/agents.module';
import { FollowUpModule } from '@/application/followup/followup.module';
import { NotificationsModule } from '@/application/notifications/notifications.module';
import { WhatsappController } from '@/presentation/http/whatsapp/whatsapp.controller';
import { WhatsappStatusController } from '@/presentation/http/whatsapp/whatsapp-status.controller';
import { EmailCryptoModule } from '@/shared/email-crypto/email-crypto.module';

@Module({
  imports: [ContactsModule, ConversationsModule, AgentsModule, FollowUpModule, NotificationsModule, EmailCryptoModule],
  controllers: [WhatsappController, WhatsappStatusController],
  providers: [WhatsappService, WahaBootstrapService, WahaHealthService],
})
export class WhatsappModule {}
