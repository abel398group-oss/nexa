import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { UsersService, AREAS } from '@/application/users/users.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';

class CreateUserDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsArray() permissions?: string[];
}
class UpdateUserDto {
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsArray() permissions?: string[];
  @IsOptional() @IsString() password?: string;
}
class ActiveDto { @IsBoolean() active!: boolean; }

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('users') // só admin (ou quem tiver 'users') gerencia usuários
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('areas')
  areas() { return AREAS; }

  @Get()
  list(@CurrentTenant() tenantId: string, @Query('search') search?: string) {
    return this.users.list(tenantId ?? 'default', search);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateUserDto) {
    return this.users.create(tenantId ?? 'default', dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(tenantId ?? 'default', id, dto);
  }

  @Patch(':id/active')
  setActive(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: ActiveDto) {
    return this.users.setActive(tenantId ?? 'default', id, dto.active);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string, @CurrentUser() user: any) {
    return this.users.remove(tenantId ?? 'default', id, user?.userId);
  }
}
