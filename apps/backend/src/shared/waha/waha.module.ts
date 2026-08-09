import { Global, Module } from '@nestjs/common';
import { WahaClientService } from './waha-client.service';
import { NumberBudgetService } from './number-budget.service';

// Cliente WAHA compartilhado (envio de saída pro WhatsApp) — global.
// O NumberBudgetService mora aqui porque o débito acontece dentro do cliente:
// é o único ponto por onde todo envio passa.
@Global()
@Module({
  providers: [WahaClientService, NumberBudgetService],
  exports: [WahaClientService, NumberBudgetService],
})
export class WahaModule {}
