import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { BillingService } from '@/application/billing/billing.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('billing/payment-request')
  create(
    @CurrentTenant() tenantId: string,
    @Body()
    dto: {
      productCode: string;
      planCode: string;
      correlationId: string;
      conversationId?: string;
      contactId?: string;
      externalTenantId?: string;
      idempotencyKey: string;
    },
  ) {
    return this.billing.createPaymentRequest(tenantId ?? 'default', dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('billing/:id')
  status(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.billing.getStatus(tenantId ?? 'default', id);
  }

  // Webhook do Asaas/TMS — SEM JwtAuthGuard (vem de fora); valida ASSINATURA.
  @Post('webhooks/asaas')
  webhook(@Body() body: any, @Headers('asaas-access-token') signature: string) {
    return this.billing.handleWebhook(body, signature);
  }
}
