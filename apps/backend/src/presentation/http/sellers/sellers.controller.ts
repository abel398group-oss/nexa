import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { SellersService } from '@/application/sellers/sellers.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

class CreateSellerDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(10) phone!: string;
  @IsOptional() @IsString() email?: string; // se vier, cria login do vendedor
  @IsOptional() @IsString() @MinLength(6) password?: string;
}
class ActiveDto {
  @IsBoolean() active!: boolean;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('sellers')
@Controller('sellers')
export class SellersController {
  constructor(private readonly sellers: SellersService) {}

  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.sellers.list(tenantId ?? 'default');
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateSellerDto) {
    return this.sellers.create(tenantId ?? 'default', dto);
  }

  @Patch(':id/active')
  setActive(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: ActiveDto) {
    return this.sellers.setActive(tenantId ?? 'default', id, dto.active);
  }
}
