import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/// Todo campo declarado: `forbidNonWhitelisted` é global, então campo fora do DTO é
/// 400 — e campo esquecido aqui chega no service como undefined (REGRA 1).
export class ImportarLoteDto {
  @ApiProperty({ description: 'Mercado que recebe o lote (productCode, ADR 037)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  productCode!: string;

  @ApiProperty({ description: 'Nome da lista — é a etiqueta do lote nos relatórios' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /// Conteúdo do arquivo como texto, não multipart. O front lê o CSV com FileReader e
  /// manda o texto: evita somar multer ao projeto por um arquivo de algumas centenas
  /// de KB. Se um dia entrar lista de 100 mil linhas, aí sim vale trocar por upload.
  @ApiProperty({ description: 'Conteúdo do CSV em texto' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5_000_000)
  csv!: string;

  @ApiPropertyOptional({ description: 'Origem da lista: "feira intermodal", "site"' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceDetail?: string;

  @ApiPropertyOptional({
    description: 'Base legal LGPD deste lote (feira = consentimento; comprada = não)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  consentBasis?: string;

  @ApiPropertyOptional({
    description:
      'Importa também quem já está na base. Único motivo forçável — os outros quatro ficam travados.',
  })
  @IsOptional()
  @IsBoolean()
  forcarJaNaBase?: boolean;

  @ApiPropertyOptional({
    description:
      'Prévia: roda a peneira e devolve o relatório sem gravar nada. A tela chama com true primeiro, e só depois com false, quando o operador confirma.',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
