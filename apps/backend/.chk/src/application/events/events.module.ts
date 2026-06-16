import { Global, Module } from '@nestjs/common';
import { EventsService } from './events.service';

// Global: qualquer módulo pode publicar eventos (outbox).
@Global()
@Module({
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
