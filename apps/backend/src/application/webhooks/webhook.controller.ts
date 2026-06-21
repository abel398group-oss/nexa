/**
 * WebhookController — CRUD de subscriptions + listagem de deliveries.
 *
 * Todos os endpoints são protegidos por JWT + permissão 'webhooks:manage'.
 * O secret recebido do cliente é criptografado antes de persistir.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EmailCryptoService } from '@/shared/email-crypto/email-crypto.service';

class CreateWebhookDto {
  @IsUrl({}, { message: 'url deve ser uma URL válida com https' })
  url!: string;

  @IsString()
  secret!: string;

  @IsArray()
  @IsString({ each: true })
  events!: string[];
}

class UpdateWebhookDto {
  @IsUrl()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  secret?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  events?: string[];

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EmailCryptoService,
  ) {}

  @RequirePerm('webhooks:manage')
  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.prisma.webhookSubscription.findMany({
      where: { tenantId },
      select: {
        id: true, url: true, events: true, active: true, createdAt: true,
        // Nunca retorna o secret em texto claro
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @RequirePerm('webhooks:manage')
  @Post()
  async create(@CurrentTenant() tenantId: string, @Body() dto: CreateWebhookDto) {
    const encryptedSecret = this.crypto.encrypt(dto.secret);
    const sub = await this.prisma.webhookSubscription.create({
      data: { tenantId, url: dto.url, secret: encryptedSecret, events: dto.events },
    });
    return { id: sub.id, url: sub.url, events: sub.events, active: sub.active };
  }

  @RequirePerm('webhooks:manage')
  @Put(':id')
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    // Garante que o tenant só edita as próprias subscriptions
    await this.prisma.webhookSubscription.findFirstOrThrow({ where: { id, tenantId } });
    const data: Record<string, unknown> = {};
    if (dto.url !== undefined) data.url = dto.url;
    if (dto.events !== undefined) data.events = dto.events;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.secret !== undefined) data.secret = this.crypto.encrypt(dto.secret);
    return this.prisma.webhookSubscription.update({ where: { id }, data });
  }

  @RequirePerm('webhooks:manage')
  @Delete(':id')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.prisma.webhookSubscription.findFirstOrThrow({ where: { id, tenantId } });
    await this.prisma.webhookSubscription.delete({ where: { id } });
    return { deleted: true };
  }

  // Lista as últimas 50 deliveries de uma subscription (para debug no painel)
  @RequirePerm('webhooks:manage')
  @Get(':id/deliveries')
  async deliveries(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.prisma.webhookSubscription.findFirstOrThrow({ where: { id, tenantId } });
    return this.prisma.webhookDelivery.findMany({
      where: { subscriptionId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, event: true, status: true, attempts: true,
        responseStatus: true, error: true, deliveredAt: true, createdAt: true,
      },
    });
  }
}
