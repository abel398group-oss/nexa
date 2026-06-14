import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PortalController } from '@/presentation/http/portal/portal.controller';
import { PortalSessionService } from './portal-session.service';
import { PortalSessionGuard } from './portal-session.guard';
import { PortalTicketsService } from './portal-tickets.service';

// Auth do portal ISOLADA da interna: segredo + audience proprios (PORTAL_JWT_SECRET).
// HandoffService e HiperTmsConnector sao @Global — injetam direto.
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.PORTAL_JWT_SECRET ?? 'dev-portal-secret-trocar-no-deploy',
      signOptions: { audience: 'portal', expiresIn: '45m' },
    }),
  ],
  controllers: [PortalController],
  providers: [PortalSessionService, PortalSessionGuard, PortalTicketsService],
})
export class PortalModule {}
