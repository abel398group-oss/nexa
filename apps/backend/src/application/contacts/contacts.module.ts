import { Module } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { OptOutRegistryService } from './opt-out-registry.service';
import { ContactsController } from '@/presentation/http/contacts/contacts.controller';

@Module({
  controllers: [ContactsController],
  providers: [ContactsService, OptOutRegistryService],
  exports: [ContactsService, OptOutRegistryService],
})
export class ContactsModule {}
