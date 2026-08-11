import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/shared/lib/api';
import { useAuth } from '@/app/providers/AuthContext';
import { HelpDrawer, HELP } from '@/components/HelpDrawer';
import { GuidedTour, TourStep } from '@/components/GuidedTour';
import { CommandPalette, Command } from '@/components/ui/CommandPalette';
import { DateRangeProvider } from '@/app/providers/DateRangeContext';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { Icon, type IconName } from '@/components/ui/icons';
import { TenantSelector } from '@/app/providers/TenantContext';
import { Button, Input, Modal } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';

const TOUR_STEPS: TourStep[] = [
  { selector: 'aside nav', title: 'Bem-vindo ao Nexa!', text: 'Este é o menu lateral — por aqui você navega entre todas as áreas do sistema.' },
  { selector: 'a[href="/inbox"]', title: 'Inbox', text: 'Atenda as conversas do WhatsApp em tempo real. A IA (Lia) sugere ou envia respostas.' },
  { selector: 'a[href="/campaigns"]', title: 'Disparo de Leads', text: 'Envie campanhas em massa com proteção anti-bloqueio (horário, limites, follow-up).' },
  { selector: 'a[href="/sellers"]', title: 'Vendedores', text: 'Cadastre sua equipe. Leads quentes são distribuídos e o vendedor é avisado no WhatsApp.' },
  { selector: '[data-tour="help"]', title: 'Ajuda em cada tela', text: 'Toda tela tem este botão com um manual + uma demonstração animada de como usar.' },
  { selector: '[data-tour="killswitch"]', title: 'Controle da IA', text: 'Ligue/desligue a resposta automática da Lia a qualquer momento (botão de pânico).' },
];

type NavItem = { to: string; label: string; ic: IconName; perm: string };
type NavGroup = { label: string | null; icon?: IconName; items: NavItem[] };

// Navegação agrupada em 3 serviços principais + suporte operacional.
const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [
    { to: '/dashboard', label: 'Painel', ic: 'dashboard', perm: 'dashboard' },
  ] },

  // ── Serviço 1: Vendas ──────────────────────────────────────────────────────
  { label: 'Vendas', icon: 'dollar', items: [
    // Primeiro item de propósito: é a tela onde o vendedor TRABALHA (F7 — RevOps).
    { to: '/fila',           label: 'Minha fila',        ic: 'zap',       perm: 'opportunities' },
    { to: '/inbox',          label: 'Inbox',             ic: 'inbox',     perm: 'inbox' },
    // F16: tirado do menu — o perfil do contato (empresa/dono da conta/histórico)
    // agora vive fixo no painel do Inbox. A tela continua em /contacts (import
    // CSV, tags, bloqueio em massa não têm equivalente lá ainda), só não é mais
    // o caminho do dia a dia.
    { to: '/opportunities',  label: 'Oportunidades',     ic: 'dollar',    perm: 'opportunities' },
    { to: '/campaigns',      label: 'Disparo',           ic: 'campaigns', perm: 'campaigns' },
      // Audiência do site fica ao lado do Disparo, não em 'Saúde dos números':
      // aquela tela é sessão do WAHA e risco de ban. A pergunta desta é 'a campanha
      // trouxe gente ao site?', e quem a faz é quem dispara.
      // 'Quem clicou' vem ANTES da audiência: audiência é número, esta é ação.
      { to: '/site/cliques',   label: 'Quem clicou',       ic: 'zap',  perm: 'campaigns' },
      { to: '/site/audiencia', label: 'Audiência do site', ic: 'eye', perm: 'campaigns' },
    { to: '/sender/health',  label: 'Saúde dos números', ic: 'pulse',     perm: 'campaigns' },
    { to: '/contacts/abuse', label: 'Números banidos',   ic: 'ban',       perm: 'contacts' },
    { to: '/sellers',        label: 'Vendedores',        ic: 'sellers',   perm: 'sellers' },
    { to: '/partners',       label: 'Parceiros',         ic: 'building',  perm: 'partners' },
    { to: '/playbook',       label: 'Playbook',          ic: 'playbook',  perm: 'ai_control' },
    // Mercados fica no fim do bloco de Vendas: é configuração de quem monta a
    // operação, não do dia a dia de quem dispara.
    // Mensagens é do dia a dia de quem dispara (perm campaigns); Mercados é de quem
    // monta a operação (perm settings).
    { to: '/messages',       label: 'Mensagens',         ic: 'mail',      perm: 'campaigns' },
    { to: '/markets',        label: 'Mercados',          ic: 'building',  perm: 'settings' },
    // Prospecção ativa (módulos 1-3). A ordem é a da esteira — quem chega novo entende
    // o fluxo lendo o menu de cima para baixo: sobe a lista, trabalha, fecha.
    // Listas fica sob `lead_batches` e não `campaigns`: importar cria contatos e
    // oportunidades, que é um poder diferente de disparar para quem já está na base.
    { to: '/lead-batches',   label: 'Listas de lead',    ic: 'contacts',  perm: 'lead_batches' },
    { to: '/roteiro',        label: 'Roteiro do SDR',    ic: 'playbook',  perm: 'settings' },
    { to: '/sdr',            label: 'Mesa do SDR',       ic: 'sellers',   perm: 'telemarketing' },
    { to: '/closer',         label: 'Hoje (closer)',     ic: 'zap',       perm: 'telemarketing' },
  ] },

  // ── Serviço 2: Suporte ─────────────────────────────────────────────────────
  { label: 'Suporte', icon: 'support', items: [
    { to: '/support',                  label: 'Inbox de Suporte', ic: 'support',   perm: 'inbox' },
    { to: '/support/dashboard',        label: 'Dashboard',        ic: 'dashboard', perm: 'dashboard' },
    { to: '/support/clients',          label: 'Clientes',         ic: 'contacts',  perm: 'inbox' },
    { to: '/support/config',           label: 'Configurações',    ic: 'bot',       perm: 'ai_control' },
    { to: '/settings/support-email',   label: 'E-mail de Suporte', ic: 'mail',    perm: 'admin' },
  ] },

  // ── Serviço 3: Monitoramento ───────────────────────────────────────────────
  { label: 'Monitoramento', icon: 'bell', items: [
    { to: '/settings/monitor', label: 'Monitor Proativo', ic: 'bell', perm: 'admin' },
  ] },

  // ── Suporte operacional ────────────────────────────────────────────────────
  { label: 'Conhecimento', icon: 'knowledge', items: [
    { to: '/knowledge', label: 'Base de Conhecimento', ic: 'knowledge', perm: 'knowledge' },
  ] },
  { label: 'Administração', icon: 'users', items: [
    { to: '/users',                   label: 'Usuários',        ic: 'users', perm: 'users' },
    { to: '/settings/email-channel',  label: 'Canal de E-mail', ic: 'mail',  perm: 'admin' },
  ] },
];

const titles: Record<string, string> = {
  '/dashboard': 'Painel',
  '/inbox': 'Inbox de Vendas',
  '/support': 'Inbox de Suporte',
  '/support/dashboard': 'Dashboard de Suporte',
  '/support/clients': 'Clientes',
  '/support/config': 'Config de Suporte',
  '/contacts': 'Contatos',
  '/knowledge': 'Base de Conhecimento',
  '/sellers': 'Vendedores',
  '/opportunities': 'Oportunidades',
  '/partners': 'Parceiros',
  '/fila': 'Minha fila',
  '/campaigns': 'Disparo de Leads',
  '/sender/health': 'Saúde dos números',
  '/contacts/abuse': 'Números banidos',
  '/playbook': 'Playbook de Vendas',
  '/users': 'Usuários & Acessos',
  '/settings/email-channel': 'Canal de E-mail',
  '/settings/support-email': 'E-mail de Suporte',
  '/settings/monitor': 'Monitor Proativo',
};

type AutonomyState = { master: boolean; whatsapp: boolean; email: boolean };

// Linha de toggle (interruptor) usada no painel de controle da Lia.
function ToggleRow({
  label, hint, on, disabled, busy, onClick,
}: { label: string; hint?: string; on: boolean; disabled?: boolean; busy?: boolean; onClick: () => void }) {
  const active = on && !disabled;
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      disabled={disabled || busy}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-base-100 disabled:opacity-50"
    >
      <span className="min-w-0" aria-hidden>
        <span className="block text-sm text-base-content">{label}</span>
        {hint && <span className="block text-[10px] text-base-content/45">{hint}</span>}
      </span>
      <span aria-hidden className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${active ? 'bg-brand-600' : 'bg-base-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

// Controle da Lia: master (botão de pânico) + por canal (WhatsApp / E-mail). ADR 012.
function KillSwitch() {
  const [st, setSt] = useState<AutonomyState | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/admin/autonomy')
      .then((r) => setSt({ master: r.data.master, whatsapp: r.data.whatsapp, email: r.data.email }))
      .catch(() => setSt(null));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function patch(p: Partial<AutonomyState>) {
    if (!st || busy) return;
    setBusy(true);
    try {
      const r = await api.post('/admin/autonomy', p);
      setSt({ master: r.data.master, whatsapp: r.data.whatsapp, email: r.data.email });
    } finally {
      setBusy(false);
    }
  }

  const masterOn = st?.master ?? false;

  return (
    <div ref={ref} className="relative" data-tour="killswitch">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={st === null}
        title="Controle da Lia (autonomia por canal)"
        aria-label="Controle da Lia — autonomia por canal"
        aria-haspopup="true"
        aria-expanded={open}
        className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors ${
          masterOn ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-base-300 bg-white text-base-content hover:bg-base-100'
        }`}
      >
        <Icon name="bot" className="h-4 w-4" aria-hidden />
        IA {st === null ? '...' : masterOn ? 'ON' : 'OFF'}
      </button>
      {open && st && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-base-200 bg-white p-1.5 shadow-elevated dark:bg-sidebar">
          <ToggleRow
            label="Autonomia da Lia"
            hint="Botão de pânico — desliga tudo"
            on={st.master}
            busy={busy}
            onClick={() => patch({ master: !st.master })}
          />
          <div className="my-1 border-t border-base-200" />
          <ToggleRow
            label="Lia no WhatsApp"
            on={st.whatsapp}
            disabled={!st.master}
            busy={busy}
            onClick={() => patch({ whatsapp: !st.whatsapp })}
          />
          <ToggleRow
            label="Lia no E-mail"
            on={st.email}
            disabled={!st.master}
            busy={busy}
            onClick={() => patch({ email: !st.email })}
          />
          {!st.master && (
            <p className="px-2.5 py-1 text-[10px] text-base-content/40">
              Autonomia geral desligada — nenhum canal responde até religar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Troca da própria senha — disponível para QUALQUER usuário logado, inclusive o
 * platform admin, que não aparece na tela de Usuários (ela filtra por tenant).
 * Exige a senha atual: navegador esquecido aberto não pode virar troca de dono.
 */
function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [busy, setBusy] = useState(false);

  function fechar() {
    setAtual(''); setNova(''); setConfirma('');
    onClose();
  }

  async function salvar() {
    if (nova.length < 8) { toast.error('A nova senha precisa ter pelo menos 8 caracteres.'); return; }
    if (nova !== confirma) { toast.error('A confirmação não confere com a nova senha.'); return; }
    setBusy(true);
    try {
      await api.post('/auth/password', { currentPassword: atual, newPassword: nova });
      toast.success('Senha alterada. As outras sessões foram encerradas.');
      fechar();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(', ') : m || 'Não foi possível trocar a senha.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={fechar} title="Trocar minha senha" size="sm">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-base-content/60">Senha atual</label>
          <Input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-base-content/60">Nova senha</label>
          <Input type="password" value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-base-content/60">Confirme a nova senha</label>
          <Input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" />
        </div>
        <p className="text-[11px] text-base-content/40">
          Ao trocar, os acessos abertos em outros dispositivos são encerrados. Você continua conectado aqui.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={fechar}>Cancelar</Button>
          <Button onClick={salvar} loading={busy} disabled={!atual || !nova || !confirma}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role === 'admin';
  const email = user?.email ?? '';
  const name = (user as any)?.name || email.split('@')[0] || 'Usuário';
  const initials = name.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Minha conta"
        aria-label={`Minha conta — ${name}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white transition-transform hover:scale-105"
      >
        <span aria-hidden>{initials}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-base-200 bg-white shadow-elevated dark:bg-sidebar">
          <div className="flex items-center gap-3 border-b border-base-200 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{initials}</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-base-content">{name}</div>
              <div className="truncate text-xs text-base-content/50">{email}</div>
            </div>
          </div>
          <div className="px-4 py-2 text-[11px] text-base-content/50">
            {isAdmin ? 'Administrador' : 'Vendedor'}
          </div>
          {/* Trocar a própria senha. Antes NÃO existia caminho nenhum na tela:
              a lista de Usuários é por tenant, e o platform admin fica fora de
              todos — nem a si mesmo conseguia editar. */}
          <button
            onClick={() => { setOpen(false); setPwOpen(true); }}
            className="flex w-full items-center gap-2 border-t border-base-200 px-4 py-2.5 text-left text-sm text-base-content/70 transition-colors hover:bg-base-100"
          >
            <Icon name="edit" className="h-4 w-4" /> Trocar minha senha
          </button>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 border-t border-base-200 px-4 py-2.5 text-left text-sm text-base-content/70 transition-colors hover:bg-base-100"
          >
            <Icon name="power" className="h-4 w-4" /> Sair
          </button>
        </div>
      )}
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function MoreMenu({ dark, onToggleTheme, onTour }: { dark: boolean; onToggleTheme: () => void; onTour: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Mais opções"
        aria-label="Mais opções"
        aria-haspopup="true"
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-base-content/60 transition-colors hover:bg-base-200"
      >
        <Icon name="dots" className="h-5 w-5" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-base-200 bg-white shadow-elevated dark:bg-sidebar">
          <button
            onClick={() => { onTour(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-base-content/70 transition-colors hover:bg-base-100"
          >
            <Icon name="help" className="h-4 w-4" /> Refazer tour
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const perms = user?.permissions ?? [];
  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => isAdmin || perms.includes(it.perm)) }))
    .filter((g) => g.items.length > 0);
  const visibleItems = visibleGroups.flatMap((g) => g.items);
  const pageTitle = titles[location.pathname] ?? 'Nexa';
  const [helpOpen, setHelpOpen] = useState(false);
  const hasHelp = !!HELP[location.pathname];
  const [tourOpen, setTourOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  // menu mobile off-canvas (desktop: sempre rail+hover, sem botão de fixar)
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // hover state do sidebar (desktop) — necessário para controlar collapse via JS
  const [sidebarHovered, setSidebarHovered] = useState(false);
  // sidebar "expandido" = mobile aberto OU hover no desktop
  const isExpandedMode = mobileNavOpen || sidebarHovered;
  // grupos colapsados/expandidos — persiste no localStorage
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nexa_nav_expanded') ?? 'null');
      if (Array.isArray(saved)) return new Set<string>(saved);
    } catch {}
    // default: abre o grupo da rota atual (ou Vendas se não encontrar)
    const active = NAV_GROUPS.find((g) => g.label && g.items.some((it) => location.pathname.startsWith(it.to)));
    return new Set<string>([active?.label ?? 'Vendas']);
  });

  function toggleGroup(label: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      localStorage.setItem('nexa_nav_expanded', JSON.stringify([...next]));
      return next;
    });
  }
  // command palette (Ctrl+K)
  const [cmdOpen, setCmdOpen] = useState(false);

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('nexa_theme', isDark ? 'dark' : 'light');
    setDark(isDark);
  }
  // atalho global Ctrl/Cmd+K abre a busca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // comandos: navegação pelas telas visíveis + ações rápidas
  // useMemo evita recriar o array (e re-render do CommandPalette) a cada render do Layout
  const commands: Command[] = useMemo(() => [
    ...visibleItems.map((it) => ({
      id: `nav:${it.to}`,
      label: it.label,
      icon: it.ic,
      hint: 'Ir para',
      keywords: it.perm,
      run: () => navigate(it.to),
    })),
    { id: 'act:theme', label: dark ? 'Tema claro' : 'Tema escuro', icon: (dark ? 'sun' : 'moon') as IconName, hint: 'Ação', run: toggleTheme },
    { id: 'act:tour', label: 'Refazer o tour', icon: 'help' as IconName, hint: 'Ação', run: () => setTourOpen(true) },
    { id: 'act:logout', label: 'Sair', icon: 'power' as IconName, hint: 'Ação', run: logout },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [visibleItems, dark]);

  // auto-expand o grupo quando a rota mudar para dentro dele
  useEffect(() => {
    const active = visibleGroups.find((g) => g.label && g.items.some((it) => location.pathname.startsWith(it.to)));
    if (active?.label && !expandedGroups.has(active.label)) {
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        next.add(active.label!);
        localStorage.setItem('nexa_nav_expanded', JSON.stringify([...next]));
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // tour automático na primeira vez
  useEffect(() => {
    if (!localStorage.getItem('nexa_tour_done')) {
      const t = setTimeout(() => setTourOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, []);
  function closeTour() {
    setTourOpen(false);
    localStorage.setItem('nexa_tour_done', '1');
  }

  return (
    <DateRangeProvider>
    <div className="h-full">
      {/* Skip link — WCAG 2.4.1: permite pular direto para o conteúdo principal */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-elevated focus:outline-none"
      >
        Ir para o conteúdo principal
      </a>

      {/* overlay mobile — fecha ao clicar fora */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 sm:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden
        />
      )}

      {/* ===== SIDEBAR — rail+hover no desktop / off-canvas no mobile ===== */}
      <aside
        aria-label="Navegação principal"
        className={`group/sb fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden bg-sidebar text-white/90 transition-all duration-200 ease-layout ${
          mobileNavOpen ? 'translate-x-0 w-60 shadow-elevated' : '-translate-x-full'
        } sm:translate-x-0 sm:w-16 sm:hover:w-60 sm:hover:shadow-elevated`}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        {/* marca: símbolo no rail, wordmark quando expandido (fixado ou hover) */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">N</span>
          <span className={`whitespace-nowrap text-base font-semibold tracking-tight text-white ${isExpandedMode ? 'inline' : 'hidden'}`}>Nexa</span>
        </div>

        {/* atalhos rápidos — sempre visíveis, ícone no rail / label no hover */}
        <div className="shrink-0 border-b border-white/10 px-2 py-2">
          {[
            { to: '/inbox', label: 'Inbox', ic: 'inbox' as IconName },
            { to: '/campaigns', label: 'Disparo', ic: 'campaigns' as IconName },
          ].map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              title={s.label}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                `relative flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors justify-center group-hover/sb:justify-start ${
                  isActive ? 'bg-white/[0.13] text-white' : 'text-white/55 hover:bg-white/[0.07] hover:text-white/90'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r bg-sidebar-accent" />}
                  <Icon name={s.ic} className={`h-4 w-4 shrink-0 ${isActive ? 'text-sidebar-accent' : ''}`} />
                  <span className={`truncate whitespace-nowrap text-xs ${isExpandedMode ? 'inline' : 'hidden'}`}>{s.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        <nav className="sidebar-scroll flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 py-2">
          {visibleGroups.map((g, gi) => {
            const isOpen = !g.label || !isExpandedMode || expandedGroups.has(g.label);
            return (
              <div key={gi} className={gi > 0 ? 'pt-2' : ''}>
                {/* Cabeçalho do grupo — visível apenas no modo expandido */}
                {g.label && (
                  <button
                    onClick={() => toggleGroup(g.label!)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Recolher' : 'Expandir'} grupo ${g.label}`}
                    className={`w-full flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors hover:bg-white/[0.07] ${isExpandedMode ? 'flex' : 'hidden'}`}
                  >
                    {g.icon && (
                      <Icon name={g.icon} className="h-4 w-4 shrink-0 text-white/50" aria-hidden />
                    )}
                    <span aria-hidden className="flex-1 text-left text-[11px] font-semibold uppercase tracking-wider text-white/40">
                      {g.label}
                    </span>
                    <Icon
                      name="chevronDown"
                      aria-hidden
                      className={`h-3.5 w-3.5 shrink-0 text-white/30 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
                    />
                  </button>
                )}
                {/* Items: sempre visíveis no rail, colapsáveis no modo expandido */}
                <div
                  className="overflow-hidden transition-all duration-200"
                  style={isExpandedMode ? { maxHeight: isOpen ? '20rem' : '0', opacity: isOpen ? 1 : 0 } : undefined}
                >
                  {g.items.map((it) => (
                    <NavLink
                      key={it.to}
                      to={it.to}
                      title={it.label}
                      onClick={() => setMobileNavOpen(false)}
                      className={({ isActive }) =>
                        `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isExpandedMode ? 'justify-start' : 'justify-center'
                        } ${
                          isActive ? 'bg-white/[0.13] text-white' : 'text-white/55 hover:bg-white/[0.07] hover:text-white/90'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-sidebar-accent" />
                          )}
                          <Icon name={it.ic} className={`h-5 w-5 shrink-0 ${isActive ? 'text-sidebar-accent' : ''}`} />
                          <span className={`truncate whitespace-nowrap ${isExpandedMode ? 'inline' : 'hidden'}`}>{it.label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* rodapé — só quando expandido (hover ou mobile) */}
        <div className={`shrink-0 border-t border-white/10 p-3 text-[11px] text-white/45 ${isExpandedMode ? 'block' : 'hidden'}`}>
          <div className="truncate">{user?.email}</div>
          <div className="mt-0.5 text-white/30">{isAdmin ? 'Administrador' : 'Vendedor'}</div>
        </div>
      </aside>

      {/* ===== COLUNA PRINCIPAL — sempre deslocada 4rem no desktop (sidebar é rail sobreposto) ===== */}
      <div className="flex h-full min-w-0 flex-col pl-0 sm:pl-16">
        {/* topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-base-200 px-4 sm:px-6" style={{ background: 'var(--surface)' }}>
          <div className="flex min-w-0 items-center gap-3">
            {/* hamburger — só no mobile */}
            <button
              onClick={() => setMobileNavOpen((o) => !o)}
              title="Menu"
              aria-label="Abrir menu"
              className="sm:hidden -ml-1 shrink-0 rounded-md p-1.5 text-base-content/60 transition-colors hover:bg-base-200"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <h1 className="truncate text-base font-semibold text-base-content">{pageTitle}</h1>
            {/* seletor de cliente/tenant — só aparece para o admin da plataforma */}
            <TenantSelector />
          </div>
          <div className="flex items-center gap-2">
            {location.pathname === '/dashboard' && <DateRangePicker />}
            {/* busca rápida — sempre visível */}
            <button
              onClick={() => setCmdOpen(true)}
              title="Busca rápida (Ctrl+K)"
              className="inline-flex h-8 items-center gap-2 rounded-md border border-base-300 bg-white px-3 text-xs font-medium text-base-content/60 transition-colors hover:bg-base-100"
            >
              <Icon name="search" className="h-4 w-4" /> Buscar
              <kbd className="rounded border border-base-300 bg-base-100 px-1 text-[10px] text-base-content/50">Ctrl K</kbd>
            </button>
            {/* ajuda contextual — só aparece quando existe */}
            {hasHelp && (
              <button
                onClick={() => setHelpOpen(true)}
                data-tour="help"
                title="Como usar esta tela"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-base-300 bg-white px-3 text-xs font-medium text-base-content transition-colors hover:bg-base-100"
              >
                <Icon name="help" className="h-4 w-4" /> Ajuda
              </button>
            )}
            {/* kill switch — visível para quem tem permissão */}
            {(isAdmin || perms.includes('ai_control')) && <KillSwitch />}
            {/* dark mode — sempre visível */}
            <button
              onClick={toggleTheme}
              title="Alternar tema claro/escuro"
              aria-label={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-base-content/60 transition-colors hover:bg-base-200"
            >
              <Icon name={dark ? 'sun' : 'moon'} className="h-[18px] w-[18px]" aria-hidden />
            </button>
            {/* notificações */}
            <NotificationBell />
            {/* menu secundário: tour */}
            <MoreMenu dark={dark} onToggleTheme={toggleTheme} onTour={() => setTourOpen(true)} />
            {/* avatar / conta */}
            <AccountMenu />
          </div>
        </header>
        {/* conteúdo — id="main-content" é o destino do skip link */}
        <div id="main-content" className="min-h-0 flex-1 overflow-auto" tabIndex={-1}>
          <Outlet />
        </div>
      </div>

      {helpOpen && <HelpDrawer pathname={location.pathname} onClose={() => setHelpOpen(false)} />}
      {tourOpen && <GuidedTour steps={TOUR_STEPS} onClose={closeTour} />}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} commands={commands} />
    </div>
    </DateRangeProvider>
  );
}
