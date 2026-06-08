import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Connector, Plan, PaymentRequestResult, KnowledgeItem, TmsCustomer } from './connector.interface';

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

  async getKnowledge(): Promise<KnowledgeItem[]> {
    // TODO(real): GET ${TMS_API_BASE_URL}/knowledge (FAQ/políticas do TMS)
    // STUB: conhecimento conhecido do HiperTMS p/ a Lia responder leads.
    return [
      {
        topic: 'cte', category: 'produto', title: 'O que é o CT-e no HiperTMS',
        content: 'O HiperTMS emite o Conhecimento de Transporte eletrônico (CT-e) integrado à SEFAZ, com validação automática, cálculo de impostos (ICMS) e geração do DACTE em PDF.',
        tags: ['cte', 'fiscal', 'sefaz'],
      },
      {
        topic: 'precificacao', category: 'produto', title: 'Precificação de fretes',
        content: 'A precificação considera origem/destino, peso, cubagem, tabela do cliente e pedágio. Permite tabelas por rota e por cliente, com markup configurável.',
        tags: ['frete', 'precificacao', 'tabela'],
      },
      {
        topic: 'planos', category: 'comercial', title: 'Planos e limites',
        content: 'Básico R$89 (1 usuário, 500 docs/mês). Essencial R$299 (5 usuários, 5 filiais, 1.000 docs/mês). Profissional R$599 (15 usuários, suporte prioritário, 5.000 docs/mês).',
        tags: ['planos', 'preco', 'limites'],
      },
      {
        topic: 'onboarding', category: 'suporte', title: 'Tempo de implantação',
        content: 'A implantação leva em média de 3 a 7 dias úteis, incluindo cadastro de clientes, tabelas de frete e treinamento básico da equipe. Migração de dados é opcional.',
        tags: ['implantacao', 'onboarding', 'prazo'],
      },
      {
        topic: 'integracao', category: 'produto', title: 'Integrações disponíveis',
        content: 'O HiperTMS integra com SEFAZ (CT-e/MDF-e), emissão de boletos, e exportação contábil. API REST disponível para integrações sob demanda.',
        tags: ['integracao', 'api', 'mdfe'],
      },
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

  // Verifica se o telefone já tem cadastro no HiperTMS.
  // Quando TMS_API_BASE_URL estiver configurado: chama a API real.
  // Enquanto não estiver: retorna null (lead ainda não é cliente).
  async lookupCustomer(phone: string): Promise<TmsCustomer | null> {
    if (!this.configured) {
      return null; // TMS não configurado — lead ainda é prospect
    }
    try {
      // Usa o tenantId padrão se não configurado (ambiente dev/local)
      const tenantId = process.env.TMS_TENANT_ID ?? 'default';
      const url =
        `${process.env.TMS_API_BASE_URL}/api/companies/by-phone` +
        `?phone=${encodeURIComponent(phone)}&tenantId=${encodeURIComponent(tenantId)}`;

      const res = await fetch(url, {
        headers: { 'x-internal-token': process.env.TMS_SERVICE_TOKEN! },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`TMS retornou ${res.status}`);

      const data = await res.json() as { found: boolean; company: any };
      if (!data.found || !data.company) return null;

      const c = data.company;
      return {
        externalId:   String(c.externalId),
        name:         c.name ?? '',
        email:        c.email ?? undefined,
        plan:         c.plan ?? undefined,
        status:       c.status === 'ACTIVE' ? 'active' : c.status === 'INACTIVE' ? 'inactive' : 'active',
        registeredAt: c.createdAt ?? undefined,
      };
    } catch (err: any) {
      this.logger.warn(`lookupCustomer(${phone}) falhou: ${err?.message}`);
      return null;
    }
  }
}
