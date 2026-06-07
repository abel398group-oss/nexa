import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from '@/presentation/http/users/users.controller';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
