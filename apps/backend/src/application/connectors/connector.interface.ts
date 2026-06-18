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

// Item de conhecimento exportado pelo produto (FAQ, política, how-to) → alimenta a Lia.
export interface KnowledgeItem {
  topic: string;
  category: string;
  title: string;
  content: string;
  tags?: string[];
}

// Cliente já cadastrado no produto (TMS, ERP, etc.)
export interface TmsCustomer {
  externalId: string;        // ID no sistema externo
  name: string;
  email?: string;
  plan?: string;             // plano contratado (ex: "Essencial")
  status: 'active' | 'inactive' | 'trial' | 'suspended';
  registeredAt?: string;     // ISO date
}

// Status de documento fiscal (CT-e, MDF-e) — leitura via Connector (ADR 015 D3)
export interface DocumentStatus {
  documentId: string;
  type: 'cte' | 'mdfe';
  status: 'authorized' | 'cancelled' | 'rejected' | 'pending' | 'unknown';
  issuedAt?: string;
  rejectionCode?: string;
  rejectionMessage?: string;
}

// Código/motivo de rejeição SEFAZ — diagnóstico de CT-e/MDF-e
export interface RejectionInfo {
  code: string;
  message: string;
  category: 'cadastro' | 'fiscal' | 'operacional' | 'sistema' | 'unknown';
  suggestedAction?: string;
}

// Status de contrato/acesso do cliente no TMS
export interface ContractStatus {
  externalId: string;
  plan: string;
  status: 'active' | 'suspended' | 'trial' | 'cancelled';
  expiresAt?: string;
  documentsUsed?: number;
  documentsLimit?: number;
}

export interface Connector {
  readonly productCode: string;

  // disponibilidade do produto/conector (ADR 010 + fallback)
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;

  // catálogo de planos (fonte de verdade = produto)
  getPlans(): Promise<Plan[]>;

  // base de conhecimento do produto (FAQ/políticas) p/ importar e alimentar a IA
  getKnowledge(): Promise<KnowledgeItem[]>;

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

  // verifica se o telefone já tem cadastro no produto
  // Retorna null se não encontrado ou conector não configurado.
  lookupCustomer(phone: string): Promise<TmsCustomer | null>;

  // ── Diagnóstico de suporte (ADR 015 D3) — leitura read-only ──────────────

  // Status de um documento fiscal (CT-e ou MDF-e) pelo tenantId + chave de acesso (44 dígitos) ou número
  getDocumentStatus(tenantId: string, type: 'cte' | 'mdfe', key: string): Promise<DocumentStatus | null>;

  // Detalhes de uma rejeição SEFAZ pelo código
  getRejectionInfo(code: string): Promise<RejectionInfo | null>;

  // Status do contrato/plano do cliente pelo externalId
  getContractStatus(externalId: string): Promise<ContractStatus | null>;
}
