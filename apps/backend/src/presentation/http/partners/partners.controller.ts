import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { PartnersService } from '@/application/partners/partners.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

class CreatePartnerDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) type!: string; // ex: 'pneus'
  @IsOptional() @IsString() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
}
class UpdatePartnerDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @MinLength(2) type?: string;
  @IsOptional() @IsString() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
}
class ActiveDto {
  @IsBoolean() active!: boolean;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('partners')
@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  list(@CurrentTenant() tenantId: string, @Query('search') search?: string) {
    return this.partners.list(tenantId, search);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.partners.findOne(tenantId, id);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreatePartnerDto) {
    return this.partners.create(tenantId, dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partners.update(tenantId, id, dto);
  }

  @Patch(':id/active')
  setActive(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: ActiveDto) {
    return this.partners.setActive(tenantId, id, dto.active);
  }
}
