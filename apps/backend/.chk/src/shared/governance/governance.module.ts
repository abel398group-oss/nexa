import { Global, Module } from '@nestjs/common';
import { AutonomyService } from './autonomy.service';

// Kill switch / governança da IA — global (qualquer agente consulta).
@Global()
@Module({
  providers: [AutonomyService],
  exports: [AutonomyService],
})
export class GovernanceModule {}
