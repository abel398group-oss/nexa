import { Module } from '@nestjs/common';
import { FollowUpService } from './followup.service';
import { HumanActivityListener } from './human-activity.listener';
import { ConversationsModule } from '@/application/conversations/conversations.module';
import { FollowUpController } from '@/presentation/http/followup/followup.controller';

@Module({
  imports: [ConversationsModule],
  controllers: [FollowUpController],
  // O ouvinte mora aqui, do lado de quem sabe parar a cadência. Ele escuta
  // `human.spoke`, emitido pelo ConversationsService — evento e não injeção porque
  // este módulo já importa aquele, e o caminho de volta fecharia o ciclo.
  providers: [FollowUpService, HumanActivityListener],
  exports: [FollowUpService],
})
export class FollowUpModule {}
