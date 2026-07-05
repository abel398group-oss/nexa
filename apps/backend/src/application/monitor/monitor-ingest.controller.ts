/**
 * MonitorIngestController — recebe eventos de proatividade empurrados pelo TMS (webhook).
 *
 * POST /monitor/ingest
 *   Autenticação: Bearer token via ServiceTokenGuard (TMS_SERVICE_TOKEN).
 *   Payload: { tmsTenantId, events[] } — ver IngestFromTmsDto.
 *
 * O TMS chama este endpoint (fire-and-forget) sempre que gerar ou recalcular
 * eventos para um tenant. O Nexa faz upsert no AlertState e fecha automaticamente
 * os alertas que não vieram no payload (evento fechado no TMS).
 *
 * Se `events` vier vazio, todos os alertas abertos do tenant são resolvidos.
 */
import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ServiceTokenGuard } from '@/shared/guards/service-token.guard';
import { MonitorService } from './monitor.service';

export class TmsEventDto {
  @IsString() id!: string;
  @IsIn(['CRITICAL', 'OVERDUE', 'DUE_SOON', 'INFO']) severity!: 'CRITICAL' | 'OVERDUE' | 'DUE_SOON' | 'INFO';
  @IsIn(['frota', 'logistic', 'finance', 'fiscal']) category!: 'fiscal' | 'frota' | 'logistic' | 'finance';
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  /** Phone do admin do sub-cliente no formato E.164 sem "+" (ex: "5511999990001"). */
  @IsOptional() @IsString() adminPhone?: string;
  /** Nome do admin para personalizar a saudação da mensagem. */
  @IsOptional() @IsString() adminName?: string;
  /** Nome da empresa/transportadora para contextualizar a mensagem. */
  @IsOptional() @IsString() companyName?: string;
}

export class IngestFromTmsDto {
  @IsString() tmsTenantId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TmsEventDto)
  events!: TmsEventDto[];
}

export class ExternalConfigDto {
  @IsString() tmsTenantId!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(23) sendHour?: number;
  @IsOptional() @IsInt() @IsIn([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]) sendMinute?: number;
  @IsOptional() @IsBoolean() fiscalEnabled?: boolean;
  @IsOptional() @IsBoolean() logisticEnabled?: boolean;
  @IsOptional() @IsBoolean() frotaEnabled?: boolean;
  @IsOptional() @IsBoolean() financeEnabled?: boolean;
  /** { fiscal|logistic|frota|finance: { phone, sendHour, sendMinute, sendDays[0..6] } } */
  @IsOptional() sectorConfig?: Record<
    string,
    { phone?: string; sendHour?: number; sendMinute?: number; sendDays?: number[] }
  >;
}

@Controller('monitor')
@UseGuards(ServiceTokenGuard)
export class MonitorIngestController {
  constructor(private readonly monitor: MonitorService) {}

  @Post('ingest')
  async ingest(@Body() dto: IngestFromTmsDto) {
    return this.monitor.ingestFromTms(dto.tmsTenantId, dto.events);
  }

  // ── Config editada de dentro do TMS (proxy server-to-server — ADR 022) ──────

  @Get('external-config')
  async getExternalConfig(@Query('tmsTenantId') tmsTenantId: string) {
    return this.monitor.getExternalConfig(tmsTenantId);
  }

  @Put('external-config')
  async updateExternalConfig(@Body() dto: ExternalConfigDto) {
    const { tmsTenantId, ...config } = dto;
    return this.monitor.updateExternalConfig(tmsTenantId, config);
  }
}
