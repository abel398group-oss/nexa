import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsString } from 'class-validator';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '@/shared/dto/pagination.dto';

class BulkActionDto {
  @IsIn(['archive', 'delete']) action!: 'archive' | 'delete';
  @IsArray() @IsString({ each: true }) ids!: string[];
}

// se for vendedor, restringe à carteira dele (assignedSellerId); admin/gestor veem tudo
function sellerScope(user: any): string | undefined {
  return user?.role === 'vendedor' ? user.sellerId ?? '__none__' : undefined;
}

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  private readonly logger = new Logger('ConversationsController');

  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  async findAll(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Query() q: PaginationQueryDto) {
    const result = await this.conversations.findAll(tenantId, q, sellerScope(user));
    this.logger.log(`[list] tenantId=${tenantId} role=${user?.role} total=${result.total} items=${result.items.length}`);
    return result;
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.conversations.findOne(tenantId, id);
  }

  @Get(':id/messages')
  messages(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.conversations.getMessages(tenantId, id);
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
    @Body() dto: { outcome: 'won' | 'lost' | null },
  ) {
    return this.conversations.setOutcome(tenantId, id, dto.outcome);
  }

  @Patch(':id/assign')
  assign(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: { sellerId: string | null },
  ) {
    return this.conversations.assign(tenantId, id, dto.sellerId ?? null);
  }

  // Suporte: resolver (fecha com outcome=resolved) ou reabrir o chamado.
  // Frontend chama PATCH /conversations/:id/resolve com { resolved: boolean }.
  @Patch(':id/resolve')
  resolve(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: { resolved: boolean },
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
    @Body() dto: { direction: 'inbound' | 'outbound'; content: string; intent?: string; metadata?: Record<string, unknown> },
  ) {
    return this.conversations.addMessage(tenantId, id, dto);
  }
}
