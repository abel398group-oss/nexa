import { Controller, Post, Body, Headers, HttpCode } from '@nestjs/common';
import { HandoffService } from '@/application/handoff/handoff.service';

class CreateHandoffDto {
  externalId!: string;
  tenantId!: string;
  name?: string; // nome do usuário logado no TMS (identidade segura)
  page?: string;
  errorCode?: string;
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
    const serviceToken = auth?.replace(/^Bearer\s+/i, '');
    const result = await this.handoff.create({
      externalId: body.externalId,
      tenantId: body.tenantId,
      name: body.name,
      page: body.page,
      errorCode: body.errorCode,
      serviceToken,
    });
    return result;
  }
}
