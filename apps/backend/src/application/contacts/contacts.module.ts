import { Module } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { OptOutRegistryService } from './opt-out-registry.service';
import { AbuseGuardService } from './abuse-guard.service';
import { ContactsController } from '@/presentation/http/contacts/contacts.controller';
import { AbuseController } from '@/presentation/http/contacts/abuse.controller';
// AbuseGuardService avisa o admin pelo mesmo canal (WhatsApp + e-mail) que o
// termômetro de escala já usa. Registra AdminAlertService AQUI, em vez de
// importar MonitorModule, de propósito: MonitorModule importa EmailModule, que
// importa ContactsModule — importar MonitorModule aqui fecharia um ciclo
// (ContactsModule → MonitorModule → EmailModule → ContactsModule). WahaModule
// é @Global() (não precisa import); EmailCryptoModule é folha, sem risco de ciclo.
import { AdminAlertService } from '@/application/monitor/admin-alert.service';
import { EmailCryptoModule } from '@/shared/email-crypto/email-crypto.module';

@Module({
  imports: [EmailCryptoModule],
  controllers: [ContactsController, AbuseController],
  providers: [ContactsService, OptOutRegistryService, AbuseGuardService, AdminAlertService],
  exports: [ContactsService, OptOutRegistryService, AbuseGuardService],
})
export class ContactsModule {}
