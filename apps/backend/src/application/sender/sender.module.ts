import { Module } from '@nestjs/common';
import { SenderService } from './sender.service';
import { SenderWarmupService } from './sender-warmup.service';
import { ContactsModule } from '@/application/contacts/contacts.module';
import { ConversationsModule } from '@/application/conversations/conversations.module';
import { FollowUpModule } from '@/application/followup/followup.module';
import { EmailModule } from '@/application/email/email.module';
import { SenderController } from '@/presentation/http/sender/sender.controller';
// Freio de engajamento avisa o time quando desativa um número (sender-health.ts).
import { NotificationsModule } from '@/application/notifications/notifications.module';

@Module({
  imports: [ContactsModule, ConversationsModule, FollowUpModule, EmailModule, NotificationsModule],
  controllers: [SenderController],
  // TmsLookupService vem do TmsModule (@Global): era provider local aqui e em outros
  // dois módulos, e cada registro abria um pool próprio contra o banco do TMS.
  providers: [SenderService, SenderWarmupService],
})
export class SenderModule {}
