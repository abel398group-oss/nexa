import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
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

  @ApiPropertyOptional({
    description:
      'Versão do roteiro que estava na tela. Obrigatório na prática (a mesa sempre manda quando há roteiro) — opcional no contrato porque nem toda ação acontece com roteiro na tela.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  scriptVersion?: number;
}

/// Herda só o carimbo — os três diálogos da mesa (pausar/descartar/transferir) mandam a
/// mesma versão que a atividade avulsa.
class ComCarimboDto {
  @ApiPropertyOptional({ description: 'Versão do roteiro na tela no momento da ação.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  scriptVersion?: number;
}

export class PausarDto extends ComCarimboDto {
  @ApiProperty({ description: 'Quando voltar a ligar (ISO). Sai da fila até essa data.' })
  @IsDateString()
  retornoEm!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class TransferirDto extends ComCarimboDto {
  /// `Seller.id` do closer, não id de usuário. O SDR escolhe na lista de
  /// `GET /api/sdr/closers?productCode=` — e o service revalida, porque API não
  /// confia no cliente.
  @ApiProperty({ description: 'Seller.id do closer que vai receber o lead' })
  @IsString()
  @IsNotEmpty()
  closerId!: string;

  @ApiPropertyOptional({
    description: 'Reunião marcada, se houver. Passar sem reunião é permitido.',
  })
  @IsOptional()
  @IsDateString()
  meetingAt?: string;

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

export class DescartarDto extends ComCarimboDto {
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

/**
 * Recalibragem do score pelo vendedor.
 *
 * `Max(100)` aqui e a mesma checagem no service, de propósito: a faixa decide
 * ordenação de fila e corte de lead quente, e um 250 que passasse estragaria os dois
 * em silêncio. Regra que sustenta ordenação não fica só na borda.
 */
export class AjustarScoreDto {
  @ApiProperty({ minimum: 0, maximum: 100, description: 'Temperatura do lead, 0 a 100.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  interestScore!: number;
}
