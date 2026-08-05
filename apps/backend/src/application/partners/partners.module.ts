import { Module } from '@nestjs/common';
import { PartnersService } from './partners.service';
import { PartnersController } from '@/presentation/http/partners/partners.controller';

@Module({
  controllers: [PartnersController],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}
