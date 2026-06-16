import { Module } from '@nestjs/common';
import { SellersService } from './sellers.service';
import { SellersController } from '@/presentation/http/sellers/sellers.controller';

@Module({
  controllers: [SellersController],
  providers: [SellersService],
  exports: [SellersService],
})
export class SellersModule {}
