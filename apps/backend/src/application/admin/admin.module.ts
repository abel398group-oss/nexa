import { Module } from '@nestjs/common';
import { AdminController } from '@/presentation/http/admin/admin.controller';
import { TenantsController } from '@/presentation/http/admin/tenants.controller';
import { TenantsService } from './tenants.service';

// Governanca/operacao: kill switch (AutonomyService/AuditService sao globais) + tenants.
@Module({
  controllers: [AdminController, TenantsController],
  providers: [TenantsService],
})
export class AdminModule {}
