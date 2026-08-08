import { Module } from '@nestjs/common';
import { SellersService } from './sellers.service';
import { EmailModule } from '@/application/email/email.module';
import { SellerActivityService } from './seller-activity.service';
import { SellersController } from '@/presentation/http/sellers/sellers.controller';
import { SellerActivityController } from '@/presentation/http/sellers/seller-activity.controller';

@Module({
  imports: [EmailModule], // aviso de handoff por e-mail (EmailReplyService)
  controllers: [SellersController, SellerActivityController],
  providers: [SellersService, SellerActivityService],
  exports: [SellersService, SellerActivityService],
})
export class SellersModule {}
