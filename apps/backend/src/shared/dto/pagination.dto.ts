import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { IsIntInRange } from './is-int-in-range.validator';

// Paginação padrão (ADR API contract): ?limit=50&offset=0&search=
//
// `IsIntInRange` no lugar do trio `@IsInt() @Min() @Max()`: com entrada não
// numérica o `@Type(() => Number)` produz NaN, e os três falhavam juntos porque
// toda comparação com NaN é falsa. `?limit=abc` respondia "não pode ser maior
// que 5000" E "não pode ser menor que 1" na mesma lista — duas frases que não
// podem ser verdade ao mesmo tempo, e nenhuma dizendo o que era. Uma checagem
// só devolve uma mensagem só, e ela bate com o caso. Ver o validador.
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIntInRange(1, 5000) // teto: seletor de contatos da campanha carrega a base inteira
  limit: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsIntInRange(0, Number.MAX_SAFE_INTEGER)
  offset: number = 0;

  @IsOptional()
  @IsString()
  search?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}
