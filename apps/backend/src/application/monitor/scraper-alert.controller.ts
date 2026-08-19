/**
 * ScraperAlertController — entrada server-to-server do relatório de raspagem do TMS.
 *
 * POST /api/monitor/scraper-alert
 *   Auth: `Authorization: Bearer <TMS_SERVICE_TOKEN>` (ServiceTokenGuard, fail-closed).
 *
 * Contrato documentado em `apps/backend/docs/portal-api-contract.md`. REGRA 1: campo
 * novo aqui é sempre `@IsOptional()` e exige atualizar aquele arquivo; REGRA 2: campo
 * não declarado neste DTO derruba a requisição inteira com 400, e o cron do TMS não
 * saberia por quê.
 *
 * O Nexa NÃO analisa log — ver o cabeçalho de `scraper-alert.service.ts`. Aqui só
 * chega conclusão já apurada do lado do TMS.
 */
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ServiceTokenGuard } from '@/shared/guards/service-token.guard';
import { ScraperAlertResult, ScraperAlertService } from './scraper-alert.service';

/**
 * Teto de 200 suspeitos por chamada. Não é o teto da mensagem (esse é 10, no service):
 * é o teto do payload, para um script com bug não empurrar o log inteiro por HTTP.
 */
const MAX_SUSPEITOS = 200;

export class ScraperSuspectDto {
  /** IP inteiro — é o que serve para bloquear. Sem validação de formato de propósito: IPv6, CIDR e forma abreviada entram iguais. */
  @IsString() @MinLength(3) @MaxLength(64) ip!: string;
  @IsInt() @Min(1) hits!: number;
  /** Pico de req/min. Ausente = não apurado. */
  @IsOptional() @IsInt() @Min(0) peakRpm?: number;
  @IsOptional() @IsString() @MaxLength(500) userAgent?: string;
  /** Baixou `directory.css`? OMITIR quando não apurado — `false` afirma que não baixou. */
  @IsOptional() @IsBoolean() fetchedCss?: boolean;
  @IsOptional() @IsString() @MaxLength(40) windowStart?: string;
  @IsOptional() @IsString() @MaxLength(40) windowEnd?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(300, { each: true })
  paths?: string[];
}

export class ScraperReportDto {
  /** Ex.: "hipertms.com.br/transportadoras". Compõe a chave do ritmo por IP. */
  @IsString() @MinLength(3) @MaxLength(200) site!: string;
  /** `critical` fura o ritmo — ver o comentário em `ScraperReport.severity`. */
  @IsOptional() @IsIn(['info', 'warn', 'critical']) severity?: 'info' | 'warn' | 'critical';
  @IsOptional() @IsInt() @Min(1) @Max(24 * 366) windowHours?: number;
  @IsOptional() @IsInt() @Min(0) totalHits?: number;
  @IsOptional() @IsInt() @Min(0) uniqueIps?: number;
  @IsArray() @ArrayMaxSize(MAX_SUSPEITOS) @ValidateNested({ each: true }) @Type(() => ScraperSuspectDto)
  suspects!: ScraperSuspectDto[];
  /** Valida e devolve `preview` sem enviar nada — não consome o ritmo por IP. */
  @IsOptional() @IsBoolean() dryRun?: boolean;
}

@UseGuards(ServiceTokenGuard)
@Controller('monitor')
export class ScraperAlertController {
  constructor(private readonly scraper: ScraperAlertService) {}

  /**
   * 200 com o resumo do que aconteceu, e não 204: o autor do cron precisa saber
   * quantos foram calados pelo ritmo, senão vai debugar "o alerta não chegou" achando
   * que a chamada falhou.
   */
  @Post('scraper-alert')
  async scraperAlert(@Body() dto: ScraperReportDto): Promise<ScraperAlertResult> {
    return this.scraper.report({
      site: dto.site,
      severity: dto.severity,
      windowHours: dto.windowHours,
      totalHits: dto.totalHits,
      uniqueIps: dto.uniqueIps,
      suspects: dto.suspects,
      dryRun: dto.dryRun,
    });
  }
}
