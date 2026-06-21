import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from '@/presentation/http/auth/auth.controller';
import { JwtStrategy } from '@/shared/auth/jwt.strategy';
import { UsersService } from '@/application/users/users.service';
import { PrismaService } from '@/infra/prisma/prisma.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, UsersService, PrismaService],
  exports: [AuthService],
})
export class AuthModule {}
