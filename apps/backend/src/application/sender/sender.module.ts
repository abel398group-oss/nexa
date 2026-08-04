import { Module } from '@nestjs/common';
import { SenderService } from './sender.service';
import { ContactsModule } from '@/application/contacts/contacts.module';
import { ConversationsModule } from '@/application/conversations/conversations.module';
import { FollowUpModule } from '@/application/followup/followup.module';
import { EmailModule } from '@/application/email/email.module';
import { SenderController } from '@/presentation/http/sender/sender.controller';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';
// Freio de engajamento avisa o time quando desativa um número (sender-health.ts).
import { NotificationsModule } from '@/application/notifications/notifications.module';

@Module({
  imports: [ContactsModule, ConversationsModule, FollowUpModule, EmailModule, NotificationsModule],
  controllers: [SenderController],
  providers: [SenderService, TmsLookupService],
})
export class SenderModule {}
