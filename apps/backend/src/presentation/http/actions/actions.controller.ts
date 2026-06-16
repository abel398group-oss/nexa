import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ActionsService } from '@/application/actions/actions.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('actions')
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Post()
  request(
    @CurrentTenant() tenantId: string,
    @Body()
    dto: {
      actionType: 'create_payment' | 'consult_plan' | 'update_context' | 'escalate';
      correlationId: string;
      conversationId: string;
      idempotencyKey: string;
      payload?: Record<string, unknown>;
    },
  ) {
    return this.actions.request(tenantId, dto);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.actions.findOne(tenantId, id);
  }
}
