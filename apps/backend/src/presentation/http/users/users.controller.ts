import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { UsersService, AREAS } from '@/application/users/users.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';

// `role` é ENUM no banco (UserRole em schema.prisma) — texto livre aqui fazia o
// Prisma estourar 500 na hora do insert. Aconteceu de verdade: a tela mandou
// 'operador' (que não existe) e o operador só via "Internal Server Error", sem
// pista do motivo. Validando aqui, vira 400 dizendo exatamente o que é aceito.
const ROLES = ['admin', 'gestor', 'operacional', 'financeiro', 'vendedor'] as const;

class CreateUserDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsIn(ROLES as unknown as string[]) role?: string;
  @IsOptional() @IsArray() permissions?: string[];
}
class UpdateUserDto {
  @IsOptional() @IsIn(ROLES as unknown as string[]) role?: string;
  @IsOptional() @IsArray() permissions?: string[];
  // Mesmo mínimo do create — sem isto dava para trocar a senha por "1" na edição.
  @IsOptional() @IsString() @MinLength(6) password?: string;
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
    return this.users.list(tenantId, search);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateUserDto) {
    return this.users.create(tenantId, dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(tenantId, id, dto);
  }

  @Patch(':id/active')
  setActive(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: ActiveDto) {
    return this.users.setActive(tenantId, id, dto.active);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string, @CurrentUser() user: any) {
    return this.users.remove(tenantId, id, user?.userId);
  }
}
