import { Global, Module } from '@nestjs/common';
import { ConnectorsService } from './connectors.service';
import { HiperTmsConnector } from './hipertms.connector';
import { TicketSyncService } from './ticket-sync.service';
import { ProductsController } from '@/presentation/http/products/products.controller';

// Global: outros módulos (billing, suporte) vão usar o ConnectorsService /
// TicketSyncService.
@Global()
@Module({
  controllers: [ProductsController],
  providers: [ConnectorsService, HiperTmsConnector, TicketSyncService],
  exports: [ConnectorsService, HiperTmsConnector, TicketSyncService],
})
export class ConnectorsModule {}
