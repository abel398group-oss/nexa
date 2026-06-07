import { Module } from '@nestjs/common';
import { SenderService } from './sender.service';
import { ContactsModule } from '@/application/contacts/contacts.module';
import { ConversationsModule } from '@/application/conversations/conversations.module';
import { FollowUpModule } from '@/application/followup/followup.module';
import { SenderController } from '@/presentation/http/sender/sender.controller';

@Module({
  imports: [ContactsModule, ConversationsModule, FollowUpModule],
  controllers: [SenderController],
  providers: [SenderService],
})
export class SenderModule {}
