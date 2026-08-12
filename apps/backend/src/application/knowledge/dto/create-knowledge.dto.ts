import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '@/shared/dto/trim.decorator';

/**
 * Os campos eram `@IsString()` puro — sem mínimo nem máximo. Na caça a bugs de
 * 11/08/2026 isso deixou entrar título de cinco espaços (linha em branco na
 * lista) e título de 5.003 caracteres, os dois com 201. String VAZIA também
 * passava, que é pior: um item sem título nem conteúdo entra na base e a Lia
 * pode recuperá-lo como se fosse resposta.
 *
 * `@Trim()` vem antes do `@MinLength` de propósito — sem isso o mínimo conta
 * espaço em branco. Ver shared/dto/trim.decorator.ts.
 */

/** Título é uma frase, não um artigo — cabe uma pergunta de cliente inteira. */
const TITULO_MAX = 200;
/** Tópico e categoria são rótulos de agrupamento, ficam curtos de propósito. */
const ROTULO_MAX = 80;
/**
 * Conteúdo é o artigo em si: generoso, mas com teto. Sem limite, um colar
 * acidental de PDF inteiro entra na base e vai para o contexto da Lia a cada
 * consulta — custo de token e resposta pior.
 */
const CONTEUDO_MAX = 50_000;

export class CreateKnowledgeDto {
  @Trim()
  @IsString({ message: 'Informe o tópico.' })
  @MinLength(2, { message: 'O tópico precisa de pelo menos 2 caracteres.' })
  @MaxLength(ROTULO_MAX, { message: `O tópico pode ter no máximo ${ROTULO_MAX} caracteres.` })
  topic!: string;

  @Trim()
  @IsString({ message: 'Informe a categoria.' })
  @MinLength(2, { message: 'A categoria precisa de pelo menos 2 caracteres.' })
  @MaxLength(ROTULO_MAX, { message: `A categoria pode ter no máximo ${ROTULO_MAX} caracteres.` })
  category!: string;

  @Trim()
  @IsString({ message: 'Informe o título.' })
  @MinLength(3, { message: 'O título precisa de pelo menos 3 caracteres.' })
  @MaxLength(TITULO_MAX, { message: `O título pode ter no máximo ${TITULO_MAX} caracteres.` })
  title!: string;

  @Trim()
  @IsString({ message: 'Informe o conteúdo.' })
  @MinLength(3, { message: 'O conteúdo precisa de pelo menos 3 caracteres.' })
  @MaxLength(CONTEUDO_MAX, { message: `O conteúdo pode ter no máximo ${CONTEUDO_MAX} caracteres.` })
  content!: string;

  @IsOptional() @Trim() @IsString() @MaxLength(64) productCode?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class AddVersionDto {
  @Trim()
  @IsString({ message: 'Informe o conteúdo.' })
  @MinLength(3, { message: 'O conteúdo precisa de pelo menos 3 caracteres.' })
  @MaxLength(CONTEUDO_MAX, { message: `O conteúdo pode ter no máximo ${CONTEUDO_MAX} caracteres.` })
  content!: string;

  @IsOptional() @Trim() @IsString() @MaxLength(120) author?: string;
}

export class ApproveVersionDto {
  @IsOptional() @Trim() @IsString() @MaxLength(120) reviewer?: string;
}
