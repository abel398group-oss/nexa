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

  // Base de conhecimento completa do HiperTMS — extraída dos PRDs e documentação oficial.
  // Fonte de verdade para a Lia responder leads sobre o produto.
  // Atualizar sempre que novos módulos ou mudanças de produto ocorrerem.
  async getKnowledge(): Promise<KnowledgeItem[]> {
    return [

      // ── VISÃO GERAL ────────────────────────────────────────────────────────────
      {
        topic: 'visao-geral', category: 'produto',
        title: 'O que é o HiperTMS',
        content:
          'O HiperTMS é um sistema de gestão de transporte (TMS) multi-tenant voltado para transportadoras. ' +
          'Cobre todo o fluxo operacional: cotação → embarque → viagem → fiscal → financeiro. ' +
          'Resolve problemas de planilhas, falta de rastreabilidade e formação de preço frágil. ' +
          'É uma plataforma SaaS com isolamento total por empresa (multi-tenant).',
        tags: ['tms', 'sistema', 'transportadora', 'o que e', 'visao geral'],
      },
      {
        topic: 'visao-geral', category: 'produto',
        title: 'Para quem é o HiperTMS',
        content:
          'O HiperTMS é ideal para transportadoras de todos os portes que precisam de: ' +
          '(1) emissão de CT-e e MDF-e integrada à SEFAZ; ' +
          '(2) controle de frota (veículos e motoristas); ' +
          '(3) precificação de frete com tabelas e contratos por cliente; ' +
          '(4) gestão financeira (contas a pagar/receber); ' +
          '(5) cotações e embarques rastreáveis. ' +
          'Transportadoras que ainda usam planilhas ou sistemas legados são o perfil principal.',
        tags: ['publico', 'para quem', 'transportadora', 'perfil'],
      },

      // ── GLOSSÁRIO / CONCEITOS ──────────────────────────────────────────────────
      {
        topic: 'glossario', category: 'conceitos',
        title: 'Glossário — termos do HiperTMS',
        content:
          'Tenant: empresa/cliente isolado dentro da plataforma. ' +
          'Cotação (Quote): proposta comercial antes do embarque — pode ser aprovada e convertida em embarque. ' +
          'Embarque (Shipment): operação a ser executada — o coração do TMS. ' +
          'Viagem (Trip): agrupa um ou mais embarques para execução real na estrada. ' +
          'CT-e: Conhecimento de Transporte eletrônico — documento fiscal obrigatório para transporte. ' +
          'MDF-e: Manifesto Eletrônico de Documentos Fiscais — obrigatório em viagens interestaduais. ' +
          'DACTE/DAMDFE: versões em PDF do CT-e/MDF-e. ' +
          'FCL: Carga Completa (Full Container Load). LCL: Carga Fracionada. ' +
          'Materialização: processo de pré-calcular e armazenar artefatos do motor de precificação.',
        tags: ['glossario', 'termos', 'conceitos', 'cte', 'mdf-e', 'embarque', 'cotacao', 'viagem'],
      },

      // ── MÓDULO: COTAÇÕES ───────────────────────────────────────────────────────
      {
        topic: 'cotacoes', category: 'modulo',
        title: 'Módulo Cotações — como funciona',
        content:
          'O módulo de Cotações permite criar propostas comerciais antes de abrir um embarque. ' +
          'Fluxo: criar cotação → anexar snapshot de precificação → gestor aprova/rejeita → converter em embarque. ' +
          'Cada cotação tem rota, partes, carga e um snapshot do preço calculado pelo motor. ' +
          'Cotações aprovadas geram embarques mantendo rastreabilidade completa (sourceQuoteId). ' +
          'Status possíveis: rascunho, enviada, aprovada, rejeitada, convertida.',
        tags: ['cotacao', 'proposta', 'quote', 'aprovacao', 'comercial'],
      },

      // ── MÓDULO: EMBARQUES ─────────────────────────────────────────────────────
      {
        topic: 'embarques', category: 'modulo',
        title: 'Módulo Embarques — ciclo de vida',
        content:
          'Embarque é a entidade operacional principal do HiperTMS. ' +
          'Cobre criar/editar/cancelar embarques, acompanhar eventos com timeline e importar XMLs do cliente (NF-e). ' +
          'Cada embarque tem: rota (origem/destino), modalidade (FCL/LCL), status, partes (pagador, remetente, destinatário). ' +
          'Eventos operacionais: coleta, entrega, ocorrência — tudo registrado com timestamp. ' +
          'XMLs do cliente (NF-e) podem ser importados e vinculados ao embarque para suporte fiscal.',
        tags: ['embarque', 'shipment', 'operacao', 'nfe', 'eventos', 'timeline'],
      },

      // ── MÓDULO: VIAGENS ───────────────────────────────────────────────────────
      {
        topic: 'viagens', category: 'modulo',
        title: 'Módulo Viagens — execução na estrada',
        content:
          'Uma Viagem (Trip) agrupa um ou mais embarques para execução conjunta. ' +
          'Vincula motorista, veículo e embarques. ' +
          'Permite registrar início, conclusão e cancelamento. ' +
          'Integra com Fiscal (MDF-e) e Financeiro (custo de combustível, diárias do motorista). ' +
          'Cada viagem tem timeline de eventos operacionais.',
        tags: ['viagem', 'trip', 'motorista', 'veiculo', 'rota'],
      },

      // ── MÓDULO: PRECIFICAÇÃO ──────────────────────────────────────────────────
      {
        topic: 'precificacao', category: 'modulo',
        title: 'Motor de Precificação — como calcula o frete',
        content:
          'O motor de precificação calcula o frete de forma determinística: mesmos inputs = mesmo resultado. ' +
          'Considera: tabelas FCL ou LCL por rota, taxas e serviços adicionais, markup (margens + impostos), ' +
          'contratos de cliente (preços negociados) e regime tributário. ' +
          'Fluxo: (1) importar/configurar tabelas → (2) definir markup e regime → ' +
          '(3) materializar (pré-calcular) → (4) executar cálculo via tariff-engine. ' +
          'Suporta análise crítica: explica margens e impostos sobre o total calculado.',
        tags: ['precificacao', 'frete', 'calculo', 'tabela', 'markup', 'fcl', 'lcl'],
      },
      {
        topic: 'precificacao', category: 'modulo',
        title: 'Tabelas ANTT e importação de tabelas de frete',
        content:
          'O HiperTMS usa as tabelas ANTT como referência de precificação. ' +
          'Permite importar tabelas FCL e LCL em lote via upload. ' +
          'Cada tenant configura suas próprias tabelas, com override sobre a referência. ' +
          'Tabelas podem ser por rota específica ou globais. ' +
          'Contratos de pricing permitem preços negociados por cliente com validação de rota compatível.',
        tags: ['antt', 'tabela', 'importacao', 'contrato', 'rota'],
      },

      // ── MÓDULO: FISCAL ────────────────────────────────────────────────────────
      {
        topic: 'fiscal', category: 'modulo',
        title: 'Módulo Fiscal — CT-e e MDF-e',
        content:
          'O módulo fiscal do HiperTMS emite CT-e e MDF-e com integração direta à SEFAZ. ' +
          'CT-e: documento fiscal obrigatório para transporte de cargas — emitido por embarque. ' +
          'MDF-e: manifesto obrigatório para viagens interestaduais — vinculado à viagem. ' +
          'Funcionalidades: emissão, cancelamento, carta de correção, download de XML e PDF (DACTE/DAMDFE). ' +
          'Requer certificado digital PFX configurado por empresa. ' +
          'Consulta de status na SEFAZ em tempo real.',
        tags: ['cte', 'mdfe', 'fiscal', 'sefaz', 'dacte', 'certificado', 'xml'],
      },
      {
        topic: 'fiscal', category: 'suporte',
        title: 'Certificado digital para emissão fiscal',
        content:
          'Para emitir CT-e e MDF-e, a empresa precisa de certificado digital (A1 ou A3) no formato PFX. ' +
          'No HiperTMS: acesse Configurações → Fiscal → Certificados → faça o upload do arquivo PFX e informe a senha. ' +
          'O sistema valida o certificado, detecta a UF e o ambiente (produção/homologação). ' +
          'Sem certificado válido, a emissão fiscal não funciona.',
        tags: ['certificado', 'pfx', 'a1', 'cte', 'mdfe', 'configuracao'],
      },

      // ── MÓDULO: FROTA ─────────────────────────────────────────────────────────
      {
        topic: 'frota', category: 'modulo',
        title: 'Módulo Frota — veículos, motoristas e manutenção',
        content:
          'O módulo de Frota gerencia: ' +
          'Veículos: cadastro, status, hodômetro, histórico de leituras e alocação de motorista. ' +
          'Motoristas: cadastro, CNH e validade, status ativo/inativo, alocação de veículo. ' +
          'Abastecimentos: registro com aprovação/rejeição, gera conta a pagar no financeiro. ' +
          'Manutenções: planejamento e conclusão, atualiza automaticamente a próxima revisão do veículo. ' +
          'Consulta de preços médios de combustível por tipo.',
        tags: ['frota', 'veiculo', 'motorista', 'manutencao', 'abastecimento', 'cnh'],
      },

      // ── MÓDULO: FINANCEIRO ────────────────────────────────────────────────────
      {
        topic: 'financeiro', category: 'modulo',
        title: 'Módulo Financeiro — contas e faturas',
        content:
          'O módulo financeiro do HiperTMS controla contas a pagar e a receber da operação. ' +
          'Contas são criadas via faturas (invoices) — não manualmente. ' +
          'Suporta parcelamento e vinculação a documentos de origem (embarques, abastecimentos). ' +
          'Categorias financeiras (plano de contas) com orçamento mensal/anual. ' +
          'Contas bancárias cadastradas para controle de saldo. ' +
          'Relatórios de resumo agregado (fluxo de caixa básico).',
        tags: ['financeiro', 'contas', 'pagar', 'receber', 'fatura', 'parcela'],
      },

      // ── MÓDULO: EMPRESAS ──────────────────────────────────────────────────────
      {
        topic: 'empresas', category: 'modulo',
        title: 'Módulo Empresas — clientes e fornecedores',
        content:
          'O cadastro de empresas do HiperTMS mantém clientes, fornecedores e transportadoras parceiras. ' +
          'Funcionalidades: CRUD de empresas, busca por CNPJ com enriquecimento automático (ReceitaWS), ' +
          'importação em lote, contatos por empresa (nome, cargo, telefone, e-mail), ' +
          'relacionamentos (cliente, fornecedor, transportadora), funil SDR para pipeline comercial. ' +
          'Integra com cotações e embarques como base de remetente/destinatário/pagador.',
        tags: ['empresa', 'cliente', 'fornecedor', 'cnpj', 'contato', 'cadastro'],
      },

      // ── MÓDULO: COMPRAS ───────────────────────────────────────────────────────
      {
        topic: 'compras', category: 'modulo',
        title: 'Módulo Compras — pedidos de compra',
        content:
          'O módulo de Compras (Procurement) gerencia pedidos de compra para fornecedores. ' +
          'Permite criar, aprovar e acompanhar pedidos ligados a fornecedores cadastrados. ' +
          'Integra com o financeiro (gera contas a pagar quando aprovado). ' +
          'Mantém histórico de compras por fornecedor.',
        tags: ['compras', 'procurement', 'pedido', 'fornecedor'],
      },

      // ── MÓDULO: PLANOS E BILLING ──────────────────────────────────────────────
      {
        topic: 'planos', category: 'comercial',
        title: 'Planos disponíveis — preços e limites',
        content:
          'O HiperTMS oferece três planos: ' +
          'Básico R$89/mês: 1 usuário, 500 documentos/mês — ideal para autônomos e pequenas transportadoras. ' +
          'Essencial R$299/mês: 5 usuários, 5 filiais, 1.000 documentos/mês — para transportadoras em crescimento. ' +
          'Profissional R$599/mês: 15 usuários, suporte prioritário, 5.000 documentos/mês — para operações maiores. ' +
          'Todos os planos incluem: CT-e, MDF-e, precificação, frota, financeiro e suporte por e-mail.',
        tags: ['plano', 'preco', 'valor', 'basico', 'essencial', 'profissional', 'quanto custa'],
      },
      {
        topic: 'planos', category: 'comercial',
        title: 'Trial e forma de pagamento',
        content:
          'O HiperTMS oferece período de teste (trial) gratuito sem necessidade de cartão de crédito. ' +
          'Após o trial, o pagamento é via boleto ou cartão, com ciclo mensal ou anual (desconto no anual). ' +
          'O cancelamento pode ser feito a qualquer momento sem fidelidade. ' +
          'Upgrade e downgrade de plano são imediatos.',
        tags: ['trial', 'teste', 'gratuito', 'pagamento', 'boleto', 'cartao', 'cancelamento'],
      },

      // ── ONBOARDING E IMPLANTAÇÃO ──────────────────────────────────────────────
      {
        topic: 'onboarding', category: 'suporte',
        title: 'Tempo e processo de implantação',
        content:
          'A implantação do HiperTMS leva em média 3 a 7 dias úteis. ' +
          'Inclui: configuração do tenant, cadastro de tabelas de frete, importação de clientes/fornecedores, ' +
          'configuração do certificado digital, treinamento básico da equipe e testes de emissão fiscal. ' +
          'Migração de dados de sistemas legados é opcional e tem prazo variável conforme volume. ' +
          'O suporte durante a implantação está incluso em todos os planos.',
        tags: ['implantacao', 'onboarding', 'prazo', 'configuracao', 'treinamento'],
      },
      {
        topic: 'onboarding', category: 'suporte',
        title: 'Configuração inicial — primeiros passos',
        content:
          'Primeiros passos no HiperTMS: ' +
          '(1) Cadastrar dados da empresa (CNPJ, endereço, certificado digital). ' +
          '(2) Configurar tabelas de frete (importar ou criar manualmente). ' +
          '(3) Importar clientes e fornecedores (planilha CSV ou CNPJ manual). ' +
          '(4) Cadastrar veículos e motoristas. ' +
          '(5) Testar emissão de CT-e em homologação. ' +
          '(6) Criar primeiro embarque operacional.',
        tags: ['primeiros passos', 'configuracao', 'inicio', 'cadastro'],
      },

      // ── SUPORTE E INTEGRAÇÃO ──────────────────────────────────────────────────
      {
        topic: 'suporte', category: 'suporte',
        title: 'Canais de suporte do HiperTMS',
        content:
          'O HiperTMS oferece suporte via: ' +
          'Chat (painel do sistema) e e-mail para todos os planos. ' +
          'Suporte prioritário com tempo de resposta reduzido está disponível no plano Profissional. ' +
          'Base de conhecimento e vídeos de treinamento estão disponíveis na central de ajuda. ' +
          'Suporte em horário comercial (segunda a sexta, 8h às 18h).',
        tags: ['suporte', 'atendimento', 'ajuda', 'chat', 'email'],
      },
      {
        topic: 'integracao', category: 'produto',
        title: 'Integrações do HiperTMS',
        content:
          'O HiperTMS integra nativamente com: ' +
          'SEFAZ (todas as UFs): emissão e consulta de CT-e e MDF-e. ' +
          'ReceitaWS: enriquecimento automático de CNPJ ao cadastrar empresa. ' +
          'Asaas (gateway de pagamento): cobrança de assinaturas e boletos. ' +
          'API REST: disponível para integrações customizadas com ERPs e WMS. ' +
          'Exportação contábil: extratos de contas a pagar/receber em formato padrão.',
        tags: ['integracao', 'api', 'sefaz', 'erp', 'wms', 'asaas'],
      },

      // ── AUTH E PERMISSÕES ─────────────────────────────────────────────────────
      {
        topic: 'usuarios', category: 'produto',
        title: 'Usuários, perfis e permissões',
        content:
          'O HiperTMS tem controle de acesso por perfil (roles). ' +
          'Cada empresa cria os próprios perfis e define quais módulos cada usuário pode acessar. ' +
          'Perfis padrão: Administrador (acesso total), Operação, Financeiro, Fiscal. ' +
          'Limite de usuários depende do plano contratado. ' +
          'Login via e-mail e senha com recuperação por e-mail.',
        tags: ['usuario', 'perfil', 'permissao', 'acesso', 'admin', 'login'],
      },

      // ── DIFERENCIAIS ─────────────────────────────────────────────────────────
      {
        topic: 'diferenciais', category: 'comercial',
        title: 'Por que escolher o HiperTMS',
        content:
          'Principais diferenciais do HiperTMS em relação a sistemas legados e planilhas: ' +
          '(1) Fluxo ponta-a-ponta em um só sistema: cotação, embarque, viagem, fiscal e financeiro integrados. ' +
          '(2) Motor de precificação determinístico com contratos por cliente e tabelas customizadas. ' +
          '(3) Emissão fiscal (CT-e/MDF-e) nativa com integração SEFAZ. ' +
          '(4) Multi-filial: gerencie várias filiais no mesmo sistema. ' +
          '(5) SaaS sem instalação local — atualizações automáticas. ' +
          '(6) Rastreabilidade completa de eventos e documentos.',
        tags: ['diferencial', 'vantagem', 'por que', 'beneficio', 'comparativo'],
      },
      {
        topic: 'diferenciais', category: 'comercial',
        title: 'HiperTMS vs planilhas e sistemas legados',
        content:
          'Problemas que o HiperTMS resolve que planilhas e sistemas antigos não conseguem: ' +
          'Planilhas: sem rastreabilidade de eventos, sem emissão fiscal integrada, sem controle de versão de tabelas. ' +
          'Sistemas legados: difíceis de integrar, sem API, instalação local com custo de manutenção alto. ' +
          'HiperTMS: 100% na nuvem, integração SEFAZ nativa, precificação automática, acesso de qualquer lugar.',
        tags: ['planilha', 'legado', 'comparativo', 'migracao', 'vantagem'],
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
