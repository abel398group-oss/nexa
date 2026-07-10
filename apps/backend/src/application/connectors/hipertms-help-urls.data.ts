// Mapeamento topic → URL da Central de Ajuda do HiperTMS.
// Atualizado em 2026-07-10 (K3): +4 topics K2 novos + fix 4 IDs ghost de relatórios.
// Topics sem artigo específico ficam ausentes — o fallback é HELP_BASE_URL.
export const HELP_BASE_URL = 'https://hipertms.com.br/ajuda';

export const HELP_URLS: Record<string, string> = {
  // ── Acesso ──────────────────────────────────────────────────────────────────
  'acesso-login':               'https://hipertms.com.br/ajuda/primeiros-passos/como-fazer-login',

  // ── Fiscal ──────────────────────────────────────────────────────────────────
  'cte-rejeicao':               'https://hipertms.com.br/ajuda/operacao/reemitir-cte',
  'cte-cancelamento':           'https://hipertms.com.br/ajuda/operacao/cte',
  'mdfe-problemas':             'https://hipertms.com.br/ajuda/operacao/encerrar-cancelar-mdfe',

  // ── Vendas ───────────────────────────────────────────────────────────────────
  'vendas-cotacoes':            'https://hipertms.com.br/ajuda/vendas/converter-cotacao',
  'cotacoes':                   'https://hipertms.com.br/ajuda/vendas/duplicar-cotacao',
  'vendas-embarques':           'https://hipertms.com.br/ajuda/vendas/criar-embarque',
  'embarques':                  'https://hipertms.com.br/ajuda/vendas/duplicar-embarque',
  'embarques-problemas':        'https://hipertms.com.br/ajuda/vendas/embarque-a-partir-de-xml',
  'vendas-oportunidades':       'https://hipertms.com.br/ajuda/vendas/funil-sdr',

  // ── Operação ─────────────────────────────────────────────────────────────────
  'operacao-cargas':            'https://hipertms.com.br/ajuda/operacao/programacao-cargas',
  'operacao-viagens':           'https://hipertms.com.br/ajuda/operacao/criar-viagem',
  'operacao-cte':               'https://hipertms.com.br/ajuda/operacao/cte',
  'operacao-mdfe':              'https://hipertms.com.br/ajuda/operacao/mdfe',
  'operacao-gnre':              'https://hipertms.com.br/ajuda/operacao/gnre',

  // ── Cadastros ────────────────────────────────────────────────────────────────
  'cadastros-problemas':        'https://hipertms.com.br/ajuda/cadastros/cadastrar-cliente',
  'cadastros-terceiros':        'https://hipertms.com.br/ajuda/cadastros/cadastrar-terceiro',
  'cadastros-empresas':         'https://hipertms.com.br/ajuda/cadastros/remetentes-destinatarios',

  // ── Frota ────────────────────────────────────────────────────────────────────
  'frota-problemas':            'https://hipertms.com.br/ajuda/frota/status-veiculo',
  'frota-veiculos':             'https://hipertms.com.br/ajuda/frota/status-veiculo',
  'frota-abastecimento':        'https://hipertms.com.br/ajuda/frota/aprovar-abastecimento',
  'frota-manutencao':           'https://hipertms.com.br/ajuda/frota/duplicar-manutencao',
  'frota-diarias':              'https://hipertms.com.br/ajuda/frota/registrar-diaria',

  // ── Financeiro ───────────────────────────────────────────────────────────────
  'financeiro-problemas':       'https://hipertms.com.br/ajuda/financeiro/fatura-tomador',
  'financeiro-contas':          'https://hipertms.com.br/ajuda/financeiro/registrar-conta-pagar',
  'financeiro-categorias':      'https://hipertms.com.br/ajuda/financeiro/plano-contas',
  'financeiro-bancario':        'https://hipertms.com.br/ajuda/financeiro/contas-bancarias',

  // ── Precificação ─────────────────────────────────────────────────────────────
  'precificacao-erros':         'https://hipertms.com.br/ajuda/precificacao/tipos-tabela',

  // ── Equipes ───────────────────────────────────────────────────────────────────
  'equipes-tarefas':            'https://hipertms.com.br/ajuda/equipes/criar-tarefa',
  'equipes-times':              'https://hipertms.com.br/ajuda/equipes/organizar-times',
  'equipes-notificacoes':       'https://hipertms.com.br/ajuda/equipes/notificacoes',

  // ── Compras ──────────────────────────────────────────────────────────────────
  'compras-pedidos':            'https://hipertms.com.br/ajuda/compras/pedido-compra',
  'compras-estoque':            'https://hipertms.com.br/ajuda/compras/consultar-estoque',
  'compras':                    'https://hipertms.com.br/ajuda/compras/duplicar-pedido-compra',

  // ── Administração ────────────────────────────────────────────────────────────
  'administracao-empresa':      'https://hipertms.com.br/ajuda/administracao/atualizar-empresa',
  'administracao-configuracoes':'https://hipertms.com.br/ajuda/administracao/parametros-automacao',
  'administracao-assinatura':   'https://hipertms.com.br/ajuda/administracao/assinatura',

  // ── Relatórios ───────────────────────────────────────────────────────────────
  // Artigos específicos por tipo de relatório não existem (hub único).
  'relatorios':                 'https://hipertms.com.br/ajuda/relatorios/hub-relatorios',
  'relatorios-financeiro':      'https://hipertms.com.br/ajuda/relatorios/hub-relatorios',
  'relatorios-logistica':       'https://hipertms.com.br/ajuda/relatorios/hub-relatorios',
  'relatorios-frota':           'https://hipertms.com.br/ajuda/relatorios/hub-relatorios',
  'relatorios-fiscal':          'https://hipertms.com.br/ajuda/relatorios/hub-relatorios',

  // ── FAQ / Navegação (K2) ─────────────────────────────────────────────────────
  // faq-geral cobre paleta Ctrl+K, fixados, criação rápida, chamado encerrado.
  // Aponta para busca global (popular: true) como ponto de entrada.
  'faq-geral':                  'https://hipertms.com.br/ajuda/primeiros-passos/busca-global',

  // cte-carta-correcao e certificado-digital: sem artigo específico → usa HELP_BASE_URL como fallback
};
