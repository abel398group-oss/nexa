import { Module } from '@nestjs/common';
import { AdminController } from '@/presentation/http/admin/admin.controller';

// Governança/operação: kill switch da autonomia (AutonomyService e AuditService são globais).
@Module({
  controllers: [AdminController],
})
export class AdminModule {}
