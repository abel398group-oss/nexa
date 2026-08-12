import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsBrazilPhone } from '@/shared/dto/is-brazil-phone.validator';
import { SellersService } from '@/application/sellers/sellers.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

/**
 * `@Transform` com trim ANTES do `@MinLength`: sem ele, um nome só de espaços
 * (`"     "`) passava no mínimo de 2 e virava um vendedor sem nome visível na
 * lista. As mensagens são em português porque o front repassa `message` do
 * backend direto para o toast — o texto daqui é o que o operador lê.
 */
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

class CreateSellerDto {
  @trim()
  @IsString({ message: 'Informe o nome do vendedor.' })
  @MinLength(2, { message: 'O nome precisa de pelo menos 2 caracteres.' })
  @MaxLength(120, { message: 'O nome pode ter no máximo 120 caracteres.' })
  name!: string;

  @IsBrazilPhone()
  phone!: string;

  // se vier, cria login do vendedor
  @IsOptional() @trim() @IsEmail({}, { message: 'E-mail inválido.' }) email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'A senha precisa de pelo menos 6 caracteres.' })
  password?: string;
}
class ActiveDto {
  @IsBoolean() active!: boolean;
}
// ADR 034 ("Estou fora"): controla se o handoff notifica o WhatsApp do vendedor.
class OutOfOfficeDto {
  @IsBoolean() outOfOffice!: boolean;
}
/// "Ausente" (módulo 1) — NÃO é o `outOfOffice` acima. Aquele decide se o handoff avisa
/// no WhatsApp; este tira o vendedor da distribuição de lote e da lista de closers
/// enquanto durar. Nomes parecidos, significados diferentes.
///
/// `null` marca a volta: quem voltou antes do previsto não precisa esperar a data.
class AwayDto {
  @IsOptional()
  @IsDateString()
  awayUntil?: string | null;
}
class BulkDeleteDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}
class UpdateSellerDto {
  @IsOptional()
  @trim()
  @IsString({ message: 'Informe o nome do vendedor.' })
  @MinLength(2, { message: 'O nome precisa de pelo menos 2 caracteres.' })
  @MaxLength(120, { message: 'O nome pode ter no máximo 120 caracteres.' })
  name?: string;

  // Mesma regra da criação: editar não pode ser a porta dos fundos para gravar
  // um telefone que a criação recusaria.
  @IsOptional() @IsBrazilPhone() phone?: string;

  @IsOptional() @trim() @IsEmail({}, { message: 'E-mail inválido.' }) email?: string; // cria/troca o login

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'A senha precisa de pelo menos 6 caracteres.' })
  password?: string; // cria/reseta a senha
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

  /// Marca ausência (férias, atestado) ou a volta (`awayUntil: null`). Enquanto durar, o
  /// vendedor não entra na distribuição de lote nem na lista de closers.
  @Patch(':id/away')
  setAway(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AwayDto,
  ) {
    return this.sellers.setAway(tenantId, id, dto.awayUntil ? new Date(dto.awayUntil) : null);
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
