/**
 * Playbooks determinísticos de suporte (ADR 017 / SKILL suporte).
 *
 * Cada playbook define:
 *  - `name`    : identificador (gravado no DiagnosticResult.playbook)
 *  - `steps`   : instruções sequenciais para o DiagnosticAgent seguir
 *  - `escalate`: palavras-chave que indicam escalonamento imediato
 *
 * Injetados no system prompt do DiagnosticAgent pela categoria do ticket.
 * Sem migration — configuração em código, fácil de manter.
 */

export interface SupportPlaybook {
  name: string;
  steps: string[];
  escalate?: string[];
}

/**
 * Mapa categoria → playbook.
 * Categorias derivadas de ADR 016 (CaseClassifierAgent).
 */
export const SUPPORT_PLAYBOOKS: Record<string, SupportPlaybook> = {

  // ── CT-e ────────────────────────────────────────────────────────────────────
  cte: {
    name: 'cte-rejeitado',
    steps: [
      '1. Identificar o código de rejeição na mensagem. Se ausente, pedir apenas "qual código de erro aparece no sistema?".',
      '2. Mapear código → causa: 562=CT-e já cancelado | 539=CFOP inválido para UF | 204=duplicidade de CT-e | 581=certificado digital inválido/expirado | 999=erro genérico SEFAZ.',
      '3. Se dados do TMS disponíveis (documentStatus/rejectionInfo), usar como prova — não inventar.',
      '4. Definir causa-raiz e suggestedAction com base no mapeamento acima.',
      '5. Se código 581 ou certificado mencionado: causa = "certificado_vencido", suggestedAction = "Renove o certificado PFX em Configurações → Fiscal → Certificados".',
      '6. Se código desconhecido ou erro de sistema (999): marcar confidence=low e questionar o XML/log.',
    ],
    escalate: ['perda financeira', 'fisco', 'autuação', 'multa', 'script java', 'bug reproduzível'],
  },

  // ── MDF-e ───────────────────────────────────────────────────────────────────
  mdfe: {
    name: 'mdfe-encerramento',
    steps: [
      '1. Verificar se o problema é emissão ou encerramento do MDF-e.',
      '2. MDF-e não encerrado: causa = "mdfe_nao_encerrado", suggestedAction = "Abra a viagem, acesse o MDF-e e use a opção Encerrar (informe UF e município de encerramento)."',
      '3. MDF-e rejeitado: aplicar a mesma lógica de rejeição SEFAZ do playbook CT-e.',
      '4. MDF-e pendente: orientar a usar a lista de MDF-e não encerrados para identificar pendências.',
      '5. Se a viagem já foi encerrada antes de encerrar o MDF-e: orientar a encerrar manualmente pelo painel.',
    ],
    escalate: ['interestadual bloqueado', 'fiscalização', 'auto de infração'],
  },

  // ── Fiscal / Certificado ─────────────────────────────────────────────────────
  fiscal: {
    name: 'certificado-fiscal',
    steps: [
      '1. Identificar se é certificado vencido (erro 581, mensagem de certificado inválido) ou ambiente errado (homologação vs produção).',
      '2. Certificado vencido: causa = "certificado_pfx_vencido", suggestedAction = "Acesse Configurações → Fiscal → Certificados → faça upload do novo PFX (A1) e informe a senha. Defina o ambiente (Produção ou Homologação)."',
      '3. Ambiente errado: orientar a verificar se o ambiente está configurado como PRODUCAO (emissão real) ou HOMOLOGACAO (testes).',
      '4. Problemas de conectividade SEFAZ (timeout/fora do ar): causa = "sefaz_indisponivel", orientar aguardar e testar status de conectividade no painel fiscal.',
      '5. Se após renovar o certificado ainda houver erro: marcar confidence=low e escalar para suporte fiscal.',
    ],
    escalate: ['a3', 'token usb', 'smartcard', 'driver', 'sistema operacional'],
  },

  // ── Precificação / Frete ─────────────────────────────────────────────────────
  precificacao: {
    name: 'frete-calculo',
    steps: [
      '1. Verificar se é preço errado, desatualizado ou contrato não aplicado.',
      '2. Preço desatualizado / stale: causa = "materializacao_desatualizada", suggestedAction = "Rode a recalcular/materialização em Precificação → Tabelas para atualizar os artefatos."',
      '3. Contrato não aplicado: causa = "contrato_cliente_incompativel", orientar checar se o contrato está ATIVO e se a rota é compatível (check-route no contrato).',
      '4. Modalidade errada (FCL vs LCL): orientar verificar a modalidade selecionada no embarque.',
      '5. Se o problema persistir após materialização: marcar confidence=low, pedir a análise crítica (breakdown) para entender de onde vem o valor.',
    ],
    escalate: ['erro de sistema', 'bug no cálculo', 'preço infinito'],
  },

  // ── Treinamento / Como faço ──────────────────────────────────────────────────
  treinamento: {
    name: 'duvida-operacional',
    steps: [
      '1. Identificar o módulo/funcionalidade sobre o qual é a dúvida.',
      '2. NÃO buscar dados reais do TMS — resposta é puramente conceitual (KB).',
      '3. Causa = "duvida_operacional", confidence = "high", needsMoreInfo = false (a menos que o módulo seja ambíguo).',
      '4. suggestedAction = resposta direta com o caminho de menus exato, quando disponível na KB.',
      '5. Se a dúvida aparecer repetidamente (cliente pede ajuda no mesmo tema): apontar candidato KB.',
    ],
    escalate: [],
  },

  // ── Financeiro ───────────────────────────────────────────────────────────────
  financeiro: {
    name: 'financeiro-operacional',
    steps: [
      '1. Identificar se é: conta não criada, conta vencida, fatura não gerada, abastecimento/diária não convertida.',
      '2. Conta não criada manualmente: causa = "conta_precisa_de_fatura", orientar que contas são criadas via FATURA — não diretamente.',
      '3. Abastecimento sem conta a pagar: causa = "abastecimento_nao_aprovado", orientar que a conta só é gerada após aprovação e conversão do abastecimento.',
      '4. Conta vencida: orientar usar filtro "somente vencidas" no módulo Financeiro.',
      '5. Problema de saldo ou inconsistência: marcar confidence=low, escalar para suporte financeiro.',
    ],
    escalate: ['perda financeira', 'cobrança indevida', 'estorno', 'cancelar assinatura'],
  },

  // ── Frota ────────────────────────────────────────────────────────────────────
  frota: {
    name: 'frota-operacional',
    steps: [
      '1. Identificar se é cadastro de veículo, motorista, manutenção ou abastecimento.',
      '2. Erro ao cadastrar veículo: causa = "campo_consumo_zerado", orientar preencher consumo médio km/L (obrigatório, >0).',
      '3. Alerta de CNH vencendo: causa = "cnh_vencendo", orientar consultar lista de "carteiras vencendo" em Frota → Motoristas.',
      '4. Abastecimento não virou conta: causa = "abastecimento_nao_aprovado", mesmo fluxo do playbook financeiro.',
      '5. Motorista não pode ser alocado: verificar se está ativo e sem CNH vencida.',
    ],
    escalate: ['bug', 'tela travada', 'erro 500'],
  },

  // ── Erro de sistema / Bug ────────────────────────────────────────────────────
  bug: {
    name: 'bug-sistema',
    steps: [
      '1. Coletar: (a) o que o cliente estava fazendo, (b) tela/módulo exato, (c) mensagem de erro ou código HTTP se houver.',
      '2. Se o cliente já tem esses dados: tentar correlacionar com KB conhecida.',
      '3. Sempre pedir: "Consegue reproduzir? Em qual navegador?"',
      '4. Bug com reprodução: confidence=low, escalar (needsMoreInfo = false pois já temos o suficiente).',
      '5. Comportamento inesperado sem erro claro: orientar Ctrl+F5, sair/entrar, testar no Chrome.',
    ],
    escalate: ['erro 500', 'não abre', 'tela branca', 'travou', 'loop', 'perda de dados'],
  },

  // ── Acesso / Usuários ─────────────────────────────────────────────────────────
  acesso: {
    name: 'acesso-usuario',
    steps: [
      '1. Esqueceu senha: causa = "senha_esquecida", orientar usar "esqueci minha senha" na tela de login.',
      '2. Acesso negado a módulo: causa = "permissao_insuficiente", orientar Administrador da empresa ir em Administração → Perfis → ajustar permissões do perfil.',
      '3. Limite de usuários atingido: verificar plano contratado e número de usuários cadastrados.',
      '4. NUNCA pedir senha ou dados de login ao cliente — o acesso é redefinido pelo próprio sistema.',
    ],
    escalate: ['conta hackeada', 'acesso não autorizado', 'segurança'],
  },

  // ── Cadastro ─────────────────────────────────────────────────────────────────
  // F11 (auditoria KB 2026-08-06): antes caía no genérico de treinamento
  // ("não busque dado real do TMS"), mesmo a KB já tendo artigos específicos
  // de cadastro (CNPJ duplicado, importação de terceiros). Playbook próprio
  // direciona pra esses artigos em vez do fallback conceitual.
  cadastro: {
    name: 'cadastro-registros',
    steps: [
      '1. Identificar o que está sendo cadastrado: empresa/cliente, terceiro (fornecedor/parceiro), veículo, motorista ou usuário.',
      '2. CNPJ duplicado: causa = "cnpj_ja_cadastrado", orientar buscar o cadastro existente (o sistema não permite duplicidade de CNPJ) em vez de tentar recriar.',
      '3. Erro na importação em lote de terceiros: causa = "importacao_formato_invalido", orientar conferir o formato da planilha/CSV contra o modelo esperado pelo sistema.',
      '4. Campo obrigatório vazio impedindo salvar: identificar qual campo pelo texto do erro e orientar preenchê-lo — não adivinhar qual é sem a mensagem de erro exata.',
      '5. Se o dado já existe mas não aparece na busca: pode ser filtro de status (inativo) escondendo o registro — orientar limpar filtros antes de concluir que não existe.',
    ],
    escalate: ['duplicidade não resolvida', 'dado sumiu', 'cadastro corrompido'],
  },

  // ── Integrações (ERP, parceiros, webhooks) ──────────────────────────────────
  // F11: categoria existia no classificador sem NENHUM playbook nem artigo de
  // KB — a Lia só conseguia escalar, nunca diagnosticar. Playbook estruturado
  // pra pelo menos separar autenticação/payload/disponibilidade antes de
  // escalar, mesmo sem leitura em tempo real disponível ainda no connector.
  integracoes: {
    name: 'integracao-diagnostico',
    steps: [
      '1. Classificar o sintoma em um dos três baldes: (a) autenticação (401/403, token inválido/expirado), (b) payload/dado (webhook chegou mas com campo errado/faltando), (c) disponibilidade (webhook não chega, timeout).',
      '2. Autenticação: causa = "token_invalido_ou_expirado", orientar gerar/renovar o token de API em Administração → Integrações → API.',
      '3. Payload/dado: pedir o payload exato recebido (ou o erro retornado) — não adivinhar o formato esperado sem a mensagem de erro.',
      '4. Disponibilidade (webhook não chega): causa = "webhook_sem_eventos", orientar conferir se a URL de destino está correta e respondendo 2xx, e se o evento esperado está na lista de eventos assinados.',
      '5. Sem dado concreto (código de erro, payload, horário da falha): needsMoreInfo=true, pedir esses três itens antes de diagnosticar.',
      '6. Não há leitura em tempo real do status da integração disponível hoje — não afirmar que "está tudo certo do lado do TMS" sem confirmação; quando faltar certeza, confidence=low.',
    ],
    escalate: ['perda de dado', 'cobrança duplicada', 'produção afetada', 'cliente final impactado'],
  },

  // ── API (uso direto, fora do fluxo de integração de parceiro) ───────────────
  api: {
    name: 'api-uso',
    steps: [
      '1. Identificar se a dúvida é sobre AUTENTICAÇÃO (como gerar/usar token), LIMITE (rate limit) ou AMBIENTE (sandbox vs produção).',
      '2. Autenticação: orientar gerar o token em Administração → Integrações → API e enviá-lo no header Authorization.',
      '3. Erro 401/403: causa = "token_invalido_ou_expirado" — mesma orientação do playbook de integrações.',
      '4. Erro 429 ou menção a "limite"/"rate limit": causa = "rate_limit_atingido", orientar reduzir a frequência de chamadas e revisar se há retry sem backoff no lado do cliente.',
      '5. Confusão entre sandbox e produção (dado de teste não aparece em produção ou vice-versa): causa = "ambiente_trocado", orientar confirmar qual ambiente está sendo usado nas credenciais.',
      '6. Erro HTTP não coberto acima (500, timeout): needsMoreInfo=true, pedir o código de status e o corpo da resposta de erro.',
    ],
    escalate: ['produção afetada', 'chave vazada', 'acesso não autorizado'],
  },
};

/**
 * Aliases: CaseClassifier usa nomes diferentes dos playbooks em alguns casos.
 * Este mapa normaliza antes de buscar, evitando playbooks mortos.
 * Ex.: classifier emite "frete" → playbook está em "precificacao".
 */
const CATEGORY_ALIASES: Record<string, string> = {
  frete:        'precificacao',   // CaseClassifier: frete → Playbook: precificacao
  usuarios:     'acesso',         // CaseClassifier: usuarios → Playbook: acesso
  erro_sistema: 'bug',            // CaseClassifier: erro_sistema → Playbook: bug
};

/** Retorna o playbook para a categoria (com alias automático), ou undefined se não houver. */
export function getPlaybook(category: string): SupportPlaybook | undefined {
  const resolved = CATEGORY_ALIASES[category] ?? category;
  return SUPPORT_PLAYBOOKS[resolved];
}
