import { Controller, Post, Body, Headers, HttpCode } from '@nestjs/common';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { HandoffService } from '@/application/handoff/handoff.service';

class CreateHandoffDto {
  // TMS envia 'userId'; mantemos 'externalId' como alias para compatibilidade interna.
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() externalId?: string;
  @IsString() tenantId!: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() errorCode?: string;
  // TMS envia isManager=true para gestores (aba "Chamados da empresa").
  // Sem este campo no DTO, o ValidationPipe global (forbidNonWhitelisted)
  // rejeitava TODO handoff com 400 — quebrando o widget de suporte.
  @IsOptional() @IsBoolean() isManager?: boolean;
  // Empresa do usuário logado no TMS. Mesma armadilha do isManager, de novo
  // (2026-08-07): o TMS passou a enviar companyName + cnpj em 2026-08-06 a pedido
  // do Nexa, o DTO não foi atualizado, e TODO handoff voltou a ser 400 —
  // derrubando a abertura de chamado no widget. Ver REGRAS-SQUAD.md, REGRA 1.
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() cnpj?: string;
}

// POST /api/handoff/token — gerado pelo TMS (server-to-server)
// Autenticação: Authorization: Bearer <TMS_SERVICE_TOKEN>
@Controller('handoff')
export class HandoffController {
  constructor(private readonly handoff: HandoffService) {}

  @Post('token')
  @HttpCode(201)
  async createToken(
    @Body() body: CreateHandoffDto,
    @Headers('authorization') auth: string,
  ) {
    // Aceita 'userId' (campo do TMS) ou 'externalId' (campo interno do Nexa).
    const externalId = body.userId ?? body.externalId ?? '';
    const serviceToken = auth?.replace(/^Bearer\s+/i, '');
    const result = await this.handoff.create({
      externalId,
      tenantId: body.tenantId,
      name: body.name,
      page: body.page,
      errorCode: body.errorCode,
      isManager: body.isManager,
      companyName: body.companyName,
      cnpj: body.cnpj,
      serviceToken,
    });
    return result;
  }
}
