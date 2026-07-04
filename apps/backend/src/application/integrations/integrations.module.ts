import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { PrismaModule } from '@/infra/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [IntegrationsController],
})
export class IntegrationsModule {}
