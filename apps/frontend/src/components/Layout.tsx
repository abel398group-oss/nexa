import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { HelpDrawer, HELP } from '@/components/HelpDrawer';
import { GuidedTour, TourStep } from '@/components/GuidedTour';
import { CommandPalette, Command } from '@/components/ui/CommandPalette';
import { DateRangeProvider } from '@/contexts/DateRangeContext';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { NotificationBell } from '@/components/ui/NotificationBell';

const TOUR_STEPS: TourStep[] = [
  { selector: 'aside nav', title: 'Bem-vindo ao Nexa! 👋', text: 'Este é o menu lateral — por aqui você navega entre todas as áreas do sistema.' },
  { selector: 'a[href="/inbox"]', title: 'Inbox', text: 'Atenda as conversas do WhatsApp em tempo real. A IA (Lia) sugere ou envia respostas.' },
  { selector: 'a[href="/campaigns"]', title: 'Disparo de Leads', text: 'Envie campanhas em massa com proteção anti-bloqueio (horário, limites, follow-up).' },
  { selector: 'a[href="/sellers"]', title: 'Vendedores', text: 'Cadastre sua equipe. Leads quentes são distribuídos e o vendedor é avisado no WhatsApp.' },
  { selector: '[data-tour="help"]', title: 'Ajuda em cada tela', text: 'Toda tela tem este botão com um manual + uma demonstração animada de como usar.' },
  { selector: '[data-tour="killswitch"]', title: 'Controle da IA', text: 'Ligue/desligue a resposta automática da Lia a qualquer momento (botão de pânico).' },
];

const items = [
  { to: '/dashboard', label: 'Painel', icon: '📊', perm: 'dashboard' },
  { to: '/inbox', label: 'Inbox', icon: '💬', perm: 'inbox' },
  { to: '/support', label: 'Suporte', icon: '🛠️', perm: 'inbox' },
  { to: '/contacts', label: 'Contatos', icon: '👥', perm: 'contacts' },
  { to: '/knowledge', label: 'Conhecimento', icon: '📚', perm: 'knowledge' },
  { to: '/sellers', label: 'Vendedores', icon: '🧑‍💼', perm: 'sellers' },
  { to: '/campaigns', label: 'Disparo', icon: '📣', perm: 'campaigns' },
  { to: '/playbook', label: 'Playbook IA', icon: '🎯', perm: 'ai_control' },
  { to: '/users', label: 'Usuários', icon: '🔐', perm: 'users' },
  { to: '/settings/email-channel', label: 'Canal de E-mail', icon: '✉️', perm: 'admin' },
];

const titles: Record<string, string> = {
  '/dashboard': 'Painel',
  '/inbox': 'Inbox',
  '/support': 'Suporte',
  '/contacts': 'Contatos',
  '/knowledge': 'Base de Conhecimento',
  '/sellers': 'Vendedores',
  '/campaigns': 'Disparo de Leads',
  '/playbook': 'Playbook de Vendas',
  '/users': 'Usuários & Acessos',
  '/settings/email-channel': 'Canal de E-mail',
};

function KillSwitch() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/autonomy').then((r) => setOn(r.data.autonomyEnabled)).catch(() => setOn(null));
  }, []);

  async function toggle() {
    if (on === null) return;
    setBusy(true);
    try {
      const r = await api.post('/admin/autonomy', { enabled: !on });
      setOn(r.data.autonomyEnabled);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy || on === null}
      data-tour="killswitch"
      title="Kill switch — autonomia da IA (auto-resposta)"
      className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors ${
        on ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-base-300 bg-white text-base-content hover:bg-base-100'
      }`}
    >
      <span>{on ? '🤖' : '⏸️'}</span>
      IA {on === null ? '...' : on ? 'ON' : 'OFF'}
    </button>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
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
        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white transition-transform hover:scale-105"
      >
        {initials}
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
            {isAdmin ? '👑 Administrador' : '🧑‍💼 Vendedor'}
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 border-t border-base-200 px-4 py-2.5 text-left text-sm text-base-content/70 transition-colors hover:bg-base-100"
          >
            ⏻ Sair
          </button>
        </div>
      )}
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
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-base-content/60 transition-colors hover:bg-base-200"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-base-200 bg-white shadow-elevated dark:bg-sidebar">
          <button
            onClick={() => { onTour(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-base-content/70 transition-colors hover:bg-base-100"
          >
            🎓 Refazer tour
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
  const visibleItems = items.filter((it) => isAdmin || perms.includes(it.perm));
  const pageTitle = titles[location.pathname] ?? 'Nexa';
  const [helpOpen, setHelpOpen] = useState(false);
  const hasHelp = !!HELP[location.pathname];
  const [tourOpen, setTourOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  // sidebar retrátil (estado salvo)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('nexa_sidebar_collapsed') === '1');
  // command palette (Ctrl+K)
  const [cmdOpen, setCmdOpen] = useState(false);

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('nexa_theme', isDark ? 'dark' : 'light');
    setDark(isDark);
  }
  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem('nexa_sidebar_collapsed', c ? '0' : '1');
      return !c;
    });
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
      icon: it.icon,
      hint: 'Ir para',
      keywords: it.perm,
      run: () => navigate(it.to),
    })),
    { id: 'act:theme', label: dark ? 'Tema claro' : 'Tema escuro', icon: dark ? '☀️' : '🌙', hint: 'Ação', run: toggleTheme },
    { id: 'act:tour', label: 'Refazer o tour', icon: '🎓', hint: 'Ação', run: () => setTourOpen(true) },
    { id: 'act:collapse', label: collapsed ? 'Expandir menu' : 'Recolher menu', icon: '↔️', hint: 'Ação', run: toggleCollapsed },
    { id: 'act:logout', label: 'Sair', icon: '⏻', hint: 'Ação', run: logout },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [visibleItems, dark, collapsed]);

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
    <div className="flex h-full">
      {/* ===== SIDEBAR larga (midnight enterprise) ===== */}
      <aside
        style={{ width: collapsed ? '4rem' : '15rem', minWidth: collapsed ? '4rem' : '15rem' }}
        className="flex shrink-0 flex-col overflow-hidden bg-sidebar text-white/90 transition-[width,min-width] duration-200 ease-in-out"
      >
        <div className={`flex h-14 items-center ${collapsed ? 'justify-center px-0' : 'gap-2 px-5'}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">N</span>
          {!collapsed && <span className="text-base font-semibold tracking-tight text-white">Nexa</span>}
        </div>
        {!collapsed && (
          <div className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">Menu</div>
        )}
        <nav className={`flex-1 space-y-0.5 ${collapsed ? 'px-2 pt-2' : 'px-2'}`}>
          {visibleItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              title={collapsed ? it.label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center rounded-lg py-2 text-sm font-medium transition-colors ${
                  collapsed ? 'justify-center px-0' : 'gap-3 px-3'
                } ${
                  isActive
                    ? 'bg-white/[0.13] text-white'
                    : 'text-white/55 hover:bg-white/[0.07] hover:text-white/90'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-sidebar-accent" />
                  )}
                  <span className="text-base">{it.icon}</span>
                  {!collapsed && <span className="truncate">{it.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        {/* botão recolher/expandir */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className={`mx-2 mb-1 flex items-center rounded-lg py-2 text-sm font-medium text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white/90 ${
            collapsed ? 'justify-center px-0' : 'gap-3 px-3'
          }`}
        >
          <span className="text-base">{collapsed ? '»' : '«'}</span>
          {!collapsed && <span>Recolher</span>}
        </button>
        {!collapsed && (
          <div className="border-t border-white/10 p-3 text-[11px] text-white/45">
            {user?.email}
            <div className="mt-0.5 text-white/30">{isAdmin ? 'Administrador' : 'Vendedor'}</div>
          </div>
        )}
      </aside>

      {/* ===== COLUNA PRINCIPAL ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-base-200 px-6" style={{ background: 'var(--surface)' }}>
          <h1 className="text-base font-semibold text-base-content">{pageTitle}</h1>
          <div className="flex items-center gap-2">
            {location.pathname === '/dashboard' && <DateRangePicker />}
            {/* busca rápida — sempre visível */}
            <button
              onClick={() => setCmdOpen(true)}
              title="Busca rápida (Ctrl+K)"
              className="inline-flex h-8 items-center gap-2 rounded-md border border-base-300 bg-white px-3 text-xs font-medium text-base-content/60 transition-colors hover:bg-base-100"
            >
              🔍 Buscar
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
                ? Ajuda
              </button>
            )}
            {/* kill switch — visível para quem tem permissão */}
            {(isAdmin || perms.includes('ai_control')) && <KillSwitch />}
            {/* dark mode — sempre visível */}
            <button
              onClick={toggleTheme}
              title="Alternar tema claro/escuro"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-base-content/60 transition-colors hover:bg-base-200"
            >
              {dark ? '☀️' : '🌙'}
            </button>
            {/* notificações */}
            <NotificationBell />
            {/* menu secundário: tour */}
            <MoreMenu dark={dark} onToggleTheme={toggleTheme} onTour={() => setTourOpen(true)} />
            {/* avatar / conta */}
            <AccountMenu />
          </div>
        </header>
        {/* conteúdo */}
        <div className="min-h-0 flex-1 overflow-auto">
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
