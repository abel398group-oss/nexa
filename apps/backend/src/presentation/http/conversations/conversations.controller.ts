import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsString } from 'class-validator';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '@/shared/dto/pagination.dto';
import {
  AddMessageDto,
  AssignAnalystDto,
  SetLinkedIssueDto,
  SetOutcomeDto,
  SetResolvedDto,
} from '@/application/conversations/dto/conversations.dto';

class BulkActionDto {
  @IsIn(['archive', 'delete']) action!: 'archive' | 'delete';
  @IsArray() @IsString({ each: true }) ids!: string[];
}

// se for vendedor, restringe à carteira dele (assignedSellerId); admin/gestor veem tudo
function sellerScope(user: any): string | undefined {
  return user?.role === 'vendedor' ? user.sellerId ?? '__none__' : undefined;
}

/**
 * Papéis que operam o suporte e, por isso, podem LER nota interna.
 *
 * Auditoria 2026-08-06 (item 1.1): antes a rota de mensagens devolvia
 * `includeInternal: true` para qualquer usuário autenticado do tenant. Como
 * `vendedor` recebe a permissão `inbox` de fábrica (sellers.service.ts), nem
 * `@RequirePerm('inbox')` separaria — a fronteira real aqui é de PAPEL, não de
 * permissão: nota interna é artefato de suporte, e o lado comercial não tem o
 * que fazer com o diagnóstico técnico de um chamado.
 *
 * Allowlist de propósito (fail-closed): um papel novo criado no futuro entra
 * SEM acesso a nota interna até alguém liberar aqui conscientemente. O inverso
 * (denylist) daria acesso por esquecimento, que é justamente como este furo
 * apareceu.
 */
const SUPPORT_ROLES = ['admin', 'operacional'];

function canReadInternalNotes(user: any): boolean {
  return SUPPORT_ROLES.includes(user?.role);
}

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  private readonly logger = new Logger('ConversationsController');

  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  async findAll(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query() q: PaginationQueryDto,
    // F12: fila do Inbox de suporte — 'mine' | 'unassigned' | 'all' (default).
    @Query('queue') queue?: string,
  ) {
    const assignedAnalystId =
      queue === 'mine' ? user?.userId
      : queue === 'unassigned' ? null
      : undefined;
    const result = await this.conversations.findAll(tenantId, q, sellerScope(user), assignedAnalystId);
    this.logger.log(`[list] tenantId=${tenantId} role=${user?.role} total=${result.total} items=${result.items.length}`);
    return result;
  }

  // F12: lista analistas do tenant pro seletor de atribuição — antes de :id
  // de propósito, senão o Nest casa "analysts" como um :id.
  @Get('analysts')
  listAnalysts(@CurrentTenant() tenantId: string) {
    return this.conversations.listAnalysts(tenantId);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.conversations.findOne(tenantId, id);
  }

  @Get(':id/messages')
  messages(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    // F12 + item 1.1: rota do Inbox. Nota interna só para quem opera suporte —
    // `vendedor` recebe o mesmo histórico que o cliente veria (ver SUPPORT_ROLES).
    return this.conversations.getMessages(tenantId, id, {
      includeInternal: canReadInternalNotes(user),
    });
  }

  @Get(':id/timeline')
  timeline(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.conversations.getTimeline(tenantId, id);
  }

  @Post()
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: { contactId: string; phone: string; productCode?: string; sourceChannel?: string },
  ) {
    return this.conversations.create(tenantId, dto);
  }

  @Patch(':id/outcome')
  setOutcome(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SetOutcomeDto,
  ) {
    return this.conversations.setOutcome(tenantId, id, dto.outcome ?? null);
  }

  @Patch(':id/assign')
  assign(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: { sellerId: string | null },
  ) {
    return this.conversations.assign(tenantId, id, dto.sellerId ?? null);
  }

  // F12: atribuição de chamado de SUPORTE a um analista humano — "Assumir
  // chamado" no frontend chama isto com { userId: user.id } (o próprio
  // analista logado); reatribuir a outro analista manda o userId dele;
  // { userId: null } devolve pra fila geral.
  @Patch(':id/assign-analyst')
  assignAnalyst(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignAnalystDto,
  ) {
    // Item 1.4: `expectedAnalystId` ausente = transferência deliberada (grava
    // direto). Presente = "Assumir", e aí a gravação vira condicional no service.
    return this.conversations.assignAnalyst(tenantId, id, dto.userId ?? null, {
      expectedAnalystId: dto.expectedAnalystId,
    });
  }

  // F13: vincula (ou remove, url=null) o link da issue de dev (Jira/GitHub/
  // ClickUp/Trello) — move o chamado pra waiting_internal quando vincula.
  @Patch(':id/linked-issue')
  setLinkedIssue(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SetLinkedIssueDto,
  ) {
    return this.conversations.setLinkedIssue(tenantId, id, dto.url?.trim() || null);
  }

  // Suporte: resolver (fecha com outcome=resolved) ou reabrir o chamado.
  // Frontend chama PATCH /conversations/:id/resolve com { resolved: boolean }.
  @Patch(':id/resolve')
  resolve(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SetResolvedDto,
  ) {
    return this.conversations.setResolved(tenantId, id, dto.resolved);
  }

  // Arquiva uma conversa (soft close, outcome=archived).
  @Patch(':id/archive')
  archive(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.conversations.archive(tenantId, id);
  }

  // Exclui permanentemente uma conversa e suas mensagens.
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.conversations.remove(tenantId, id);
  }

  // Ação em lote: arquivar ou excluir múltiplas conversas.
  @Post('bulk-action')
  bulkAction(@CurrentTenant() tenantId: string, @Body() dto: BulkActionDto) {
    if (dto.action === 'archive') return this.conversations.bulkArchive(tenantId, dto.ids);
    return this.conversations.bulkRemove(tenantId, dto.ids);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AddMessageDto,
  ) {
    // ADR 035: this route is the human inbox — an outbound here is a human
    // reply and activates the per-conversation takeover (Lia goes draft-only).
    // F12: internal notes never activate takeover — that's handled by the
    // isInternal guard inside addMessage(), not here.
    return this.conversations.addMessage(tenantId, id, { ...dto, byHuman: dto.direction === 'outbound' });
  }

  // ADR 035: "Devolver pra Lia" — releases the takeover; Lia resumes auto-attendance.
  @Post(':id/return-to-ai')
  returnToAi(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.conversations.returnToAi(tenantId, id);
  }
}
