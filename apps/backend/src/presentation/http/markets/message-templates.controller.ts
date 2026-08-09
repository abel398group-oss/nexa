import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { MessageTemplatesService } from '@/application/markets/message-templates.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

// REGRA 2: campo não declarado aqui é derrubado com 400 pelo forbidNonWhitelisted global.
class CreateTemplateDto {
  @IsString() @MinLength(1) productCode!: string;
  @IsString() @MinLength(2) name!: string;
  @IsIn(['email', 'whatsapp']) channel!: string;
  @IsOptional() @IsString() subject?: string;
  @IsString() @MinLength(1) body!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) step?: number;
}

class UpdateTemplateDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() @MinLength(1) body?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) step?: number;
}

class PreviewDto {
  @IsOptional() @IsString() productCode?: string;
  @IsIn(['email', 'whatsapp']) channel!: string;
  @IsOptional() @IsString() subject?: string;
  @IsString() @MinLength(1) body!: string;
  @IsOptional() @IsString() nomeTeste?: string;
}

class SendTestDto {
  @IsEmail() to!: string;
  @IsOptional() @IsString() productCode?: string;
  @IsOptional() @IsString() subject?: string;
  @IsString() @MinLength(1) body!: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('campaigns')
@Controller('message-templates')
export class MessageTemplatesController {
  constructor(private readonly templates: MessageTemplatesService) {}

  @Get()
  list(
    @CurrentTenant() tenantId: string,
    @Query('productCode') productCode?: string,
    @Query('channel') channel?: string,
  ) {
    return this.templates.list(tenantId, productCode, channel);
  }

  /**
   * Pré-visualização. É POST e não GET porque o corpo da mensagem vai no body —
   * texto de campanha inteiro numa query string estoura o limite e ainda vaza a copy
   * para o log de acesso do servidor.
   */
  @Post('preview')
  preview(@CurrentTenant() tenantId: string, @Body() dto: PreviewDto) {
    return this.templates.preview(tenantId, dto);
  }

  @Post('send-test')
  sendTest(@CurrentTenant() tenantId: string, @Body() dto: SendTestDto) {
    return this.templates.sendTest(tenantId, dto.to, dto);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateTemplateDto) {
    return this.templates.create(tenantId, dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(tenantId, id, dto);
  }

  // Arquiva, não apaga — a campanha antiga continua apontando para o texto que a gerou.
  @Delete(':id')
  archive(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.templates.archive(tenantId, id);
  }
}
