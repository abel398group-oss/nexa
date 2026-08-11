import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/// Canais que o SDR usa. Texto livre no banco (`SellerActivity.type`), mas fechado
/// aqui: o DTO é o lugar de recusar canal inventado, sem custar migration.
const CANAIS = ['call', 'whatsapp', 'email', 'note'] as const;

export class RegistrarAtividadeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  opportunityId!: string;

  @ApiProperty({ enum: CANAIS })
  @IsIn(CANAIS as unknown as string[])
  type!: string;

  @ApiPropertyOptional({
    description: 'atendeu | nao_atendeu | agendou_retorno | sem_interesse | numero_errado | nao_e_decisor',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  result?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Só faz sentido para type=call' })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;
}

export class PausarDto {
  @ApiProperty({ description: 'Quando voltar a ligar (ISO). Sai da fila até essa data.' })
  @IsDateString()
  retornoEm!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class DescartarDto {
  /// Obrigatório de propósito: descarte sem motivo é dado perdido. Depois ninguém
  /// sabe se a lista era ruim ou se a abordagem era.
  @ApiProperty({ description: 'sem_fit | sem_resposta | concorrente | numero_errado | outro' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  motivo!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
