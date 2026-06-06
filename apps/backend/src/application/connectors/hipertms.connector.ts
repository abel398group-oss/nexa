import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Connector, Plan, PaymentRequestResult } from './connector.interface';

// HiperTmsConnector — 1º conector (ADR 008/010).
// STUB: a integração REAL com a API do TMS entra quando o Uelder validar.
// Por enquanto: healthCheck reporta se TMS está configurado; getPlans devolve mock.
@Injectable()
export class HiperTmsConnector implements Connector {
  readonly productCode = 'hipertms';
  private readonly logger = new Logger('HiperTmsConnector');

  private get configured(): boolean {
    return !!process.env.TMS_API_BASE_URL && !!process.env.TMS_SERVICE_TOKEN;
  }

  async healthCheck() {
    if (!this.configured) {
      return { ok: false, detail: 'TMS_API_BASE_URL/TOKEN não configurados (aguardando Uelder)' };
    }
    // TODO(real): GET ${TMS_API_BASE_URL}/health com TMS_SERVICE_TOKEN
    return { ok: true, detail: 'configurado' };
  }

  async getPlans(): Promise<Plan[]> {
    // TODO(real): GET ${TMS_API_BASE_URL}/plans
    // Mock baseado no catálogo conhecido do HiperTMS:
    return [
      { code: 'basico', name: 'Básico', price: 89, maxUsers: 1, features: ['CT-e', 'precificação', '500 docs/mês'] },
      { code: 'essencial', name: 'Essencial', price: 299, maxUsers: 5, features: ['tudo do Básico', '5 filiais', '1.000 docs/mês'] },
      { code: 'profissional', name: 'Profissional', price: 599, maxUsers: 15, features: ['tudo do Essencial', 'suporte prioritário', '5.000 docs/mês'] },
    ];
  }

  async createPaymentRequest(input: {
    planCode: string;
    externalTenantId?: string;
    correlationId: string;
  }): Promise<PaymentRequestResult> {
    if (!this.configured) {
      // fallback: conector indisponível → não cria cobrança (ADR 010 9.x)
      throw new ServiceUnavailableException('Conector TMS indisponível — cobrança não criada');
    }
    // TODO(real): POST ${TMS_API_BASE_URL}/subscriptions (cria cobrança Asaas)
    this.logger.warn('createPaymentRequest STUB — integração real pendente (Uelder)');
    return {
      externalPaymentId: 'stub-payment-id',
      paymentLink: 'https://stub.tms/pay/xxx',
      status: 'pending',
    };
  }

  async getPaymentStatus(_externalPaymentId: string) {
    // TODO(real): GET status no TMS
    return { status: 'pending' };
  }

  async provisionAccess(_input: { externalTenantId: string; planCode: string }) {
    // TODO(real): chama TMS p/ liberar tenant
    return { ok: true };
  }

  async suspendAccess(_input: { externalTenantId: string }) {
    // TODO(real): chama TMS p/ suspender
    return { ok: true };
  }
}
