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
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
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

@Controller('monitor')
@UseGuards(ServiceTokenGuard)
export class MonitorIngestController {
  constructor(private readonly monitor: MonitorService) {}

  @Post('ingest')
  async ingest(@Body() dto: IngestFromTmsDto) {
    return this.monitor.ingestFromTms(dto.tmsTenantId, dto.events);
  }
}
