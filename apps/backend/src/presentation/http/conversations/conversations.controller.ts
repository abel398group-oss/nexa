import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '@/shared/dto/pagination.dto';

// se for vendedor, restringe à carteira dele (assignedSellerId); admin/gestor veem tudo
function sellerScope(user: any): string | undefined {
  return user?.role === 'vendedor' ? user.sellerId ?? '__none__' : undefined;
}

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Query() q: PaginationQueryDto) {
    return this.conversations.findAll(tenantId ?? 'default', q, sellerScope(user));
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.conversations.findOne(tenantId ?? 'default', id);
  }

  @Get(':id/messages')
  messages(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.conversations.getMessages(tenantId ?? 'default', id);
  }

  @Get(':id/timeline')
  timeline(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.conversations.getTimeline(tenantId ?? 'default', id);
  }

  @Post()
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: { contactId: string; phone: string; productCode?: string; sourceChannel?: string },
  ) {
    return this.conversations.create(tenantId ?? 'default', dto);
  }

  @Patch(':id/outcome')
  setOutcome(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: { outcome: 'won' | 'lost' | null },
  ) {
    return this.conversations.setOutcome(tenantId ?? 'default', id, dto.outcome);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: { direction: 'inbound' | 'outbound'; content: string; intent?: string },
  ) {
    return this.conversations.addMessage(tenantId ?? 'default', id, dto);
  }
}
