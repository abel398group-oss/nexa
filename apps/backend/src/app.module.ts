import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './infra/prisma/prisma.module';
import { AuditModule } from './shared/audit/audit.module';
import { AuthModule } from './application/auth/auth.module';
import { ContactsModule } from './application/contacts/contacts.module';
import { ConversationsModule } from './application/conversations/conversations.module';
import { EventsModule } from './application/events/events.module';
import { ActionsModule } from './application/actions/actions.module';
import { ConnectorsModule } from './application/connectors/connectors.module';
import { CorrelationIdMiddleware } from './shared/middleware/correlation-id.middleware';
import { HealthController } from './presentation/http/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    // Logger estruturado (pino) com correlationId no contexto
    LoggerModule.forRoot({
      pinoHttp: {
        customProps: (req) => ({ correlationId: (req as any).correlationId }),
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
      },
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    EventsModule,
    ConnectorsModule,
    ContactsModule,
    ConversationsModule,
    ActionsModule,
    // Próximos módulos de feature: billing, ...
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
