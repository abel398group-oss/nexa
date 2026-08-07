import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '@/shared/dto/pagination.dto';

/**
 * Etapa 2B: query da listagem do Inbox.
 *
 * Precisa existir porque o ValidationPipe global valida o objeto de query
 * INTEIRO contra o DTO e usa `forbidNonWhitelisted` — qualquer parâmetro não
 * declarado aqui vira 400, mesmo que o controller o receba num `@Query('x')`
 * separado. Foi assim que o `?queue=` nasceu quebrado: existia no controller,
 * nunca foi chamado pelo frontend, e por isso ninguém percebeu que respondia
 * "property queue should not exist".
 */
export class ListConversationsQueryDto extends PaginationQueryDto {
  /** 'support' = só ticket de suporte · 'sales' = só conversa comercial. */
  @IsOptional()
  @IsIn(['support', 'sales'])
  scope?: 'support' | 'sales';

  /** Fila do Inbox de suporte. Omitido = todos. */
  @IsOptional()
  @IsIn(['all', 'mine', 'unassigned', 'waiting_internal'])
  queue?: 'all' | 'mine' | 'unassigned' | 'waiting_internal';

  /** Status da conversa (open, escalated, closed…). */
  @IsOptional()
  @IsString()
  status?: string;

  /** Filtro por vendedor. '__none__' = sem vendedor atribuído. */
  @IsOptional()
  @IsString()
  sellerId?: string;
}

/**
 * DTOs das rotas de conversa (auditoria 2026-08-06, item 1.3).
 *
 * Por que existem: o ValidationPipe global usa `whitelist + forbidNonWhitelisted`
 * (main.ts), mas ele só age quando o `@Body()` está tipado como CLASSE. Com um
 * tipo TypeScript inline (`@Body() dto: { userId: string | null }`) o metatype
 * vira `Object`, o pipe pula a validação inteira e o body entra cru — sem
 * whitelist, sem checagem de tipo, sem proteção contra mass-assignment.
 * O ContactsController já tinha essa nota; as rotas de conversa ficaram para trás.
 *
 * Nota sobre `@IsOptional()`: no class-validator ele pula a validação tanto para
 * `undefined` quanto para `null` — que é exatamente a semântica desejada nos
 * campos abaixo, onde `null` é um valor legítimo ("sem dono", "sem issue",
 * "limpar o outcome") e não uma ausência.
 */

export class AssignAnalystDto {
  /** Analista que passa a ser dono. `null` devolve o chamado à fila geral. */
  @IsOptional()
  @IsString()
  userId?: string | null;

  /**
   * Trava de concorrência (item 1.4). Quando presente, a gravação só acontece
   * se o dono atual no banco for exatamente este valor — `null` significa "eu
   * acredito que o chamado está sem dono", que é o caso do botão "Assumir".
   * Ausente (undefined) = transferência deliberada pelo seletor, grava direto.
   */
  @IsOptional()
  @IsString()
  expectedAnalystId?: string | null;
}

export class SetLinkedIssueDto {
  /**
   * URL da issue externa (Jira/GitHub/ClickUp/Trello); `null` remove o vínculo.
   * O formato http(s) é validado no service (regra de negócio já testada) —
   * aqui só garantimos que é string, para não rejeitar URLs internas válidas
   * do tipo `http://jira.local/BUG-1` que o `@IsUrl` derrubaria.
   */
  @IsOptional()
  @IsString()
  url?: string | null;
}

export class SetResolvedDto {
  @IsBoolean()
  resolved!: boolean;
}

export class SetOutcomeDto {
  /** `null` desfaz o outcome e reabre a conversa. */
  @IsOptional()
  @IsIn(['won', 'lost'])
  outcome?: 'won' | 'lost' | null;
}

/** Etapa 2A: novo texto de uma nota interna já gravada. */
export class UpdateInternalNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content!: string;
}

export class AddMessageDto {
  @IsIn(['inbound', 'outbound'])
  direction!: 'inbound' | 'outbound';

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content!: string;

  @IsOptional()
  @IsString()
  intent?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  /**
   * F12: nota interna — nunca despachada ao cliente. `@IsBoolean()` é a parte
   * que importa aqui: antes o campo vinha cru do body, então uma string
   * `"false"` (truthy em JS) passava direto. Agora só boolean de verdade.
   */
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
