import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@/shared/dto/pagination.dto';

/**
 * Query da listagem de contatos.
 *
 * Existe porque o `ValidationPipe` global roda com `forbidNonWhitelisted: true`:
 * parâmetro que não está declarado no DTO da rota derruba a requisição inteira
 * com 400. Declarar `@Query('tag')` no controller NÃO basta — quem valida é o
 * `@Query() q: PaginationQueryDto`, e ele olha o objeto de query completo.
 *
 * Sem esta classe, `tag`, `owner`, `status` e `base` viravam 400 e a tela
 * mostrava "Nenhum contato ainda" — que lê como base vazia, não como erro. É a
 * pior forma de falhar: a resposta errada com cara de resposta certa.
 */
export class ListContactsQueryDto extends PaginationQueryDto {
  /// Etiqueta única (o modelo guarda `tags: string[]`, o filtro é `has`).
  @IsOptional()
  @IsString()
  tag?: string;

  /// Carteira: id do vendedor, ou 'sem-dono' para os ainda não distribuídos.
  @IsOptional()
  @IsString()
  owner?: string;

  @IsOptional()
  @IsIn(['active', 'opted_out'], { message: 'status aceita apenas active ou opted_out' })
  status?: string;

  /// Recorte da base: prospecção, clientes do TMS, ou os dois.
  @IsOptional()
  @IsIn(['lead', 'cliente', 'todos'], { message: 'base aceita apenas lead, cliente ou todos' })
  base?: string;
}
