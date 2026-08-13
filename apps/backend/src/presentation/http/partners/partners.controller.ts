import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim, NOME_MAX } from '@/shared/dto/trim.decorator';
import { IsBrazilPhone } from '@/shared/dto/is-brazil-phone.validator';
import { PartnersService } from '@/application/partners/partners.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

// `@Trim` antes do `@MinLength`: sem ele um nome de cinco espaços passava e
// virava uma linha em branco na lista. `contactPhone` era `@IsString()` puro —
// aceitava letra e o normalize gravava vazio, o mesmo furo do cadastro de
// vendedor. Mensagens em português porque o front joga `message` direto no toast.
class CreatePartnerDto {
  @Trim()
  @IsString({ message: 'Informe o nome do parceiro.' })
  @MinLength(2, { message: 'O nome precisa de pelo menos 2 caracteres.' })
  @MaxLength(NOME_MAX, { message: `O nome pode ter no máximo ${NOME_MAX} caracteres.` })
  name!: string;

  @Trim()
  @IsString({ message: 'Informe o tipo do parceiro.' })
  @MinLength(2, { message: 'O tipo precisa de pelo menos 2 caracteres.' })
  @MaxLength(NOME_MAX, { message: `O tipo pode ter no máximo ${NOME_MAX} caracteres.` })
  type!: string; // ex: 'pneus'

  @IsOptional() @Trim() @IsEmail({}, { message: 'E-mail de contato inválido.' }) contactEmail?: string;
  @IsOptional() @IsBrazilPhone() contactPhone?: string;
}
// Mesmas regras da criação: editar não pode ser a porta dos fundos para gravar
// um valor que a criação recusaria.
class UpdatePartnerDto {
  @IsOptional()
  @Trim()
  @IsString({ message: 'Informe o nome do parceiro.' })
  @MinLength(2, { message: 'O nome precisa de pelo menos 2 caracteres.' })
  @MaxLength(NOME_MAX, { message: `O nome pode ter no máximo ${NOME_MAX} caracteres.` })
  name?: string;

  @IsOptional()
  @Trim()
  @IsString({ message: 'Informe o tipo do parceiro.' })
  @MinLength(2, { message: 'O tipo precisa de pelo menos 2 caracteres.' })
  @MaxLength(NOME_MAX, { message: `O tipo pode ter no máximo ${NOME_MAX} caracteres.` })
  type?: string;

  @IsOptional() @Trim() @IsEmail({}, { message: 'E-mail de contato inválido.' }) contactEmail?: string;
  @IsOptional() @IsBrazilPhone() contactPhone?: string;
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

  // Recusa com 409 se o parceiro já tem indicação no histórico — ver o service.
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.partners.remove(tenantId, id);
  }
}
