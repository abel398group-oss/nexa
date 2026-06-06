// Interface Connector (ADR 010). Cada produto conectado implementa isto.
// A plataforma fala com a interface, NUNCA com o produto direto.

export interface Plan {
  code: string;
  name: string;
  price: number;
  maxUsers?: number;
  features?: string[];
}

export interface PaymentRequestResult {
  externalPaymentId: string;
  paymentLink: string;
  status: string;
}

export interface Connector {
  readonly productCode: string;

  // disponibilidade do produto/conector (ADR 010 + fallback)
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;

  // catálogo de planos (fonte de verdade = produto)
  getPlans(): Promise<Plan[]>;

  // inicia cobrança (a IA solicita; backend chama isto)
  createPaymentRequest(input: {
    planCode: string;
    externalTenantId?: string;
    correlationId: string;
  }): Promise<PaymentRequestResult>;

  // status de pagamento (reconciliação)
  getPaymentStatus(externalPaymentId: string): Promise<{ status: string }>;

  // libera acesso após pagamento confirmado
  provisionAccess(input: { externalTenantId: string; planCode: string }): Promise<{ ok: boolean }>;

  // suspende acesso (inadimplência/cancelamento)
  suspendAccess(input: { externalTenantId: string }): Promise<{ ok: boolean }>;
}
