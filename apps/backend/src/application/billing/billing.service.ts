import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EventsService } from '@/application/events/events.service';
import { ConnectorsService } from '@/application/connectors/connectors.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger('BillingService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly connectors: ConnectorsService,
  ) {}

  // IA solicita cobrança → backend cria via Connector (ADR 008). Máquina de estados.
  async createPaymentRequest(
    tenantId: string,
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
    // idempotência
    const existing = await this.prisma.aiBillingRequest.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) return existing;

    // valida preço com o catálogo do produto (9.15 — preço == catálogo)
    const plans = await this.connectors.getPlans(dto.productCode);
    const plan = plans.find((p) => p.code === dto.planCode);
    if (!plan) throw new NotFoundException(`Plano ${dto.planCode} não existe no produto`);

    let br = await this.prisma.aiBillingRequest.create({
      data: {
        tenantId,
        correlationId: dto.correlationId,
        conversationId: dto.conversationId,
        contactId: dto.contactId,
        productCode: dto.productCode,
        externalTenantId: dto.externalTenantId,
        planCode: dto.planCode,
        requestedAmount: plan.price,
        idempotencyKey: dto.idempotencyKey,
        status: 'processing',
      },
    });

    try {
      const conn = this.connectors.get(dto.productCode);
      const result = await conn.createPaymentRequest({
        planCode: dto.planCode,
        externalTenantId: dto.externalTenantId,
        correlationId: dto.correlationId,
      });
      br = await this.prisma.aiBillingRequest.update({
        where: { id: br.id },
        data: {
          status: 'link_sent',
          paymentLink: result.paymentLink,
          externalPaymentId: result.externalPaymentId,
        },
      });
      await this.events.publish({
        eventType: 'payment_link_created',
        payload: { billingRequestId: br.id, planCode: dto.planCode },
        tenantId,
        correlationId: dto.correlationId,
        producer: 'billing',
        priority: 'alta',
        idempotencyKey: `evt-link-${br.id}`,
      });
    } catch (err: any) {
      // conector indisponível → fallback (não promete liberação)
      br = await this.prisma.aiBillingRequest.update({
        where: { id: br.id },
        data: { status: 'failed' },
      });
      this.logger.warn(`Cobrança falhou (${dto.productCode}): ${err.message}`);
    }
    return br;
  }

  // Webhook do produto/Asaas → confirma pagamento (ADR 008 9.26). Valida assinatura.
  async handleWebhook(rawBody: any, signature?: string) {
    const eventId = rawBody?.id ?? uuidv4();
    const externalPaymentId = rawBody?.payment?.id ?? rawBody?.paymentId;
    const event = rawBody?.event ?? 'unknown';

    // idempotência do webhook (não processar 2x)
    const dup = await this.prisma.billingEvent.findUnique({
      where: { idempotencyKey: eventId },
    });
    if (dup) return { ok: true, duplicated: true };

    // validação de assinatura (9.26) — stub: confere token simples por enquanto
    const signatureValid = this.validateSignature(signature);

    const br = externalPaymentId
      ? await this.prisma.aiBillingRequest.findFirst({ where: { externalPaymentId } })
      : null;

    await this.prisma.billingEvent.create({
      data: {
        billingRequestId: br?.id ?? '00000000-0000-0000-0000-000000000000',
        tenantId: br?.tenantId,
        correlationId: br?.correlationId,
        asaasPaymentId: externalPaymentId,
        eventType: event,
        rawPayload: rawBody ?? {},
        signatureValid,
        processed: false,
        idempotencyKey: eventId,
      },
    }).catch(() => undefined);

    if (!signatureValid) {
      this.logger.error('Webhook REJEITADO: assinatura inválida');
      return { ok: false, reason: 'invalid_signature' };
    }
    if (!br) return { ok: false, reason: 'billing_request_not_found' };

    // só confirma se o evento for de pagamento confirmado
    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      await this.prisma.aiBillingRequest.update({
        where: { id: br.id },
        data: { status: 'confirmed', confirmedAt: new Date() },
      });
      // libera acesso via conector + dispara eventos
      const conn = this.connectors.get(br.productCode ?? 'hipertms');
      await conn.provisionAccess({
        externalTenantId: br.externalTenantId ?? '',
        planCode: br.planCode ?? '',
      });
      await this.events.publish({
        eventType: 'payment_confirmed',
        payload: { billingRequestId: br.id },
        tenantId: br.tenantId ?? 'default',
        correlationId: br.correlationId,
        producer: 'billing',
        priority: 'alta',
        idempotencyKey: `evt-conf-${br.id}`,
      });
      await this.events.publish({
        eventType: 'tenant_created',
        payload: { billingRequestId: br.id, externalTenantId: br.externalTenantId },
        tenantId: br.tenantId ?? 'default',
        correlationId: br.correlationId,
        producer: 'billing',
        priority: 'alta',
        idempotencyKey: `evt-tenant-${br.id}`,
      });
    }
    return { ok: true };
  }

  private validateSignature(signature?: string): boolean {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!expected) return false; // sem token configurado → rejeita (seguro por padrão)
    return signature === expected;
  }

  async getStatus(tenantId: string, id: string) {
    const br = await this.prisma.aiBillingRequest.findFirst({ where: { id, tenantId } });
    if (!br) throw new NotFoundException('Cobrança não encontrada');
    return br;
  }

  // Reconciliação (não depender só do webhook) — checa pendentes no produto
  @Interval(60000)
  async reconcile() {
    const pendentes = await this.prisma.aiBillingRequest.findMany({
      where: { status: { in: ['link_sent', 'pending_payment'] } },
      take: 50,
    });
    for (const br of pendentes) {
      if (!br.externalPaymentId || !br.productCode) continue;
      try {
        const conn = this.connectors.get(br.productCode);
        const { status } = await conn.getPaymentStatus(br.externalPaymentId);
        const divergence = status === 'paid' && br.status !== 'confirmed';
        await this.prisma.paymentStatusSync.create({
          data: {
            billingRequestId: br.id,
            asaasPaymentId: br.externalPaymentId,
            expectedStatus: br.status,
            actualStatus: status,
            divergence,
          },
        });
      } catch {
        // conector indisponível na reconciliação → ignora nesta rodada
      }
    }
  }
}
