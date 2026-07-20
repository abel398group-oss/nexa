import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
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
// ADR 034 ("Estou fora"): controla se o handoff notifica o WhatsApp do vendedor.
class OutOfOfficeDto {
  @IsBoolean() outOfOffice!: boolean;
}
class BulkDeleteDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}
class UpdateSellerDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @MinLength(10) phone?: string;
  @IsOptional() @IsString() email?: string; // cria/troca o login do vendedor
  @IsOptional() @IsString() @MinLength(6) password?: string; // cria/reseta a senha
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('sellers')
@Controller('sellers')
export class SellersController {
  constructor(private readonly sellers: SellersService) {}

  @Get()
  list(@CurrentTenant() tenantId: string, @Query('search') search?: string) {
    return this.sellers.list(tenantId, search);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateSellerDto) {
    return this.sellers.create(tenantId, dto);
  }

  // exclusão em lote (definir ANTES de :id)
  @Post('bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string, @Body() body: BulkDeleteDto) {
    return this.sellers.deleteMany(tenantId, body.ids ?? []);
  }

  @Patch(':id/active')
  setActive(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: ActiveDto) {
    return this.sellers.setActive(tenantId, id, dto.active);
  }

  // ADR 034: toggle "Estou fora" — true = handoff também no WhatsApp (com deep link).
  @Patch(':id/out-of-office')
  setOutOfOffice(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: OutOfOfficeDto) {
    return this.sellers.setOutOfOffice(tenantId, id, dto.outOfOffice);
  }

  @Patch(':id')
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateSellerDto) {
    return this.sellers.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.sellers.remove(tenantId, id);
  }
}
