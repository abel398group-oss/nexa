import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class PropostaDto {
  /// Valor estimado do pipeline, não dinheiro devido. Sem ele o relatório só diz
  /// "fechou 3", sem distinguir 3 de R$ 200 de 3 de R$ 50.000.
  @ApiProperty({ description: 'Valor estimado (mensal ou total)' })
  @IsNumber()
  @Min(0)
  valor!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class GanhouDto {
  @ApiPropertyOptional({ description: 'Valor final, se diferente do da proposta' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  valor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class PerdeuDto {
  /// Obrigatório: perda sem motivo deixa "a lista era ruim ou a abordagem era?" sem
  /// resposta para sempre.
  @ApiProperty({ description: 'preco | concorrente | sem_fit | sem_resposta | outro' })
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

/// Perda por timing — congela com data de volta em vez de matar. "Sem orçamento
/// agora" não é "sem perfil".
export class AdiarDto extends PerdeuDto {
  @ApiProperty({ description: 'Quando retomar (ISO)' })
  @IsDateString()
  voltarEm!: string;
}

export class ReagendarDto {
  @ApiProperty({ description: 'Nova data/hora da reunião (ISO)' })
  @IsDateString()
  meetingAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  meetingUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
