import { Global, Module } from '@nestjs/common';
import { WahaClientService } from './waha-client.service';

// Cliente WAHA compartilhado (envio de saída pro WhatsApp) — global.
@Global()
@Module({
  providers: [WahaClientService],
  exports: [WahaClientService],
})
export class WahaModule {}
