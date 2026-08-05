import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Connector, Plan, PaymentRequestResult, KnowledgeItem, TmsCustomer, DocumentStatus, RejectionInfo, ContractStatus } from './connector.interface';
import { MANUAIS_KB } from './hipertms-manuais.data';
import { SUPORTE_KB } from './hipertms-suporte-kb.data';
import { TmsResilience } from './tms-resilience';

/**
 * TTLs de cache por tipo de leitura (ms). Curtos de propósito: o TMS continua sendo a
 * fonte da verdade (ADR 011) — isto só evita perguntar a mesma coisa 50x por minuto e
 * dá o que responder quando ele está fora.
 *
 * Quanto mais volátil o dado, menor o TTL. Catálogo de planos muda raramente; status
 * de documento fiscal muda o tempo todo, e responder status vencido é pior que dizer
 * "não consegui consultar agora".
 */
const TTL = {
  plans: 10 * 60_000,     // catálogo comercial — muda por decisão, não por operação
  customer: 5 * 60_000,   // cadastro do cliente
  contract: 2 * 60_000,   // plano/limite do contrato
  document: 30_000,       // status de CT-e/MDF-e — muito volátil
} as const;

// HiperTmsConnector — 1º conector (ADR 008/010).
// Integração REAL com a API do HiperTMS via TMS_BASE_URL (env).
// Quando configurado: busca planos e clientes ao vivo; fallback para catálogo
// offline quando TMS indisponível. Endpoints consumidos: GET /nexa/plans,
// GET /nexa/customers/by-phone. Ver docs/api/api-contract.md § TMS→Nexa.
@Injectable()
export class HiperTmsConnector implements Connector, OnModuleInit {
  readonly productCode = 'hipertms';
  private readonly logger = new Logger('HiperTmsConnector');

  /**
   * Cache de leitura + disjuntor (ver tms-resilience.ts).
   * 5 falhas seguidas desarmam por 30s; enquanto desarmado ninguém paga o timeout.
   */
  private readonly resilience = new TmsResilience({
    failureThreshold: Number(process.env.TMS_BREAKER_FAILURES ?? 5),
    openMs: Number(process.env.TMS_BREAKER_OPEN_MS ?? 30_000),
  });

  /**
   * Executa uma leitura no TMS com cache e disjuntor.
   *
   * Ordem: cache fresco → disjuntor → chamada real. Em qualquer falha devolve o último
   * valor conhecido (ainda que vencido) e, se nem isso existir, `null` — que é
   * exatamente o que estes métodos já retornavam em erro. Nenhum chamador precisa
   * mudar; quem tem fallback próprio (`getPlans`) continua tratando o null.
   *
   * Só LEITURA passa por aqui. Escrita nunca é cacheada nem servida de cache.
   *
   * `serveStaleOnError: false` para dados em que valor vencido é PIOR que não ter
   * resposta — preço e status fiscal. Ali a decisão já existente (K1) é a Lia admitir
   * que não conseguiu consultar, e não arriscar citar um número velho.
   */
  private async cachedRead<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
    opts: { serveStaleOnError?: boolean } = {},
  ): Promise<T | null> {
    const serveStale = opts.serveStaleOnError !== false;

    const fresh = this.resilience.getFresh<T>(key, ttlMs);
    if (fresh !== undefined) return fresh;

    if (this.resilience.isBlocked()) {
      const stale = serveStale ? this.resilience.getStale<T>(key) : undefined;
      this.logger.debug(`TMS com disjuntor aberto — ${key} servido do cache (${stale !== undefined ? 'stale' : 'vazio'})`);
      return stale ?? null;
    }

    try {
      const value = await fn();
      this.resilience.recordSuccess();
      this.resilience.set(key, value);
      return value;
    } catch (err: any) {
      this.resilience.recordFailure();
      const stale = serveStale ? this.resilience.getStale<T>(key) : undefined;
      const { circuitOpen, consecutiveFailures } = this.resilience.stats();
      this.logger.warn(
        `TMS falhou em ${key}: ${err?.message} — ` +
        `${stale !== undefined ? 'servindo cache vencido' : 'sem cache'} ` +
        `(falhas=${consecutiveFailures}${circuitOpen ? ', disjuntor ABERTO' : ''})`,
      );
      return stale ?? null;
    }
  }

  /** Exposto para o health check — sem conteúdo cacheado, só contadores. */
  resilienceStats() {
    return this.resilience.stats();
  }

  /**
   * O disjuntor está aberto agora? Usado pelos agentes de suporte para diferenciar
   * "esse dado não existe" de "não consegui consultar agora" — sem isso, os dois
   * casos chegavam ao cliente como o mesmo silêncio, e a Lia arriscava dizer que
   * algo não existe quando na verdade o TMS só está temporariamente fora do ar.
   */
  isDegraded(): boolean {
    return this.resilience.stats().circuitOpen;
  }

  // Base URL da API do TMS — suporta TMS_BASE_URL (canônico) e TMS_API_BASE_URL (legado).
  // Valor esperado: http://localhost:3000/api (local) ou URL pública em produção.
  private get baseUrl(): string {
    return (process.env.TMS_BASE_URL ?? process.env.TMS_API_BASE_URL ?? '').replace(/\/$/, '');
  }

  private get configured(): boolean {
    return !!this.baseUrl && !!(process.env.TMS_INTERNAL_TOKEN ?? process.env.TMS_SERVICE_TOKEN);
  }

  // Token enviado no header Authorization: Bearer para a API interna do TMS (/nexa/*).
  // Validado pelo ServiceTokenGuard do TMS contra NEXA_SERVICE_TOKEN.
  // NUNCA logar ou expor este valor.
  private get internalToken(): string {
    return process.env.TMS_INTERNAL_TOKEN ?? process.env.TMS_SERVICE_TOKEN ?? '';
  }

  // Header de autenticação server-to-server enviado em todas as chamadas ao TMS.
  private get authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.internalToken}` };
  }

  // Ping no boot com retry — aguarda redes Docker secundárias inicializarem.
  // Tenta 3 vezes com backoff crescente (2s, 4s, 6s) antes de emitir o aviso.
  async onModuleInit() {
    const attempts = 3;
    for (let i = 1; i <= attempts; i++) {
      await new Promise((r) => setTimeout(r, i * 2000));
      const result = await this.healthCheck();
      if (result.ok) {
        this.logger.log(`TMS conectado: ${result.detail}`);
        return;
      }
      if (i < attempts) {
        this.logger.debug(`TMS ping tentativa ${i}/${attempts}: ${result.detail} — aguardando...`);
      } else {
        // Esta mensagem já prometeu "Lia usará dados em cache" numa época em que
        // cache nenhum existia. Agora existe (ver tms-resilience.ts) — mas no BOOT
        // ele está vazio, então a promessa continuaria falsa. Log de incidente
        // precisa dizer o que de fato acontece: sem TMS e sem cache quente, a Lia
        // atende sem contexto de cliente e escala o que depender do TMS.
        this.logger.warn(
          `⚠️  TMS inacessível no boot: ${result.detail}. ` +
          `Verifique TMS_BASE_URL e TMS_SERVICE_TOKEN. ` +
          `Cache ainda VAZIO neste momento: até a primeira leitura bem-sucedida, ` +
          `consultas de cliente/contrato retornam vazio e a Lia escala em vez de responder.`,
        );
      }
    }
  }

  async healthCheck() {
    if (!this.configured) {
      return { ok: false, detail: 'TMS_BASE_URL/TOKEN não configurados' };
    }
    try {
      // baseUrl já inclui /api (ex.: http://localhost:3000/api), então health fica em /api/health.
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: this.authHeader,
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

    // K1 mantido: `serveStaleOnError: false`. O cache aqui existe só para não pedir o
    // catálogo a cada mensagem — na FALHA a Lia volta a receber [] e escala, em vez de
    // citar um preço que pode ter mudado. Preço errado dito por escrito vira oferta
    // (casos Chevrolet/Air Canada); "vou confirmar os valores" não custa nada.
    const plans = await this.cachedRead<Plan[]>(
      'plans',
      TTL.plans,
      async () => {
        // /nexa/plans retorna shape compatível com o Connector: { plans: [{code, name, price, maxUsers, features}] }
        const res = await fetch(`${this.baseUrl}/nexa/plans`, {
          headers: this.authHeader,
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`TMS retornou ${res.status}`);

        // Aceita tanto { plans: [...] } quanto [...] direto.
        const data = await res.json() as { plans?: any[] } | any[];
        const rows = Array.isArray(data) ? data : data?.plans;
        if (!Array.isArray(rows) || rows.length === 0) {
          throw new Error('resposta do TMS sem planos');
        }

        const parsed: Plan[] = rows.map((p) => ({
          code: String(p.code ?? p.id ?? '').trim(),
          name: String(p.name ?? p.title ?? p.code ?? '').trim(),
          price: Number(p.price ?? p.priceMonthly ?? p.monthlyPrice ?? 0),
          maxUsers: p.maxUsers ?? p.userLimit ?? undefined,
          features: Array.isArray(p.features) ? p.features.map((f: any) => String(f)) : [],
        })).filter((p) => p.code && Number.isFinite(p.price) && p.price > 0);

        if (parsed.length === 0) throw new Error('planos do TMS inválidos (sem code/preço)');
        return parsed;
      },
      { serveStaleOnError: false },
    );

    return plans ?? [];
  }

  // Catálogo offline do HiperTMS — usado APENAS quando TMS_API_BASE_URL não está configurado.
  // Quando o TMS está configurado e indisponível, getPlans() retorna [] (não este fallback).
  // Manter sincronizado com os planos reais do TMS.
  // Validado em 2026-06-19 contra GET /api/nexa/plans do TMS local; Corporativo adicionado em K1 (2026-07-10).
  // ⚠️ FONTE DE VERDADE = a tela /admin/subscription do TMS EM PRODUÇÃO.
  //
  // Lição cara (2026-08-01): numa primeira versão "corrigi" estes limites a
  // partir das MIGRATIONS do TMS (1/5/10 usuários) e quebrei dados que estavam
  // certos — os planos foram alterados direto no banco depois das migrations,
  // então elas estão desatualizadas e NÃO servem de fonte. Conferido contra a
  // tela real de assinatura em 2026-08-01.
  //
  // Este catálogo só é usado quando o TMS está OFFLINE; no dia a dia getPlans()
  // lê os valores em tempo real. Ainda assim precisa estar certo.
  private defaultPlans(): Plan[] {
    return [
      { code: 'basic', name: 'Básico', price: 89, maxUsers: 5,
        features: ['5 usuários', 'empresas ilimitadas', 'veículos ilimitados', '500 embarques/mês',
          '500 documentos/mês', '1 GB', 'alertas em 1 número', 'SEM módulo de Viagens'] },
      { code: 'essencial', name: 'Essencial', price: 199, maxUsers: 8,
        features: ['8 usuários', 'empresas ilimitadas (matriz e filiais)', 'veículos ilimitados',
          '1.000 embarques/mês', '1.000 documentos/mês', '10 GB', 'Viagens e roteirização',
          'acesso à API', 'relatórios avançados', 'alertas em 3 números'] },
      { code: 'profissional', name: 'Profissional', price: 299, maxUsers: 15,
        features: ['15 usuários', '2.000 embarques/mês', '5.000 documentos/mês', '50 GB',
          'suporte prioritário', 'acesso à API', 'relatórios avançados', 'alertas em 5 números'] },
      { code: 'corporativo', name: 'Corporativo', price: 0, maxUsers: undefined,
        features: ['SOB CONSULTA — não informar preço', 'tudo ilimitado', 'SSO (Single Sign-On)',
          'instância dedicada', 'SLA', 'retenção longa e compliance'] },
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
      {
        topic: 'embarques', category: 'modulo',
        title: 'Modelo de Embarque — templates para operações recorrentes',
        content:
          'O HiperTMS permite criar Modelos de Embarque (templates) para rotas e operações recorrentes. ' +
          'Um modelo salva as configurações de um embarque (rota, partes, modalidade, tipo de carga) para reutilização rápida. ' +
          'Como criar um modelo: abra um embarque existente e clique em "Salvar como Modelo". Dê um nome ao modelo e confirme. ' +
          'Como usar um modelo: ao criar um novo embarque, clique em "Usar Modelo", selecione o modelo desejado — os campos são preenchidos automaticamente. ' +
          'Modelos são gerenciados em Operação → Modelos de Embarque (booking-template). ' +
          'Ideal para rotas fixas (ex: sempre SP → RJ com o mesmo cliente e tipo de carga). ' +
          'O modelo não inclui datas nem documentos fiscais — apenas a estrutura operacional.',
        tags: ['modelo embarque', 'template', 'recorrente', 'booking-template', 'rota fixa', 'reaproveitar'],
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
      // K1: preços e limites são consultados dinamicamente via getPlans() — nunca fixar aqui.
      {
        topic: 'planos', category: 'comercial',
        title: 'Planos disponíveis — consultar dados dinâmicos',
        content:
          'O HiperTMS oferece planos para transportadoras de todos os portes (Básico, Essencial, Profissional e Corporativo). ' +
          'Os preços, limites de usuários e funcionalidades de cada plano são consultados em tempo real e podem mudar. ' +
          'Sempre consulte os dados dinâmicos do conector (getPlans()) para responder sobre preços e limites. ' +
          'NUNCA informe preço ou limite de plano a partir de texto fixo — se os dados do conector estiverem indisponíveis, ' +
          'diga "vou confirmar os valores atualizados" e escale para um especialista. ' +
          'Todos os planos incluem: CT-e, MDF-e, precificação, frota, financeiro e suporte por e-mail. ' +
          'ATENÇÃO (2026-08-01): o módulo de VIAGENS não está no Básico — só a partir do Essencial.',
        tags: ['plano', 'preco', 'valor', 'basico', 'essencial', 'profissional', 'corporativo', 'quanto custa'],
      },
      {
        topic: 'planos', category: 'comercial',
        // ⚠️ NÃO RENOMEAR ESTE TÍTULO. A sincronização da KB
        // (knowledge.service.ts:233) casa artigo por TÍTULO: mudar o título cria
        // um artigo NOVO e deixa o antigo vivo no banco — e nada apaga artigo que
        // sumiu do conector. Foi o que aconteceu na 1ª versão desta correção: o
        // texto do "trial gratuito" continuaria recuperável pela Lia.
        // Para corrigir o conteúdo de um artigo, edite só o `content`.
        title: 'Trial e forma de pagamento',
        content:
          'ATENÇÃO: o HiperTMS NÃO tem período de teste (trial). Nunca prometa "teste grátis" nem "30 dias grátis". ' +
          'A assinatura entra ATIVA desde o primeiro dia — o cliente é cliente, não testador. ' +
          'O que existe é a PRIMEIRA COBRANÇA ADIADA: a fatura vence sempre no dia 15 e nunca em menos de 30 dias ' +
          'da contratação. Se o dia 15 mais próximo estiver a menos de 30 dias, ela pula para o mês seguinte. ' +
          'Na prática o cliente usa entre 30 e ~60 dias antes de pagar, dependendo do dia em que entrou: ' +
          'quem entra dia 1º de agosto paga em 15 de setembro (45 dias); quem entra dia 20 de agosto paga em ' +
          '15 de outubro (56 dias). ' +
          'NÃO PRECISA CADASTRAR CARTÃO PARA ENTRAR (confirmado pela diretoria em 2026-08-01). O lead só se ' +
          'cadastra e já acessa; o boleto é enviado depois. Esse é o argumento MAIS FORTE que temos para vencer ' +
          'a hesitação inicial — use sempre que o lead demonstrar receio de se comprometer. ' +
          'Ele também pode CANCELAR nos primeiros 7 dias. ' +
          'Forma de dizer ao lead: "você se cadastra sem informar cartão nenhum, já começa a usar, e o boleto da ' +
          'primeira mensalidade só vem depois — nunca em menos de 30 dias. E nos primeiros 7 dias você pode ' +
          'cancelar." É forte E verdadeiro. NÃO chame de "grátis" nem de "teste": não é. ' +
          'Pagamento via boleto (padrão), PIX ou cartão. Ciclo mensal ou ANUAL — o anual dá ' +
          'ECONOMIA DE ATÉ 17% (informação da própria tela de assinatura). Sem fidelidade; upgrade e ' +
          'downgrade são imediatos.',
        tags: ['trial', 'teste', 'gratuito', 'pagamento', 'boleto', 'pix', 'cartao', 'sem cartao', 'cancelamento', 'primeira fatura', 'quando paga', 'compromisso'],
      },
      {
        topic: 'planos', category: 'comercial',
        title: 'Limites de cada plano — usar para qualificar o lead',
        content:
          'Limites REAIS por plano (conferidos na tela de assinatura do TMS em 2026-08-01). ' +
          'O que separa os planos é USUÁRIOS e VOLUME — veículos e empresas são ilimitados em todos, ' +
          'então "quantos caminhões você tem?" NÃO é a pergunta que define o plano. ' +
          'Pergunte quantas PESSOAS vão usar o sistema e quantos embarques/mês a operação faz.\n' +
          'BÁSICO (R$89/mês): 5 usuários, 500 embarques/mês, 500 documentos/mês, 1 GB, alertas em 1 número. ' +
          'NÃO inclui Viagens/roteirização, API nem relatórios avançados.\n' +
          'ESSENCIAL (R$199/mês): 8 usuários, 1.000 embarques/mês, 1.000 documentos/mês, 10 GB, ' +
          'alertas em 3 números. Inclui Viagens, API e relatórios avançados. É o plano marcado como ' +
          '"Mais Popular" e atende 90% do público.\n' +
          'PROFISSIONAL (R$299/mês): 15 usuários, 2.000 embarques/mês, 5.000 documentos/mês, 50 GB, ' +
          'alertas em 5 números, suporte prioritário. Foco em precificação avançada, regras por cliente/rota.\n' +
          'CORPORATIVO: SOB CONSULTA (não informe preço). Tudo ilimitado, SSO, instância dedicada, SLA.\n' +
          'Empresas (matriz e filiais) e veículos são ILIMITADOS em todos os planos. ' +
          'NUNCA infle esses números para fechar venda: o limite é aplicado pelo sistema e o cliente descobre ' +
          'no primeiro uso.',
        tags: ['limite', 'usuarios', 'veiculos', 'frota', 'empresas', 'filial', 'embarques', 'documentos', 'quantos', 'cabe', 'preco', 'quanto custa'],
      },
      {
        topic: 'planos', category: 'comercial',
        title: 'Básico NÃO tem módulo de Viagens',
        content:
          'O plano Básico (R$89/mês) cobre embarques e fiscal, mas o módulo de VIAGENS está desligado nele. ' +
          'A própria descrição do plano no sistema diz: "Viagens e roteirização avançada nos planos Essencial ou superior". ' +
          'Se o lead falar em roteirização, montagem de viagem, agrupar embarques numa viagem ou controle de ' +
          'motorista em rota, o plano mínimo é o ESSENCIAL. ' +
          'Vender o Básico nesse caso gera cancelamento na primeira semana.',
        tags: ['basico', 'viagens', 'roteirizacao', 'trip', 'limitacao', 'nao tem'],
      },

      // ── FISCAL: módulos que faltavam na KB de vendas (2026-08-01) ─────────────
      {
        topic: 'gnre', category: 'produto',
        title: 'GNRE — guia de recolhimento interestadual',
        content:
          'O HiperTMS emite GNRE (Guia Nacional de Recolhimento de Tributos Estaduais) com transmissão direta ' +
          'aos autorizadores estaduais, assinada com o certificado digital da transportadora. ' +
          'Cobre o envio do lote, a consulta do resultado e a validação do XML antes do envio (evita rejeição). ' +
          'Serve para o ICMS-ST e demais obrigações interestaduais que a operação de transporte gera. ' +
          'Quem opera fora do estado e hoje preenche guia no site da SEFAZ manualmente é o público desse módulo.',
        tags: ['gnre', 'guia', 'icms', 'interestadual', 'st', 'recolhimento', 'imposto', 'tributo'],
      },
      {
        topic: 'nfse', category: 'produto',
        title: 'NFS-e — nota fiscal de serviço',
        content:
          'O HiperTMS emite NFS-e (nota fiscal de serviço eletrônica) através de API intermediadora, ' +
          'hoje pela Focus NFe. Útil para a transportadora que além do frete (CT-e) presta serviços ' +
          'que exigem nota de serviço: armazenagem, movimentação, gestão logística. ' +
          'A configuração é por município, já que a NFS-e é municipal.',
        tags: ['nfse', 'nota fiscal de servico', 'servico', 'armazenagem', 'municipal', 'iss'],
      },
      {
        topic: 'ciot', category: 'produto',
        title: 'CIOT — atenção: registro sim, geração automática AINDA NÃO',
        content:
          'CUIDADO AO RESPONDER. O HiperTMS REGISTRA o CIOT na viagem e no embarque, com histórico e vínculo ' +
          'ao documento — mas a GERAÇÃO AUTOMÁTICA junto à IPEF ainda não está liberada (depende de ' +
          'credenciamento). Hoje o cliente gera o número na IPEF e registra no HiperTMS. ' +
          'Diga exatamente isso ao lead: "o sistema registra e controla o CIOT das suas viagens; a geração ' +
          'automática junto à IPEF está em implantação". ' +
          'NUNCA prometa "o sistema gera o CIOT sozinho" — é o tipo de promessa que vira cancelamento. ' +
          'Se o lead disser que geração automática é decisivo, escale para um especialista humano.',
        tags: ['ciot', 'ipef', 'motorista autonomo', 'tac', 'pamcard', 'gerar ciot', 'antt'],
      },
      {
        topic: 'calculadora', category: 'produto',
        title: 'Calculadora de frete — ferramenta pública para atrair o lead',
        content:
          'O HiperTMS tem uma calculadora de frete PÚBLICA (não precisa ser cliente para usar) com três modalidades: ' +
          '(1) PISO MÍNIMO ANTT — calcula o valor mínimo legal da tabela da ANTT para a rota e o tipo de carga; ' +
          '(2) DEDICADO — frete de carga fechada/lotação; ' +
          '(3) FRACIONADO — carga fracionada. ' +
          'Inclui busca de cidades para montar a rota. ' +
          'Use como CTA de baixo compromisso com lead frio: convide a testar a calculadora antes de falar de plano. ' +
          'É o melhor gancho para quem ainda não quer conversa comercial.',
        tags: ['calculadora', 'calcular frete', 'piso minimo', 'antt', 'dedicado', 'fracionado', 'simular', 'cotar'],
      },

      // ── FROTA: módulos que faltavam na KB de vendas (2026-08-01) ──────────────
      {
        topic: 'frota-pneus', category: 'produto',
        title: 'Controle de pneus por posição no veículo',
        content:
          'O HiperTMS controla pneus individualmente: cadastro de cada pneu, montagem e desmontagem por ' +
          'POSIÇÃO no veículo (dianteiro esquerdo, eixo traseiro, etc.), histórico de onde cada pneu rodou e ' +
          'alerta de troca ao se aproximar da vida útil em km. ' +
          'Pneu é o segundo maior custo variável de uma transportadora depois do combustível — quem hoje ' +
          'controla isso em caderno ou planilha perde rodízio e roda pneu além do limite. ' +
          'Boa pergunta de qualificação: "como você controla o rodízio dos pneus hoje?".',
        tags: ['pneu', 'pneus', 'rodizio', 'vida util', 'borracharia', 'posicao', 'eixo', 'custo'],
      },
      {
        topic: 'frota-manutencao', category: 'produto',
        title: 'Manutenção preventiva com alerta automático',
        content:
          'O HiperTMS registra manutenções e dispara ALERTA AUTOMÁTICO de preventiva por dois gatilhos: ' +
          'quilometragem rodada (lido do hodômetro do veículo) ou tempo decorrido — o que vencer primeiro. ' +
          'Troca de óleo, por exemplo, alerta por km OU pela validade do lubrificante. ' +
          'Também alerta a troca de pneu antes de atingir a vida útil, com tolerância configurável. ' +
          'O argumento comercial é claro: manutenção preventiva perdida vira quebra na estrada, que custa ' +
          'guincho, carga parada e cliente insatisfeito.',
        tags: ['manutencao', 'preventiva', 'alerta', 'oleo', 'revisao', 'quebra', 'hodometro', 'km'],
      },
      {
        topic: 'frota-combustivel', category: 'produto',
        title: 'Abastecimento, consumo e média por veículo',
        content:
          'O HiperTMS registra abastecimentos, calcula a MÉDIA DE CONSUMO por veículo (km/l), mantém preços ' +
          'médios de combustível e histórico de hodômetro. Isso permite comparar veículos e motoristas, ' +
          'identificar consumo fora do padrão e apurar o custo real por km — que é a base para precificar frete. ' +
          'Transportadora que não sabe o custo por km está chutando o preço do frete.',
        tags: ['combustivel', 'diesel', 'abastecimento', 'consumo', 'media', 'km/l', 'hodometro', 'custo por km'],
      },
      {
        topic: 'frota-diarias', category: 'produto',
        title: 'Diárias e adiantamentos de motorista',
        content:
          'O HiperTMS controla diárias e adiantamentos de motorista vinculados à viagem, com registro do que ' +
          'foi pago e prestação de contas. Integra ao financeiro, então o custo da viagem já nasce completo ' +
          '(frete + combustível + diária + pedágio), sem precisar juntar recibo depois.',
        tags: ['diaria', 'diarias', 'adiantamento', 'motorista', 'vale', 'prestacao de contas', 'viagem'],
      },

      // ── CONTRATOS E COMPRAS (fase 2, 2026-08-01) ─────────────────────────────
      {
        topic: 'contratos-comerciais', category: 'produto',
        title: 'Contrato comercial por cliente — preço que não vaza',
        content:
          'O HiperTMS permite contrato comercial POR CLIENTE, com tabela de preço, taxas e markup próprios. ' +
          'Quando o embarque é daquele cliente, o sistema aplica automaticamente o contrato dele — sem depender ' +
          'de alguém lembrar o desconto combinado. O contrato é validado contra a empresa antes de ser aplicado, ' +
          'para não pegar tabela de outra filial por engano. ' +
          'Dor que resolve: transportadora com 30 clientes e 30 acordos diferentes na cabeça do comercial. ' +
          'Quando o vendedor sai, o preço vai junto. Aqui fica no sistema.',
        tags: ['contrato', 'cliente', 'tabela de preco', 'acordo', 'desconto', 'markup', 'taxa'],
      },
      {
        topic: 'contratos-terceiros', category: 'produto',
        title: 'Contratos de fornecedor e de prestador de serviço',
        content:
          'Além do contrato de cliente, o HiperTMS controla contratos de FORNECEDOR e de PRESTADOR DE SERVIÇO ' +
          '(agregado, terceiro, autônomo), com vigência e vínculo à empresa. ' +
          'Serve para transportadora que subcontrata frete: o custo do terceiro fica registrado em contrato e ' +
          'entra na apuração da viagem, em vez de virar acerto informal.',
        tags: ['fornecedor', 'prestador', 'terceiro', 'agregado', 'subcontratacao', 'contrato', 'autonomo'],
      },
      {
        topic: 'antt-piso', category: 'produto',
        title: 'Piso mínimo ANTT na contratação de terceiro (compliance)',
        content:
          'O HiperTMS calcula o PISO MÍNIMO da ANTT (Resolução 2.501/2025) na contratação de terceiros e ' +
          'COMPARA com o frete que a transportadora está pagando ao terceiro. Se ficar abaixo do piso legal, ' +
          'registra um evento de compliance e ALERTA — não bloqueia a operação. ' +
          'A fórmula usada é a oficial: (distância × CCD) + CC, com retorno vazio quando aplicável. ' +
          'Esse é um argumento de RISCO, não de eficiência: pagar abaixo do piso expõe a transportadora a ' +
          'autuação. Muita gente não sabe que está exposta. ' +
          'Atenção: isso é para CONTRATAR terceiro — não confundir com a precificação de venda ao cliente, ' +
          'que tem markup e tabela comercial próprios.',
        tags: ['antt', 'piso', 'piso minimo', 'resolucao', '2501', 'terceiro', 'compliance', 'multa', 'autuacao'],
      },
      {
        topic: 'compras-estoque', category: 'produto',
        title: 'Compras e estoque de peças com importação por XML',
        content:
          'O módulo de Compras controla produtos (peças, pneus, insumos) e suas movimentações de entrada e saída, ' +
          'com importação a partir do XML da nota do fornecedor — não precisa digitar item por item. ' +
          'Também exporta as movimentações em CSV. ' +
          'Fecha o ciclo com a manutenção: a peça que sai do estoque entra no custo da manutenção do veículo.',
        tags: ['compras', 'estoque', 'pecas', 'produto', 'xml', 'nota do fornecedor', 'almoxarifado', 'entrada'],
      },

      // ── COMERCIAL E GESTÃO (fase 3, 2026-08-01) ──────────────────────────────
      {
        topic: 'funil-vendas', category: 'produto',
        title: 'Funil de vendas e playbook de prospecção dentro do TMS',
        content:
          'ATENÇÃO: isto descreve um MÓDULO que a transportadora usa DEPOIS de ser cliente, para vender ' +
          'frete PARA OS CLIENTES DELA — não é algo que a Lia faz com o lead atual desta conversa. ' +
          'O HiperTMS tem funil comercial próprio: oportunidades de venda com etapas, e um PLAYBOOK de ' +
          'prospecção em passos — cada oportunidade mostra em que passo do processo está e o que falta fazer. ' +
          'Também tem enriquecimento geográfico das empresas do funil da transportadora (localiza a empresa ' +
          'no mapa), útil para ela planejar visita e rota comercial aos próprios clientes. ' +
          'Diferencial relevante: a transportadora não precisa de um CRM separado para o comercial dela. ' +
          'Vender frete e operar frete ficam no mesmo lugar — a cotação vira embarque sem redigitar.',
        tags: ['funil', 'crm', 'oportunidade', 'prospeccao', 'playbook', 'sdr', 'comercial', 'vendas', 'pipeline'],
      },
      {
        topic: 'dashboard', category: 'produto',
        title: 'Dashboard operacional — o dono enxerga a operação',
        content:
          'O HiperTMS tem dashboard do tenant com contagens por estado (cotações, embarques, cargas, viagens), ' +
          'panorama da frota, panorama operacional e séries temporais da logística — dá para ver a evolução, ' +
          'não só a foto do dia. ' +
          'Argumento para o DONO da transportadora, que costuma ser quem decide a compra: hoje ele pergunta ' +
          '"quantos embarques temos em aberto?" e alguém vai contar na planilha. Aqui ele abre e vê.',
        tags: ['dashboard', 'painel', 'indicador', 'kpi', 'grafico', 'visao geral', 'gestao', 'dono'],
      },
      {
        topic: 'equipes-tarefas', category: 'produto',
        title: 'Tarefas, atividades e chat interno da equipe',
        content:
          'O HiperTMS controla tarefas atribuídas a usuários (com conclusão), registro de atividades da equipe e ' +
          'CHAT INTERNO — conversa direta e em grupo dentro do próprio sistema. ' +
          'Evita que a coordenação da operação viva em grupo de WhatsApp, onde nada fica registrado e ninguém ' +
          'acha depois. A tarefa fica ligada à operação, não solta num aplicativo à parte.',
        tags: ['tarefa', 'atividade', 'equipe', 'chat', 'mensagem interna', 'coordenacao', 'time'],
      },
      {
        topic: 'relatorios', category: 'produto',
        title: 'Relatórios por área',
        content:
          'O HiperTMS tem relatórios de logística, frota, fiscal e financeiro. ' +
          'RELATÓRIOS AVANÇADOS estão disponíveis a partir do plano ESSENCIAL — o Básico não inclui. ' +
          'Se o lead insistir em análise mais profunda ou exportação, o piso é o Essencial.',
        tags: ['relatorio', 'relatorios', 'exportar', 'analise', 'gerencial', 'planilha'],
      },
      {
        topic: 'addons', category: 'comercial',
        title: 'Add-ons cobrados à parte',
        content:
          'Além da mensalidade, o HiperTMS cobra dois ADD-ONS (preços conferidos na tela de assinatura, 2026-08-01):\n' +
          '• NÚMERO ADICIONAL de WhatsApp para os alertas do Monitor Proativo: R$ 29,90 por número/mês. ' +
          'Cada plano já inclui uma quantidade (Básico 1, Essencial 3, Profissional 5; Corporativo sob consulta) — ' +
          'acima disso é add-on.\n' +
          '• ARMAZENAMENTO EXTRA: R$ 19,90 por bloco de 1 GB/mês, além da quota do plano.\n' +
          'Se o lead perguntar "quantas pessoas recebem os alertas?", a resposta depende do plano. ' +
          'Pode informar esses dois valores — são de tabela. Para o Corporativo, sob consulta.',
        tags: ['addon', 'add-on', 'adicional', 'extra', 'armazenamento', 'monitor', 'numero extra', 'cobranca', 'whatsapp'],
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
      // KB de suporte: troubleshooting, FAQ, erros comuns por módulo
      ...SUPORTE_KB,
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

    // TTL curtíssimo (30s) e SEM cache vencido: status fiscal muda a toda hora. Dizer
    // "seu CT-e foi autorizado" com base numa leitura de 10 minutos atrás é pior que
    // dizer "não consegui consultar agora" — o cache aqui só absorve a repetição de
    // quem manda a mesma chave três vezes seguidas.
    return this.cachedRead<DocumentStatus | null>(
      `doc:${tenantId}:${type}:${key}`,
      TTL.document,
      async () => {
      const url =
        `${this.baseUrl}/nexa/fiscal/document` +
        `?tenantId=${encodeURIComponent(tenantId)}&type=${encodeURIComponent(type)}&key=${encodeURIComponent(key)}`;

      const res = await fetch(url, {
        headers: this.authHeader,
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
      },
      { serveStaleOnError: false },
    );
  }

  async getRejectionInfo(code: string): Promise<RejectionInfo | null> {
    // Tabela local de rejeições comuns SEFAZ CT-e/MDF-e — base para diagnóstico offline.
    // Atualizada com os principais códigos para suporte de primeiro nível.
    const known: Record<string, RejectionInfo> = {
      // ── Acesso / Serviço ────────────────────────────────────────────────────
      '108': { code: '108', message: 'Serviço SEFAZ paralisado temporariamente', category: 'sistema', suggestedAction: 'Aguardar retorno do serviço e tentar novamente. Consulte cte.fazenda.gov.br.' },
      '109': { code: '109', message: 'Serviço SEFAZ paralisado sem previsão de retorno', category: 'sistema', suggestedAction: 'Aguardar e monitorar cte.fazenda.gov.br. Em prolongada indisponibilidade, acionar suporte para orientação sobre contingência.' },
      '214': { code: '214', message: 'Tamanho da mensagem excedeu o limite estabelecido', category: 'sistema', suggestedAction: 'Verificar se o XML está correto e dentro dos limites. Acionar suporte técnico.' },

      // ── Certificado ─────────────────────────────────────────────────────────
      '280': { code: '280', message: 'Certificado digital transmissor diferente do emitente', category: 'cadastro', suggestedAction: 'Verificar se o certificado configurado pertence ao CNPJ emitente. Administração → Fiscal → Certificados.' },
      '301': { code: '301', message: 'Uso de algoritmo de hash não permitido', category: 'sistema', suggestedAction: 'Certificado com algoritmo incompatível. Adquirir novo certificado A1 compatível com o padrão ICP-Brasil.' },
      '302': { code: '302', message: 'Assinatura digital inválida', category: 'sistema', suggestedAction: 'Problema na assinatura do XML. Remover o certificado e fazer upload novamente. Se persistir, acionar suporte técnico.' },
      '581': { code: '581', message: 'Certificado digital inválido ou expirado', category: 'cadastro', suggestedAction: 'Renovar o certificado digital PFX junto à Autoridade Certificadora. Depois, acessar Administração → Fiscal → Certificados e fazer novo upload.' },

      // ── Emitente / Empresa ──────────────────────────────────────────────────
      '401': { code: '401', message: 'IE do emitente inválida', category: 'cadastro', suggestedAction: 'Verificar Inscrição Estadual em Administração → Dados da Empresa. Confirmar IE ativa junto à SEFAZ estadual.' },
      '564': { code: '564', message: 'CNPJ do emitente inválido', category: 'cadastro', suggestedAction: 'Verificar CNPJ em Administração → Dados da Empresa. CNPJ deve estar ativo na Receita Federal.' },
      '565': { code: '565', message: 'Emitente não habilitado para emitir CT-e', category: 'cadastro', suggestedAction: 'Empresa não está habilitada para emissão de CT-e nesta SEFAZ. Verificar credenciamento junto ao SEFAZ estadual.' },

      // ── Duplicidade / Numeração ──────────────────────────────────────────────
      '204': { code: '204', message: 'Duplicidade de CT-e', category: 'operacional', suggestedAction: 'CT-e com o mesmo número já está autorizado. Verificar em Operação → CT-e. Se precisar corrigir, cancele o existente e emita novo.' },
      '205': { code: '205', message: 'CT-e já está cancelado na base da SEFAZ', category: 'operacional', suggestedAction: 'O cancelamento já foi processado. Não há ação necessária. Para nova carga, emitir um novo CT-e.' },

      // ── CFOP / Fiscal ───────────────────────────────────────────────────────
      '539': { code: '539', message: 'CFOP inválido para a UF de operação', category: 'fiscal', suggestedAction: 'Verificar UF de origem e destino no embarque. O HiperTMS usa 5352 (interna) e 6352 (interestadual). Corrigir endereço do remetente/destinatário em Cadastros.' },

      // ── RNTRC / ANTT ────────────────────────────────────────────────────────
      '524': { code: '524', message: 'RNTRC do emitente não informado ou inválido', category: 'cadastro', suggestedAction: 'Informar o RNTRC (Registro Nacional de Transportadores Rodoviários de Cargas) em Administração → Dados da Empresa. RNTRC deve ter 8 dígitos.' },
      '525': { code: '525', message: 'RNTRC do veículo inválido', category: 'cadastro', suggestedAction: 'Verificar o RNTRC do veículo em Frota → Veículos → aba Documentos. Deve ser o número do RNTRC do proprietário ou arrendatário do veículo.' },

      // ── Cancelamento ────────────────────────────────────────────────────────
      '562': { code: '562', message: 'CT-e já cancelado anteriormente', category: 'operacional', suggestedAction: 'O CT-e já está cancelado — não é necessária nova ação. Emitir novo CT-e se necessário.' },
      '580': { code: '580', message: 'Prazo de cancelamento esgotado (mais de 24h)', category: 'operacional', suggestedAction: 'Não é possível cancelar após 24h da autorização. Usar Carta de Correção (CC-e) para campos permitidos, ou emitir CT-e Complementar/Substituto.' },

      // ── Dados da operação ───────────────────────────────────────────────────
      '217': { code: '217', message: 'CT-e não encontrado na base da SEFAZ', category: 'operacional', suggestedAction: 'O CT-e não existe na SEFAZ. Verificar número e chave de acesso. Pode ser necessário reemitir.' },
      '228': { code: '228', message: 'Data de emissão muito anterior à data atual', category: 'operacional', suggestedAction: 'A data de emissão não pode ser muito anterior à data atual (limite varia por UF). Emitir com a data correta.' },
      '573': { code: '573', message: 'Duplicidade de evento para a chave do CT-e', category: 'operacional', suggestedAction: 'Evento já registrado para este CT-e (cancelamento ou CC-e). Verificar histórico em Operação → CT-e.' },

      // ── Genérico ────────────────────────────────────────────────────────────
      '999': { code: '999', message: 'Erro não catalogado na SEFAZ', category: 'sistema', suggestedAction: 'Erro genérico SEFAZ. Acionar suporte técnico enviando o XML completo do CT-e e o horário da tentativa.' },
    };
    return known[code] ?? null;
  }

  async getContractStatus(externalId: string): Promise<ContractStatus | null> {
    if (!this.configured || !externalId) return null;

    // Contrato serve cache vencido na falha: saber que o cliente é Essencial e está
    // ativo, com dado de 5 minutos atrás, é muito melhor que a Lia atender sem
    // contexto nenhum. Não é número que ela promete ao lead — é contexto de suporte.
    return this.cachedRead<ContractStatus | null>(`contract:${externalId}`, TTL.contract, async () => {
      const url = `${this.baseUrl}/nexa/contract?tenantId=${encodeURIComponent(externalId)}`;
      const res = await fetch(url, {
        headers: this.authHeader,
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
    });
  }

  // Verifica se o telefone já tem cadastro no HiperTMS.
  // Quando TMS_API_BASE_URL estiver configurado: chama a API real.
  // Enquanto não estiver: retorna null (lead ainda não é cliente).
  async lookupCustomer(phone: string): Promise<TmsCustomer | null> {
    if (!this.configured) {
      return null; // TMS não configurado — lead ainda é prospect
    }
    // Identidade quase não muda, e é a consulta MAIS repetida do sistema: roda a cada
    // mensagem recebida para descobrir se o telefone é cliente ou prospect. É onde o
    // cache mais economiza e onde o dado vencido é mais inofensivo.
    return this.cachedRead<TmsCustomer | null>(`customer:${phone}`, TTL.customer, async () => {
      const url =
        `${this.baseUrl}/nexa/customers/by-phone` +
        `?phone=${encodeURIComponent(phone)}`;

      const res = await fetch(url, {
        headers: this.authHeader,
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
    });
  }

  // Monitor proativo — busca eventos classificados pelo TMS para um tenant.
  // Endpoint: GET /api/nexa/proactivity/events?tenantId=<externalId>
  // Retorna lista vazia com warn se o TMS não estiver configurado ou falhar.
  async getProactivityEvents(externalTenantId: string): Promise<TmsProactivityEvent[]> {
    if (!this.configured) {
      this.logger.warn('getProactivityEvents: TMS não configurado');
      return [];
    }
    try {
      const url = `${this.baseUrl}/nexa/proactivity/events?tenantId=${encodeURIComponent(externalTenantId)}`;
      const res = await fetch(url, {
        headers: this.authHeader,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`getProactivityEvents: TMS retornou ${res.status}`);
        return [];
      }
      const data = await res.json() as { events?: TmsProactivityEvent[] } | TmsProactivityEvent[];
      const raw = Array.isArray(data) ? data : (data?.events ?? []);
      const DOMAIN_TO_CATEGORY: Record<string, TmsProactivityEvent['category']> = {
        fleet: 'frota',
        logistic: 'logistic',
        finance: 'finance',
        fiscal: 'fiscal',
      };
      return raw.map((e: any) => ({
        // Prefer dedupeKey (stable TMS-side key, same value used in push webhook)
        // so that pull and push always share the same AlertState identity.
        // Falls back to e.id for TMS versions that don't expose dedupeKey yet.
        id: e.dedupeKey ?? e.id,
        severity: e.severity as TmsProactivityEvent['severity'],
        category: (DOMAIN_TO_CATEGORY[e.domain] ?? e.category ?? e.domain) as TmsProactivityEvent['category'],
        title: String(e.title ?? e.reason ?? e.ruleId ?? 'Evento pendente'),
        description: (e.description ?? e.subjectLabel ?? null) as string | undefined,
      }));
    } catch (err: any) {
      this.logger.warn(`getProactivityEvents falhou: ${err?.message}`);
      return [];
    }
  }

  // T8.2 — Fechamento quinzenal/mensal (Nexa scheduler, ClosingReportService).
  // Endpoint: GET /nexa/proactivity/closing-report?tenantId=...&kind=weekly|biweekly|monthly&refDate=YYYY-MM-DD
  // Contrato fixo — ver hipertms_v12/docs/features/automation/t8-fechamento-endpoint-2026-07.md
  // (T9-ADENDO 2026-07-17 no doc do TMS: kind=weekly, refDate deve ser segunda-feira).
  // Erro/404/timeout → null + warn (NUNCA lança) — o scheduler trata null como
  // "não envia nada neste ciclo", permitindo deployar o Nexa antes do endpoint existir.
  async getClosingReport(
    externalTenantId: string,
    kind: 'weekly' | 'biweekly' | 'monthly',
    refDate: string,
  ): Promise<TmsClosingReport | null> {
    if (!this.configured) {
      this.logger.warn('getClosingReport: TMS não configurado');
      return null;
    }
    try {
      const url =
        `${this.baseUrl}/nexa/proactivity/closing-report` +
        `?tenantId=${encodeURIComponent(externalTenantId)}` +
        `&kind=${encodeURIComponent(kind)}` +
        `&refDate=${encodeURIComponent(refDate)}`;
      const res = await fetch(url, {
        headers: this.authHeader,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.logger.warn(`getClosingReport: TMS retornou ${res.status} (tenant=${externalTenantId}, kind=${kind}, refDate=${refDate})`);
        return null;
      }
      return (await res.json()) as TmsClosingReport;
    } catch (err: any) {
      this.logger.warn(`getClosingReport falhou (tenant=${externalTenantId}, kind=${kind}): ${err?.message}`);
      return null;
    }
  }

  // T8.2b — Visão do caixa (snapshot do dia, sem parâmetros de período).
  // Endpoint: GET /nexa/proactivity/cash-view?tenantId=...
  // Mesma regra de erro: null + warn, nunca lança — o bloco "💰 SEU CAIXA" some
  // do digest quando null, a mensagem de pendências sai normal (ver T8.6).
  async getCashView(externalTenantId: string): Promise<TmsCashView | null> {
    if (!this.configured) {
      this.logger.warn('getCashView: TMS não configurado');
      return null;
    }
    try {
      const url = `${this.baseUrl}/nexa/proactivity/cash-view?tenantId=${encodeURIComponent(externalTenantId)}`;
      const res = await fetch(url, {
        headers: this.authHeader,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.logger.warn(`getCashView: TMS retornou ${res.status} (tenant=${externalTenantId})`);
        return null;
      }
      return (await res.json()) as TmsCashView;
    } catch (err: any) {
      this.logger.warn(`getCashView falhou (tenant=${externalTenantId}): ${err?.message}`);
      return null;
    }
  }
}

// Shape do evento de proatividade retornado pelo TMS.
// Aguarda entrega do endpoint no TMS para validar — shape provisório compatível com o PRD.
export interface TmsProactivityEvent {
  id: string;
  severity: 'CRITICAL' | 'OVERDUE' | 'DUE_SOON' | 'INFO';
  // 2026-07-20: 'procurement' (Compras) — 5º setor, espelho do domínio novo do TMS.
  category: 'fiscal' | 'logistic' | 'frota' | 'finance' | 'procurement';
  title: string;
  description?: string;
  /** Phone of the sub-client admin to notify via WhatsApp (e.g. "5511999990001"). */
  adminPhone?: string;
  /** Display name of the admin (used in message greeting). */
  adminName?: string;
  /** Company/transportadora name (used in message context). */
  companyName?: string;
}

// T8.1 — Contrato fixo do TMS (não renomear campos — ver
// hipertms_v12/docs/features/automation/t8-fechamento-endpoint-2026-07.md).
// Margem NÃO vem no payload — derivada no Nexa (revenue - costs).
export interface TmsClosingReportPeriod {
  start: string;
  end: string;
  label: string;
}

export interface TmsClosingReport {
  period: TmsClosingReportPeriod;
  previous: TmsClosingReportPeriod;
  revenue: { current: number; previous: number };
  costs: { current: number; previous: number };
  sales: {
    quotesCreated: number;
    quotesConverted: number;
    conversionRate: number;
    avgTicket: { current: number; previous: number };
    shipmentsCreated: number;
    shipmentsCompleted: number;
  };
  cash: {
    receivedInPeriod: number;
    overdueOpenAmount: number;
    overdueOpenCount: number;
    delinquencyRate: number;
  };
  /** Omitido se caro de calcular (ver doc do TMS) — tratar como ausente. */
  highlights?: { topCustomer?: { name: string; revenue: number } };
  /** Só presente no caso kind=biweekly + refDate dia 1º (2ª quinzena + mês anterior completo). */
  monthSummary?: { revenue: number; costs: number };
}

// T8.2b — Contrato fixo do TMS para a visão do caixa. Saldo (inflow − outflow)
// NÃO vem no payload — derivado no Nexa.
export interface TmsCashView {
  inflow15d: { amount: number; count: number };
  outflow15d: { amount: number; count: number };
  overdueReceivable: { amount: number; count: number };
  unbilledCte: { amount: number; count: number };
  invoicedMonth: { amount: number };
  /**
   * T9-ADENDO (2026-07-17): resumo do DIA — campos ADICIONADOS ao contrato,
   * opcionais. TMS antigo (sem o adendo) não manda — o Nexa omite as duas
   * linhas correspondentes no bloco "💰 SEU CAIXA" (graceful degradation,
   * nunca quebra). Ver hipertms_v12/docs/features/automation/
   * t8-fechamento-endpoint-2026-07.md, ADENDO 2026-07-17, item B.
   */
  invoicedToday?: { amount: number; count: number };
  paidToday?: { amount: number; count: number };
  /**
   * T11 (2026-07-29): acumulado da SEMANA CORRENTE (segunda 00:00 → agora) —
   * campos ADICIONADOS ao contrato, opcionais. Mesma degradação graciosa dos
   * campos do adendo T9: TMS que não manda → o Nexa omite as duas linhas
   * `seg→X` do bloco de caixa, o resto sai igual.
   *
   * O ACUMULADO É CALCULADO PELO TMS, de propósito. Somar no Nexa a cada
   * digest parecia mais simples, mas perde o dia inteiro se o backend cair
   * (e o número fica errado em silêncio, que é o pior modo de falha). Aqui é
   * a mesma query de `invoicedMonth`/`invoicedToday` com outro recorte de data.
   *
   * ⚠️ `count` segue a semântica de `invoicedToday`: **faturas**
   * (`tenantFinanceInvoice` / `SALES_INVOICE`), NÃO CT-e — uma fatura pode
   * agrupar vários CT-e. Por isso o rótulo no digest é "Faturado", nunca
   * "CT-e". Ver hipertms_v12/application/proactivity/closing-report.service.ts
   * :420-431.
   */
  invoicedWeek?: { amount: number; count: number };
  paidWeek?: { amount: number; count: number };
}
