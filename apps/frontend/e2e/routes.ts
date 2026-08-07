/**
 * Todas as rotas do app, extraídas de src/app/App.tsx.
 *
 * Não é uma lista escrita à mão e esquecida: `full-app-scan.spec.ts` tem um
 * teste que lê o App.tsx e falha se aparecer um `path=` que não esteja aqui.
 * Rota nova sem cobertura quebra a suíte em vez de passar despercebida.
 */
export type Rota = {
  path: string;
  nome: string;
  /** Pública = não exige sessão. */
  publica?: boolean;
  /** Só existe em dev (import.meta.env.DEV). */
  somenteDev?: boolean;
  /** Redireciona — não renderiza tela própria. */
  redireciona?: boolean;
  /** Trecho que precisa aparecer na tela (prova de que renderizou o conteúdo certo). */
  esperaTexto?: RegExp;
  /**
   * Status HTTP de /api tolerados nesta rota além dos 2xx/3xx.
   * 401 em tela pública é esperado: o app pergunta "quem sou eu" antes de saber
   * que ninguém está logado.
   */
  apiToleradas?: number[];
};

export const ROTAS: Rota[] = [
  // ── Públicas ──────────────────────────────────────────────────────────────
  { path: '/',                nome: 'Raiz (redirect)',      publica: true, redireciona: true, apiToleradas: [401] },
  { path: '/landing',         nome: 'Landing',              publica: true, esperaTexto: /TMS|frete|Criar conta/i, apiToleradas: [401] },
  { path: '/login',           nome: 'Login',                publica: true, esperaTexto: /Entrar|Email|Senha/i, apiToleradas: [401] },
  { path: '/redefinir-senha', nome: 'Redefinir senha',      publica: true, esperaTexto: /senha/i, apiToleradas: [400, 401] },
  { path: '/portal',          nome: 'Portal do cliente',    publica: true, esperaTexto: /.+/, apiToleradas: [401, 403] },

  // ── Área autenticada ──────────────────────────────────────────────────────
  { path: '/inbox',                   nome: 'Inbox de Vendas',      esperaTexto: /Inbox|Conversas/i },
  { path: '/dashboard',               nome: 'Painel',               esperaTexto: /.+/ },
  { path: '/support',                 nome: 'Inbox de Suporte',     esperaTexto: /Suporte|Conversas/i },
  { path: '/support/dashboard',       nome: 'Dashboard de Suporte', esperaTexto: /.+/ },
  { path: '/support/config',          nome: 'Config de Suporte',    esperaTexto: /.+/ },
  { path: '/support/clients',         nome: 'Clientes (Suporte)',   esperaTexto: /Clientes/i },
  { path: '/contacts',                nome: 'Contatos',             esperaTexto: /Contato/i },
  { path: '/contacts/abuse',          nome: 'Números banidos',      esperaTexto: /.+/ },
  { path: '/knowledge',               nome: 'Base de Conhecimento', esperaTexto: /Conhecimento|Base/i },
  { path: '/opportunities',           nome: 'Oportunidades',        esperaTexto: /Oportunidade/i },
  { path: '/partners',                nome: 'Parceiros',            esperaTexto: /Parceiro/i },
  { path: '/fila',                    nome: 'Minha fila',           esperaTexto: /fila/i },
  { path: '/sellers',                 nome: 'Vendedores',           esperaTexto: /Vendedor/i },
  { path: '/campaigns',               nome: 'Disparo de Leads',     esperaTexto: /Disparo|Campanha/i },
  { path: '/sender/health',           nome: 'Saúde dos números',    esperaTexto: /número|saúde/i },
  { path: '/users',                   nome: 'Usuários',             esperaTexto: /Usuário/i },
  { path: '/playbook',                nome: 'Playbook',             esperaTexto: /Playbook/i },
  { path: '/settings/email-channel',  nome: 'Canal de E-mail',      esperaTexto: /E-?mail/i },
  { path: '/settings/support-email',  nome: 'E-mail de Suporte',    esperaTexto: /E-?mail/i },
  { path: '/settings/monitor',        nome: 'Monitor Proativo',     esperaTexto: /Monitor/i },
  { path: '/dev/tokens',              nome: 'Dev Tokens',           somenteDev: true, esperaTexto: /.+/ },
];

/** Rota inexistente: o App manda pra /inbox via `path="*"`. */
export const ROTA_INEXISTENTE = '/rota-que-nao-existe-12345';
