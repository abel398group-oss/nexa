import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConversationsService } from './conversations.service';
import { ConversationJanitorService } from './conversation-janitor.service';
import { ConversationsController } from '@/presentation/http/conversations/conversations.controller';
import { ConversationsGateway } from '@/presentation/ws/conversations.gateway';
import { NotificationsModule } from '@/application/notifications/notifications.module';

@Module({
  imports: [
    // JwtService injetado no gateway para validar o cookie access_token no evento 'join' (SEC-005)
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
    NotificationsModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsGateway, ConversationJanitorService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
