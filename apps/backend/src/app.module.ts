import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { EffectiveTenantInterceptor } from './shared/tenant/effective-tenant.interceptor';
import { PrismaModule } from './infra/prisma/prisma.module';
import { AiModule } from './shared/ai/ai.module';
import { GovernanceModule } from './shared/governance/governance.module';
import { WahaModule } from './shared/waha/waha.module';
import { AuditModule } from './shared/audit/audit.module';
import { AdminModule } from './application/admin/admin.module';
import { PortalModule } from './application/portal/portal.module';
import { OpportunitiesModule } from './application/opportunities/opportunities.module';
import { MetricsModule } from './application/metrics/metrics.module';
import { WhatsappModule } from './application/whatsapp/whatsapp.module';
import { SellersModule } from './application/sellers/sellers.module';
import { SenderModule } from './application/sender/sender.module';
import { FollowUpModule } from './application/followup/followup.module';
import { UsersModule } from './application/users/users.module';
import { AuthModule } from './application/auth/auth.module';
import { ContactsModule } from './application/contacts/contacts.module';
import { ConversationsModule } from './application/conversations/conversations.module';
import { EventsModule } from './application/events/events.module';
import { ActionsModule } from './application/actions/actions.module';
import { ConnectorsModule } from './application/connectors/connectors.module';
import { KnowledgeModule } from './application/knowledge/knowledge.module';
import { AgentsModule } from './application/agents/agents.module';
import { PlaybookModule } from './application/playbook/playbook.module';
import { NotificationsModule } from './application/notifications/notifications.module';
import { HandoffModule } from './application/handoff/handoff.module';
import { EmailModule } from './application/email/email.module';
import { CorrelationIdMiddleware } from './shared/middleware/correlation-id.middleware';
import { HealthController } from './presentation/http/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    // rate limiting (E1 - padrao TMS): 100 req/min por IP
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    // Logger estruturado (pino) com correlationId no contexto
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        customProps: (req) => ({ correlationId: (req as any).correlationId }),
        // resumo enxuto de cada request (evita log gigante)
        serializers: {
          req: (r: any) => ({ method: r.method, url: r.url }),
          res: (r: any) => ({ statusCode: r.statusCode }),
        },
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    PrismaModule,
    AiModule,
    GovernanceModule,
    WahaModule,
    AuditModule,
    AuthModule,
    EventsModule,
    ConnectorsModule,
    ContactsModule,
    ConversationsModule,
    ActionsModule,
    KnowledgeModule,
    AgentsModule,
    PlaybookModule,
    NotificationsModule,
    HandoffModule,
    EmailModule,
    AdminModule,
    PortalModule,
    OpportunitiesModule,
    MetricsModule,
    WhatsappModule,
    SellersModule,
    SenderModule,
    FollowUpModule,
    UsersModule,
    // Proximos modulos de feature: router, sales, supervisor ...
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard }, // rate limit global (E1)
    // resolve o tenant efetivo (platform admin) + somente-leitura na Fase 1
    { provide: APP_INTERCEPTOR, useClass: EffectiveTenantInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
