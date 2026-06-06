import { Global, Module } from '@nestjs/common';
import { ConnectorsService } from './connectors.service';
import { HiperTmsConnector } from './hipertms.connector';
import { ProductsController } from '@/presentation/http/products/products.controller';

// Global: outros módulos (billing) vão usar o ConnectorsService.
@Global()
@Module({
  controllers: [ProductsController],
  providers: [ConnectorsService, HiperTmsConnector],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
