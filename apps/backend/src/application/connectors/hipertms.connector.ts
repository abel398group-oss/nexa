import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Connector, Plan, PaymentRequestResult, KnowledgeItem, TmsCustomer, DocumentStatus, RejectionInfo, ContractStatus } from './connector.interface';
import { MANUAIS_KB } from './hipertms-manuais.data';

// HiperTmsConnector — 1º conector (ADR 008/010).
// STUB: a integração REAL com a API do TMS entra quando o Uelder validar.
// Por enquanto: healthCheck reporta se TMS está configurado; getPlans devolve mock.
@Injectable()
export class HiperTmsConnector implements Connector {
  readonly productCode = 'hipertms';
  private readonly logger = new Logger('HiperTmsConnector');

  private get configured(): boolean {
    return !!process.env.TMS_API_BASE_URL && !!(process.env.TMS_INTERNAL_TOKEN ?? process.env.TMS_SERVICE_TOKEN);
  }

  // Token enviado no header x-internal-token para a API interna do TMS (/nexa/*).
  // Deve ser IGUAL ao NEXA_INTERNAL_TOKEN configurado no TMS.
  private get internalToken(): string {
    return process.env.TMS_INTERNAL_TOKEN ?? process.env.TMS_SERVICE_TOKEN ?? '';
  }

  async healthCheck() {
    if (!this.configured) {
      return { ok: false, detail: 'TMS_API_BASE_URL/TOKEN não configurados (aguardando Uelder)' };
    }
    try {
      const res = await fetch(`${process.env.TMS_API_BASE_URL}/api/health`, {
        headers: { 'x-internal-token': process.env.TMS_SERVICE_TOKEN! },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, detail: `TMS retornou ${res.status}` };
      return { ok: true, detail: 'conectado' };
    } catch (err: any) {
      return { ok: false, detail: `TMS inacessível: ${err?.message}` };
    }
  }

  // Catálogo de planos da Lia (fonte dos "fatos permitidos" da Supervisora).
  // Quando TMS_API_BASE_URL estiver configurado: busca os planos AO VIVO no HiperTMS.
  // Enquanto não estiver (ou se a chamada falhar): usa o catálogo conhecido (fallback).
  async getPlans(): Promise<Plan[]> {
    if (!this.configured) {
      return this.defaultPlans(); // TMS não configurado — usa catálogo conhecido
    }
    try {
      // /nexa/plans retorna shape compatível com o Connector: { plans: [{code, name, price, maxUsers, features}] }
      // /api/plans retorna a shape interna do ORM (id/slug/tier) — não usar aqui.
      const url = `${process.env.TMS_API_BASE_URL}/nexa/plans`;

      const res = await fetch(url, {
        headers: { 'x-internal-token': process.env.TMS_SERVICE_TOKEN! },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`TMS retornou ${res.status}`);

      // Aceita tanto { plans: [...] } quanto [...] direto.
      const data = await res.json() as { plans?: any[] } | any[];
      const rows = Array.isArray(data) ? data : data?.plans;
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('resposta do TMS sem planos');
      }

      const plans: Plan[] = rows.map((p) => ({
        code: String(p.code ?? p.id ?? '').trim(),
        name: String(p.name ?? p.title ?? p.code ?? '').trim(),
        price: Number(p.price ?? p.priceMonthly ?? p.monthlyPrice ?? 0),
        maxUsers: p.maxUsers ?? p.userLimit ?? undefined,
        features: Array.isArray(p.features) ? p.features.map((f: any) => String(f)) : [],
      })).filter((p) => p.code && Number.isFinite(p.price) && p.price > 0);

      if (plans.length === 0) throw new Error('planos do TMS inválidos (sem code/preço)');
      return plans;
    } catch (err: any) {
      // Nunca quebra a venda: cai no catálogo conhecido e registra o aviso.
      this.logger.warn(`getPlans falhou (${err?.message}) — usando catálogo de fallback`);
      return this.defaultPlans();
    }
  }

  // Catálogo conhecido do HiperTMS — fallback e fonte enquanto a API do TMS não expõe /api/plans.
  // Manter sincronizado com o site/TMS até a integração real estar ligada.
  private defaultPlans(): Plan[] {
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

      // ══════════════════════════════════════════════════════════════════════════
      // TROUBLESHOOTING / SUPORTE OPERACIONAL — "como faço" e "deu erro X"
      // Extraído dos PRDs do HiperTMS (docs/features/**). Conteúdo para a Lia
      // resolver dúvidas de CLIENTES ATIVOS (não vendas). Validar rótulos exatos
      // de menu com o time do TMS.
      // ══════════════════════════════════════════════════════════════════════════

      // ── FISCAL / CT-e ───────────────────────────────────────────────────────────
      {
        topic: 'cte', category: 'suporte',
        title: 'Como emitir um CT-e (passo a passo)',
        content:
          'O CT-e é emitido a partir de um embarque. Passo a passo: ' +
          '(1) tenha um certificado digital ativo (Dados da Empresa > Certificado Digital); ' +
          '(2) abra o embarque desejado e acione a emissão de CT-e (informe série e ambiente se solicitado); ' +
          '(3) o sistema assina o XML e transmite à SEFAZ, gravando chave, protocolo e status; ' +
          '(4) acompanhe na lista de CT-e (filtros por status, embarque e data); ' +
          '(5) baixe o XML ou o PDF (DACTE) quando autorizado. ' +
          'Se não houver certificado ativo, a emissão não funciona e o sistema orienta a cadastrá-lo.',
        tags: ['cte', 'emitir', 'emissao', 'como faco', 'dacte', 'sefaz', 'embarque', 'fiscal'],
      },
      {
        topic: 'cte', category: 'suporte',
        title: 'CT-e foi rejeitado pela SEFAZ — o que fazer',
        content:
          'Quando a SEFAZ rejeita o CT-e, o sistema mostra o código e a mensagem da rejeição (em metadata.emissionLog). ' +
          'Rejeições comuns: ' +
          '562 — CT-e já cancelado (emita um novo CT-e); ' +
          '539 — CFOP inválido para a UF (verifique o CFOP no cadastro da operação); ' +
          '204 — duplicidade (confira se o CT-e já foi emitido com o mesmo número); ' +
          '581 — certificado digital inválido/expirado (renove o certificado em Dados da Empresa > Certificado Digital); ' +
          '999 — erro genérico (acione o suporte com o XML do CT-e). ' +
          'Em dúvida fiscal específica, não improvise: encaminhe ao suporte humano.',
        tags: ['cte', 'rejeicao', 'rejeitado', 'sefaz', 'erro', '562', '539', '204', '581', 'cfop', 'fiscal'],
      },
      {
        topic: 'cte', category: 'suporte',
        title: 'Cancelar CT-e ou enviar carta de correção',
        content:
          'CT-e autorizado pode ser cancelado ou corrigido por carta de correção (CC-e), dentro dos prazos da SEFAZ. ' +
          'Cancelamento: abra o CT-e e use a opção de cancelar, informando a justificativa (mínimo de caracteres exigido pela SEFAZ). ' +
          'Carta de correção: use quando o erro é de informação corrigível (não serve para valor, datas ou partes). ' +
          'Se o status local estiver divergente da SEFAZ, use "sincronizar consulta" para atualizar antes de agir.',
        tags: ['cte', 'cancelar', 'cancelamento', 'carta de correcao', 'cce', 'sincronizar', 'fiscal'],
      },

      // ── FISCAL / MDF-e ──────────────────────────────────────────────────────────
      {
        topic: 'mdfe', category: 'suporte',
        title: 'Como emitir e encerrar um MDF-e',
        content:
          'O MDF-e é emitido a partir de uma viagem e é obrigatório no transporte interestadual. ' +
          'Emissão: abra a viagem, acione o MDF-e e informe os dados exigidos (chaves dos CT-e, percurso/UF, RNTRC). ' +
          'Após a viagem terminar, é OBRIGATÓRIO encerrar o MDF-e — MDF-e não encerrado fica pendente e pode gerar problema fiscal. ' +
          'Encerramento: abra o MDF-e e use a opção de encerrar (informe UF e município de encerramento se solicitado). ' +
          'Há uma lista de "MDF-e não encerrados" para você acompanhar pendências.',
        tags: ['mdfe', 'emitir', 'encerrar', 'encerramento', 'viagem', 'nao encerrado', 'rntrc', 'fiscal'],
      },

      // ── FISCAL / CERTIFICADO ────────────────────────────────────────────────────
      {
        topic: 'fiscal', category: 'suporte',
        title: 'Certificado digital vencido ou inválido (não emite CT-e/MDF-e)',
        content:
          'Se a emissão parou com erro de certificado (ex.: rejeição 581), o certificado provavelmente venceu ou a senha está incorreta. ' +
          'Solução: acesse Dados da Empresa > Certificado Digital, faça o upload de um novo PFX (A1) válido e informe a senha correta. ' +
          'Defina a UF e o ambiente (PRODUCAO ou HOMOLOGACAO) e marque o certificado como ativo. ' +
          'O sistema valida e detecta a UF/ambiente automaticamente. Sem certificado ativo válido, nenhuma emissão fiscal funciona.',
        tags: ['certificado', 'pfx', 'vencido', 'invalido', 'a1', '581', 'fiscal', 'configuracao'],
      },
      {
        topic: 'fiscal', category: 'suporte',
        title: 'Testar conexão com a SEFAZ / status fiscal',
        content:
          'Se a emissão está lenta ou falhando, vale checar a conexão com a SEFAZ. ' +
          'O módulo fiscal tem um teste de conectividade (status fiscal) que usa o certificado ativo e a UF. ' +
          'Se a SEFAZ estiver fora do ar (problema do órgão, não do sistema), aguarde e tente novamente; o HiperTMS apenas transmite. ' +
          'Persistindo, acione o suporte informando a UF, o ambiente e o horário da tentativa.',
        tags: ['sefaz', 'status', 'conexao', 'fora do ar', 'teste', 'fiscal', 'lentidao'],
      },

      // ── PRECIFICAÇÃO / FRETE ────────────────────────────────────────────────────
      {
        topic: 'precificacao', category: 'suporte',
        title: 'Preço do frete saiu errado ou desatualizado',
        content:
          'O motor de precificação é determinístico (mesmos dados = mesmo preço). Se o valor parece errado, normalmente é uma destas causas: ' +
          '(1) os artefatos de precificação estão desatualizados ("stale") após mudança de tabela/markup — rode "recalcular" na materialização; ' +
          '(2) há um contrato de cliente com preço negociado aplicando por cima da tabela; ' +
          '(3) a rota/modalidade (FCL ou LCL) ou o regime tributário estão diferentes do esperado. ' +
          'Use a análise crítica para ver o breakdown (frete, taxas, margens e impostos) e entender de onde veio o valor.',
        tags: ['precificacao', 'frete', 'preco errado', 'desatualizado', 'materializacao', 'recalcular', 'stale', 'contrato', 'analise critica'],
      },
      {
        topic: 'precificacao', category: 'suporte',
        title: 'Como importar tabelas de frete (FCL/LCL)',
        content:
          'As tabelas de frete podem ser importadas em lote no módulo de Precificação (importação FCL ou LCL). ' +
          'Envie o arquivo no formato esperado; o sistema retorna quantos itens foram criados e quantos ignorados. ' +
          'Se a importação falhar com erro de validação, o arquivo está fora do layout — confira colunas e formato. ' +
          'Após importar, rode a materialização (recalcular) para os novos preços passarem a valer nas cotações.',
        tags: ['tabela', 'importar', 'importacao', 'fcl', 'lcl', 'frete', 'precificacao', 'antt'],
      },
      {
        topic: 'precificacao', category: 'suporte',
        title: 'Contrato do cliente não aplica o preço negociado',
        content:
          'Se o preço de contrato não está sendo aplicado, geralmente a rota da operação não é compatível com a rota do contrato. ' +
          'Use a verificação de rota (check-route) do contrato para confirmar a compatibilidade. ' +
          'Confira também se o contrato está ATIVO (não suspenso/cancelado) e se as regras do contrato cobrem a modalidade e o trecho usados. ' +
          'Contrato ativo + rota compatível = preço negociado aplicado.',
        tags: ['contrato', 'preco negociado', 'cliente', 'rota', 'check-route', 'precificacao', 'frete'],
      },

      // ── FINANCEIRO ──────────────────────────────────────────────────────────────
      {
        topic: 'financeiro', category: 'suporte',
        title: 'Não consigo criar conta a pagar/receber diretamente',
        content:
          'No HiperTMS as contas NÃO são criadas manualmente — elas são geradas a partir de uma FATURA (invoice). ' +
          'A criação direta de conta é desativada de propósito (retorna erro orientando o uso de faturas). ' +
          'Para gerar uma conta a pagar: crie uma fatura a pagar. Para receber: crie uma fatura a receber. ' +
          'O sistema valida o total e as parcelas e gera as contas vinculadas ao documento de origem. ' +
          'Abastecimentos e diárias de motorista também viram conta a pagar automaticamente (via Frota, após aprovação).',
        tags: ['financeiro', 'conta a pagar', 'conta a receber', 'fatura', 'invoice', 'nao consigo criar', 'parcela'],
      },
      {
        topic: 'financeiro', category: 'suporte',
        title: 'Acompanhar contas vencidas e vencimentos',
        content:
          'No módulo Financeiro você lista contas a pagar e a receber com filtros (status, somente vencidas, busca). ' +
          'Use o filtro "somente vencidas" (overdue) para ver o que está em atraso. ' +
          'Há um resumo agregado por tipo e status para uma visão rápida. ' +
          'As categorias (plano de contas) permitem acompanhar orçamento mensal/anual e a execução por categoria.',
        tags: ['financeiro', 'vencidas', 'overdue', 'vencimento', 'contas', 'resumo', 'orcamento', 'categoria'],
      },

      // ── FROTA / CADASTRO ────────────────────────────────────────────────────────
      {
        topic: 'frota', category: 'suporte',
        title: 'Erro ao cadastrar veículo (consumo km/L)',
        content:
          'Ao cadastrar um veículo, o consumo médio (km/L) é obrigatório e deve ser maior que zero. ' +
          'Se o cadastro for bloqueado, verifique o campo de consumo — valor zerado ou negativo não é aceito. ' +
          'Esse dado é necessário porque as Viagens usam o consumo médio para calcular o custo de combustível. ' +
          'Também não é permitido duplicar placa por empresa.',
        tags: ['veiculo', 'cadastro', 'consumo', 'km/l', 'erro', 'frota', 'placa'],
      },
      {
        topic: 'frota', category: 'suporte',
        title: 'Abastecimento não virou conta a pagar',
        content:
          'Um abastecimento só gera conta a pagar DEPOIS de aprovado. ' +
          'Fluxo: o abastecimento entra como "pendente de aprovação"; um responsável aprova (ou rejeita); ' +
          'só então é possível convertê-lo em conta a pagar no Financeiro. ' +
          'A conversão é idempotente — não gera conta duplicada. Se não apareceu no Financeiro, confirme se o abastecimento foi aprovado e convertido.',
        tags: ['abastecimento', 'conta a pagar', 'aprovacao', 'pendente', 'frota', 'financeiro', 'combustivel'],
      },
      {
        topic: 'frota', category: 'suporte',
        title: 'Alerta de CNH de motorista vencendo',
        content:
          'O módulo de Frota controla a validade da CNH dos motoristas. ' +
          'Há uma consulta de "carteiras vencendo" que lista os motoristas por proximidade do vencimento. ' +
          'Use-a para renovar a CNH antes do vencimento e evitar motorista impedido de rodar. ' +
          'O cadastro do motorista guarda número e validade da CNH e o status ativo/inativo.',
        tags: ['cnh', 'motorista', 'vencendo', 'validade', 'frota', 'alerta'],
      },

      // ── USUÁRIOS / ACESSO ───────────────────────────────────────────────────────
      {
        topic: 'usuarios', category: 'suporte',
        title: 'Esqueci a senha / redefinir acesso',
        content:
          'Na tela de login, use "esqueci minha senha" para receber um link de redefinição por e-mail. ' +
          'Após redefinir, faça login normalmente. ' +
          'Já logado, é possível trocar a senha no seu perfil (informando a senha atual). ' +
          'Por segurança, o sistema não revela se um e-mail existe ou não ao solicitar a recuperação.',
        tags: ['senha', 'esqueci', 'redefinir', 'reset', 'login', 'acesso', 'usuario'],
      },
      {
        topic: 'usuarios', category: 'suporte',
        title: 'Usuário sem acesso a um módulo (permissões)',
        content:
          'O acesso aos módulos é controlado por perfil (papel) de cada usuário. ' +
          'Se alguém não vê um módulo ou recebe "acesso negado", o perfil dele não tem essa permissão. ' +
          'Quem resolve é o Administrador da empresa: em Administração > Perfis, ajuste as permissões do perfil ou atribua outro perfil ao usuário. ' +
          'O número de usuários permitidos depende do plano contratado.',
        tags: ['permissao', 'acesso negado', 'perfil', 'papel', 'usuario', 'admin', 'modulo', '403'],
      },

      // ── ERRO DE SISTEMA / GERAL ─────────────────────────────────────────────────
      {
        topic: 'erro_sistema', category: 'suporte',
        title: 'Tela travada ou comportamento inesperado',
        content:
          'Se uma tela travou ou algo se comportou de forma inesperada, tente primeiro: ' +
          '(1) atualizar a página (Ctrl+F5); (2) sair e entrar de novo; (3) testar em outro navegador (Chrome atualizado). ' +
          'Se persistir, registre: o que você estava fazendo, a tela/módulo, o horário e, se houver, a mensagem de erro exata. ' +
          'Com esses dados o suporte consegue investigar pelos logs. Para tema fiscal/financeiro com bloqueio, o atendimento é priorizado.',
        tags: ['erro', 'travou', 'bug', 'tela', 'inesperado', 'sistema', 'suporte'],
      },
      // Manuais tecnicos (suporte) — gerados de docs/manuais tecnicos
      ...MANUAIS_KB,
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

  // ── Diagnóstico de suporte — stubs (ADR 015 D3) ─────────────────────────
  // TODO(real): integrar com API do TMS antes do deploy DigitalOcean

  async getDocumentStatus(tenantId: string, type: 'cte' | 'mdfe', key: string): Promise<DocumentStatus | null> {
    if (!this.configured) return null;
    try {
      const url =
        `${process.env.TMS_API_BASE_URL}/nexa/fiscal/document` +
        `?tenantId=${encodeURIComponent(tenantId)}&type=${encodeURIComponent(type)}&key=${encodeURIComponent(key)}`;

      const res = await fetch(url, {
        headers: { 'x-internal-token': this.internalToken },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        this.logger.warn(`getDocumentStatus TMS ${res.status} — tenantId=${tenantId} type=${type}`);
        return null;
      }

      // Response: { found: boolean, document?: { documentId, type, status, issuedAt, rejectionCode, rejectionMessage } }
      const data = await res.json() as {
        found: boolean;
        document?: {
          documentId: string;
          type: 'cte' | 'mdfe';
          status: string;
          issuedAt?: string;
          rejectionCode?: string;
          rejectionMessage?: string;
        };
      };

      if (!data.found || !data.document) return null;

      const d = data.document;
      const validStatuses = ['authorized', 'cancelled', 'rejected', 'pending'] as const;
      const status = validStatuses.includes(d.status as any)
        ? (d.status as DocumentStatus['status'])
        : 'unknown';

      return {
        documentId: d.documentId,
        type: d.type,
        status,
        issuedAt: d.issuedAt,
        rejectionCode: d.rejectionCode,
        rejectionMessage: d.rejectionMessage,
      };
    } catch (err: any) {
      this.logger.warn(`getDocumentStatus erro — ${err?.message}`);
      return null;
    }
  }

  async getRejectionInfo(code: string): Promise<RejectionInfo | null> {
    // Tabela local de rejeições comuns SEFAZ — base para diagnóstico offline
    const known: Record<string, RejectionInfo> = {
      '562': { code: '562', message: 'Rejeição: CT-e já cancelado', category: 'operacional', suggestedAction: 'Emitir novo CT-e' },
      '539': { code: '539', message: 'Rejeição: CFOP inválido para a UF', category: 'fiscal', suggestedAction: 'Verificar CFOP no cadastro da operação' },
      '204': { code: '204', message: 'Rejeição: Duplicidade de CT-e', category: 'operacional', suggestedAction: 'Verificar se CT-e já foi emitido com o mesmo número' },
      '581': { code: '581', message: 'Rejeição: Certificado digital inválido/expirado', category: 'cadastro', suggestedAction: 'Renovar certificado digital PFX em Configurações → Fiscal → Certificados' },
      '999': { code: '999', message: 'Rejeição genérica do sistema', category: 'sistema', suggestedAction: 'Acionar suporte técnico com o XML do CT-e' },
    };
    return known[code] ?? null;
  }

  async getContractStatus(externalId: string): Promise<ContractStatus | null> {
    if (!this.configured || !externalId) return null;
    try {
      const url = `${process.env.TMS_API_BASE_URL}/nexa/contract?tenantId=${encodeURIComponent(externalId)}`;
      const res = await fetch(url, {
        headers: { 'x-internal-token': this.internalToken },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`TMS retornou ${res.status}`);

      const data = await res.json() as { found: boolean; contract: any };
      if (!data.found || !data.contract) return null;

      const k = data.contract;
      // TMS devolve 'inactive' (cancelado/expirado); o tipo ContractStatus usa 'cancelled'.
      const raw = k.status === 'inactive' ? 'cancelled' : k.status;
      const status = ['active', 'suspended', 'trial', 'cancelled'].includes(raw) ? raw : 'active';
      return {
        externalId:     String(k.externalId ?? externalId),
        plan:           k.plan ?? '',
        status:         status as ContractStatus['status'],
        expiresAt:      k.expiresAt ?? undefined,
        documentsUsed:  typeof k.documentsUsed === 'number' ? k.documentsUsed : undefined,
        documentsLimit: typeof k.documentsLimit === 'number' ? k.documentsLimit : undefined,
      };
    } catch (err: any) {
      this.logger.warn(`getContractStatus(${externalId}) falhou: ${err?.message}`);
      return null;
    }
  }

  // Verifica se o telefone já tem cadastro no HiperTMS.
  // Quando TMS_API_BASE_URL estiver configurado: chama a API real.
  // Enquanto não estiver: retorna null (lead ainda não é cliente).
  async lookupCustomer(phone: string): Promise<TmsCustomer | null> {
    if (!this.configured) {
      return null; // TMS não configurado — lead ainda é prospect
    }
    try {
      const url =
        `${process.env.TMS_API_BASE_URL}/nexa/customers/by-phone` +
        `?phone=${encodeURIComponent(phone)}`;

      const res = await fetch(url, {
        headers: { 'x-internal-token': this.internalToken },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`TMS retornou ${res.status}`);

      const data = await res.json() as { found: boolean; customer: any };
      if (!data.found || !data.customer) return null;

      const c = data.customer;
      const status = ['active', 'inactive', 'trial', 'suspended'].includes(c.status) ? c.status : 'active';
      return {
        externalId:   String(c.externalId),
        name:         c.name ?? '',
        email:        c.email ?? undefined,
        plan:         c.plan ?? undefined,
        status:       status as TmsCustomer['status'],
        registeredAt: c.registeredAt ?? undefined,
      };
    } catch (err: any) {
      this.logger.warn(`lookupCustomer(${phone}) falhou: ${err?.message}`);
      return null;
    }
  }
}
