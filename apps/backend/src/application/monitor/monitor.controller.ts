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
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { normalizePhone } from '@/shared/utils/phone.util';
import { MonitorService } from './monitor.service';
import { ConsolidationService } from './consolidation.service';

// Converte null → undefined para que @IsOptional() pule a validação.
// Necessário porque o ValidationPipe global tem transform:true (class-transformer ativo)
// mas @IsOptional() só ignora undefined, não null. Com @Transform antes, null vira
// undefined e todos os validadores são pulados corretamente.
const nullToUndefined = () => Transform(({ value }) => (value === null ? undefined : value));

class UpdateConfigDto {
  @IsBoolean() @IsOptional() enabled?: boolean;
  @IsInt() @Min(0) @Max(23) @IsOptional() @nullToUndefined() sendHour?: number;
  @IsInt() @IsIn([0,5,10,15,20,25,30,35,40,45,50,55]) @IsOptional() @nullToUndefined() sendMinute?: number;
  @IsString() @IsOptional() @nullToUndefined() notificationPhone?: string;
  @IsArray() @IsOptional() recipients?: Array<{ label: string; contact: string; channel: string }>;
  @IsBoolean() @IsOptional() sendWeekends?: boolean;
  @IsIn(['whatsapp', 'email', 'both']) @IsOptional() channel?: string;
  @IsBoolean() @IsOptional() fiscalEnabled?: boolean;
  @IsBoolean() @IsOptional() logisticEnabled?: boolean;
  @IsBoolean() @IsOptional() frotaEnabled?: boolean;
  @IsBoolean() @IsOptional() financeEnabled?: boolean;
  // Config por setor: { fiscal|logistic|frota|finance: { phone, sendHour, sendMinute } }
  @IsOptional() sectorConfig?: Record<string, { phone?: string; sendHour?: number; sendMinute?: number }>;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('monitor')
export class MonitorController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monitor: MonitorService,
    private readonly consolidation: ConsolidationService,
    private readonly waha: WahaClientService,
  ) {}

  @RequirePerm('admin')
  @Get('config')
  async getConfig(@CurrentTenant() tenantId: string) {
    const config = await this.prisma.tenantNotificationConfig.findUnique({
      where: { tenantId },
      // Seleciona apenas campos de config — exclui id/tenantId/createdAt/updatedAt
      // para evitar que o frontend os reenvie no PUT e tome 400 (forbidNonWhitelisted).
      select: {
        enabled: true,
        sendHour: true,
        sendMinute: true,
        notificationPhone: true,
        recipients: true,
        sendWeekends: true,
        channel: true,
        fiscalEnabled: true,
        logisticEnabled: true,
        frotaEnabled: true,
        financeEnabled: true,
        sectorConfig: true,
      },
    });
    return config ?? {
      enabled: false,
      sendHour: 7,
      sendMinute: 0,
      notificationPhone: null,
      recipients: [],
      sendWeekends: false,
      channel: 'whatsapp',
      fiscalEnabled: true,
      logisticEnabled: true,
      frotaEnabled: true,
      financeEnabled: true,
      sectorConfig: null,
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

  // Envia uma mensagem de teste WhatsApp para o primeiro destinatário WA configurado.
  // Ignora alertas e hora — serve apenas para validar se o canal está funcionando.
  @RequirePerm('admin')
  @Post('test')
  async testNotify(@CurrentTenant() tenantId: string) {
    const config = await this.prisma.tenantNotificationConfig.findUnique({ where: { tenantId } });

    // Resolve o telefone de teste: recipients (wa) → notificationPhone → env
    const recipients = (config?.recipients as Array<{ contact: string; channel: string }> | null) ?? [];
    const firstWaRecipient = recipients.find((r) => r.channel === 'whatsapp' && r.contact);
    const rawPhone =
      firstWaRecipient?.contact ?? config?.notificationPhone ?? process.env.ALERT_ADMIN_PHONE ?? '';
    const phone = normalizePhone(rawPhone.split(',')[0]);

    if (!phone || phone.length < 12) {
      return { sent: false, reason: 'Nenhum destinatário WhatsApp configurado. Adicione um na lista de destinatários primeiro.' };
    }
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const msg =
      `🧪 *Teste do Monitor Proativo — Hipervias*\n\n` +
      `Se você recebeu esta mensagem, as notificações estão funcionando corretamente! ✅\n\n` +
      `_Enviado em: ${now}_\n\n` +
      `Acesse o painel da Hipervias: https://www.hipertms.com.br`;
    const result = await this.waha.sendText(phone, msg);
    return { sent: result.sent, phone, reason: result.reason ?? null };
  }

  // Disparo manual do ciclo de sincronização (útil para teste/debug)
  @RequirePerm('admin')
  @Post('sync')
  async syncNow(@CurrentTenant() tenantId: string) {
    return this.monitor.syncNow(tenantId);
  }

  // Força envio imediato da notificação WhatsApp, ignorando hora configurada (debug/teste)
  @RequirePerm('admin')
  @Post('notify-now')
  async notifyNow(@CurrentTenant() tenantId: string) {
    return this.consolidation.forceForTenant(tenantId);
  }

  /**
   * Injeta alertas de teste em todos os setores para validar o fluxo de notificação
   * end-to-end sem depender do TMS ter dados reais.
   * Remove alertas de teste anteriores antes de criar novos.
   * Uso: POST /monitor/seed-test → depois POST /monitor/notify-now para disparar.
   */
  @RequirePerm('admin')
  @Post('seed-test')
  async seedTestAlerts(@CurrentTenant() tenantId: string) {
    // Remove alertas de teste anteriores deste tenant
    await this.prisma.alertState.deleteMany({
      where: { tenantId, tmsEventId: { startsWith: 'seed-test-' } },
    });

    const now = new Date();
    const seeds = [
      { id: 'seed-test-fiscal-1',   category: 'fiscal',   severity: 'CRITICAL', title: 'CT-e 999001 rejeitado — código 539 SEFAZ',          description: 'Rejeição por certificado vencido' },
      { id: 'seed-test-fiscal-2',   category: 'fiscal',   severity: 'DUE_SOON', title: 'MDF-e 888002 vence em 24h',                          description: 'Prazo de encerramento próximo' },
      { id: 'seed-test-logistic-1', category: 'logistic', severity: 'OVERDUE',  title: 'Embarque #4501 atrasado há 2 dias',                  description: 'Entrega prevista 30/06 não confirmada' },
      { id: 'seed-test-frota-1',    category: 'frota',    severity: 'DUE_SOON', title: 'Revisão obrigatória — placa ABC-1234 vence amanhã',   description: 'CRLV e revisão periódica' },
      { id: 'seed-test-finance-1',  category: 'finance',  severity: 'OVERDUE',  title: 'Fatura #7890 venceu há 3 dias',                      description: 'R$ 12.500,00 em aberto' },
    ];

    const created = await Promise.all(
      seeds.map((s) =>
        this.prisma.alertState.create({
          data: {
            tenantId,
            tmsEventId: s.id,
            severity: s.severity,
            category: s.category,
            title: s.title,
            description: s.description,
            status: 'open',
            createdAt: now,
            updatedAt: now,
          },
        }),
      ),
    );

    return {
      seeded: created.length,
      message: 'Alertas de teste criados. Agora chame POST /monitor/notify-now para disparar as notificações.',
      alerts: created.map((a) => ({ id: a.id, category: a.category, severity: a.severity, title: a.title })),
    };
  }
}
