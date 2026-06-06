import { Module } from '@nestjs/common';
import { ActionsService } from './actions.service';
import { ActionsController } from '@/presentation/http/actions/actions.controller';

@Module({
  controllers: [ActionsController],
  providers: [ActionsService],
  exports: [ActionsService],
})
export class ActionsModule {}
