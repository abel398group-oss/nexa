import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from '@/presentation/http/billing/billing.controller';

@Module({
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
