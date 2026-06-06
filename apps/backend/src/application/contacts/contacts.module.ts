import { Module } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { ContactsController } from '@/presentation/http/contacts/contacts.controller';

@Module({
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
