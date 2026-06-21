/**
 * MonitorController — 5 endpoints REST de config e gerenciamento de alertas.
 *
 * GET  /monitor/config           → configuração do tenant
 * PUT  /monitor/config           → atualiza preferências
 * GET  /monitor/alerts           → lista alertas abertos
 * POST /monitor/alerts/:id/snooze  → snooze 24h
 * POST /monitor/alerts/:id/resolve → resolve manualmente
 */
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { MonitorService } from './monitor.service';

class UpdateConfigDto {
  @IsInt() @Min(0) @Max(23) @IsOptional() sendHour?: number;
  @IsBoolean() @IsOptional() sendWeekends?: boolean;
  @IsIn(['whatsapp', 'email', 'both']) @IsOptional() channel?: string;
  @IsBoolean() @IsOptional() fiscalEnabled?: boolean;
  @IsBoolean() @IsOptional() logisticEnabled?: boolean;
  @IsBoolean() @IsOptional() frotaEnabled?: boolean;
  @IsBoolean() @IsOptional() financeEnabled?: boolean;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('monitor')
export class MonitorController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monitor: MonitorService,
  ) {}

  @RequirePerm('admin')
  @Get('config')
  async getConfig(@CurrentTenant() tenantId: string) {
    const config = await this.prisma.tenantNotificationConfig.findUnique({ where: { tenantId } });
    // Retorna defaults se não existe ainda
    return config ?? {
      tenantId,
      sendHour: 7,
      sendWeekends: false,
      channel: 'whatsapp',
      fiscalEnabled: true,
      logisticEnabled: true,
      frotaEnabled: true,
      financeEnabled: true,
    };
  }

  @RequirePerm('admin')
  @Put('config')
  async updateConfig(@CurrentTenant() tenantId: string, @Body() dto: UpdateConfigDto) {
    return this.prisma.tenantNotificationConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...dto },
      update: { ...dto },
    });
  }

  @RequirePerm('admin')
  @Get('alerts')
  async getAlerts(@CurrentTenant() tenantId: string) {
    return this.prisma.alertState.findMany({
      where: {
        tenantId,
        status: { in: ['open', 'snoozed'] },
      },
      orderBy: [
        // CRITICAL primeiro, depois OVERDUE, DUE_SOON, INFO
        { severity: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  @RequirePerm('admin')
  @Post('alerts/:id/snooze')
  async snooze(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const alert = await this.prisma.alertState.findFirst({ where: { id, tenantId } });
    if (!alert) throw new NotFoundException('Alerta não encontrado');
    const snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24h
    return this.prisma.alertState.update({
      where: { id },
      data: { status: 'snoozed', snoozedUntil },
    });
  }

  @RequirePerm('admin')
  @Post('alerts/:id/resolve')
  async resolve(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const alert = await this.prisma.alertState.findFirst({ where: { id, tenantId } });
    if (!alert) throw new NotFoundException('Alerta não encontrado');
    return this.prisma.alertState.update({
      where: { id },
      data: { status: 'resolved', updatedAt: new Date() },
    });
  }

  // Disparo manual do ciclo de sincronização (útil para teste/debug)
  @RequirePerm('admin')
  @Post('sync')
  async syncNow(@CurrentTenant() tenantId: string) {
    return this.monitor.syncNow(tenantId);
  }
}
