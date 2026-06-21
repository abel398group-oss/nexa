import { Module } from '@nestjs/common';
import { EmailCryptoService } from './email-crypto.service';

@Module({
  providers: [EmailCryptoService],
  exports: [EmailCryptoService],
})
export class EmailCryptoModule {}
