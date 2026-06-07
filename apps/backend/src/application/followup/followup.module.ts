import { Module } from '@nestjs/common';
import { FollowUpService } from './followup.service';
import { ConversationsModule } from '@/application/conversations/conversations.module';
import { FollowUpController } from '@/presentation/http/followup/followup.controller';

@Module({
  imports: [ConversationsModule],
  controllers: [FollowUpController],
  providers: [FollowUpService],
  exports: [FollowUpService],
})
export class FollowUpModule {}
