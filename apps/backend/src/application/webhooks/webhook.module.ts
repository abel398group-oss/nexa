import { Module } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { EmailCryptoModule } from '@/shared/email-crypto/email-crypto.module';

@Module({
  imports: [PrismaModule, EmailCryptoModule],
  providers: [WebhookService],
  controllers: [WebhookController],
  exports: [WebhookService], // outros módulos importam p/ chamar emit()
})
export class WebhookModule {}
