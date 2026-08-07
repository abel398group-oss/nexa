import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
