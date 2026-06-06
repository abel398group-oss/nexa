import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '@/shared/dto/pagination.dto';

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string, @Query() q: PaginationQueryDto) {
    return this.conversations.findAll(tenantId ?? 'default', q);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.conversations.findOne(tenantId ?? 'default', id);
  }

  @Get(':id/messages')
  messages(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.conversations.getMessages(tenantId ?? 'default', id);
  }

  @Post()
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: { contactId: string; phone: string; productCode?: string; sourceChannel?: string },
  ) {
    return this.conversations.create(tenantId ?? 'default', dto);
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
