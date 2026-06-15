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
import { Icon, type IconName } from '@/components/ui/icons';
import { TenantSelector } from '@/contexts/TenantContext';

const TOUR_STEPS: TourStep[] = [
  { selector: 'aside nav', title: 'Bem-vindo ao Nexa!', text: 'Este é o menu lateral — por aqui você navega entre todas as áreas do sistema.' },
  { selector: 'a[href="/inbox"]', title: 'Inbox', text: 'Atenda as conversas do WhatsApp em tempo real. A IA (Lia) sugere ou envia respostas.' },
  { selector: 'a[href="/campaigns"]', title: 'Disparo de Leads', text: 'Envie campanhas em massa com proteção anti-bloqueio (horário, limites, follow-up).' },
  { selector: 'a[href="/sellers"]', title: 'Vendedores', text: 'Cadastre sua equipe. Leads quentes são distribuídos e o vendedor é avisado no WhatsApp.' },
  { selector: '[data-tour="help"]', title: 'Ajuda em cada tela', text: 'Toda tela tem este botão com um manual + uma demonstração animada de como usar.' },
  { selector: '[data-tour="killswitch"]', title: 'Controle da IA', text: 'Ligue/desligue a resposta automática da Lia a qualquer momento (botão de pânico).' },
];

type NavItem = { to: string; label: string; ic: IconName; perm: string };
type NavGroup = { label: string | null; items: NavItem[] };

// Navegação agrupada (padrão HiperTMS: Grupo → Item). Grupo sem label = item solto no topo.
const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [
    { to: '/dashboard', label: 'Painel', ic: 'dashboard', perm: 'dashboard' },
  ] },
  { label: 'Vendas', items: [
    { to: '/inbox', label: 'Inbox de Vendas', ic: 'inbox', perm: 'inbox' },
    { to: '/contacts', label: 'Contatos', ic: 'contacts', perm: 'contacts' },
    { to: '/campaigns', label: 'Disparo', ic: 'campaigns', perm: 'campaigns' },
    { to: '/sender/health', label: 'Saúde dos números', ic: 'pulse', perm: 'campaigns' },
    { to: '/sellers', label: 'Vendedores', ic: 'sellers', perm: 'sellers' },
    { to: '/playbook', label: 'Playbook de Vendas', ic: 'playbook', perm: 'ai_control' },
  ] },
  { label: 'Suporte', items: [
    { to: '/support', label: 'Inbox de Suporte', ic: 'support', perm: 'inbox' },
    { to: '/support/config', label: 'Config de Suporte', ic: 'bot', perm: 'ai_control' },
  ] },
  { label: 'Conhecimento', items: [
    { to: '/knowledge', label: 'Base de Conhecimento', ic: 'knowledge', perm: 'knowledge' },
  ] },
  { label: 'Administração', items: [
    { to: '/users', label: 'Usuários', ic: 'users', perm: 'users' },
    { to: '/settings/email-channel', label: 'Canal de E-mail', ic: 'mail', perm: 'admin' },
  ] },
];

const titles: Record<string, string> = {
  '/dashboard': 'Painel',
  '/inbox': 'Inbox de Vendas',
  '/support': 'Inbox de Suporte',
  '/support/config': 'Config de Suporte',
  '/contacts': 'Contatos',
  '/knowledge': 'Base de Conhecimento',
  '/sellers': 'Vendedores',
  '/campaigns': 'Disparo de Leads',
  '/sender/health': 'Saúde dos números',
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
      <Icon name="bot" className="h-4 w-4" />
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
            {isAdmin ? 'Administrador' : 'Vendedor'}
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 border-t border-base-200 px-4 py-2.5 text-left text-sm text-base-content/70 transition-colors hover:bg-base-100"
          >
            <Icon name="power" className="h-4 w-4" /> Sair
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
        <Icon name="dots" className="h-5 w-5" />
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
  // menu lateral: fixar/recolher (empurra o conteúdo, não sobrepõe). Persistido.
  const [navOpen, setNavOpen] = useState(() => localStorage.getItem('nexa_nav_open') === '1');
  function toggleNav() {
    setNavOpen((o) => {
      localStorage.setItem('nexa_nav_open', o ? '0' : '1');
      return !o;
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
      {/* ===== SIDEBAR (midnight) — fixada (empurra) OU expande no hover (sobreposto) ===== */}
      <aside
        className={`group/sb fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden bg-sidebar text-white/90 transition-[width] duration-200 ease-layout ${
          navOpen ? 'w-60' : 'w-16 hover:w-60 hover:shadow-elevated'
        }`}
      >
        {/* marca: símbolo no rail, wordmark quando expandido (fixado ou hover) */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">N</span>
          <span className={`whitespace-nowrap text-base font-semibold tracking-tight text-white ${navOpen ? 'inline' : 'hidden group-hover/sb:inline'}`}>Nexa</span>
        </div>

        <nav className="sidebar-scroll flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 py-2">
          {visibleGroups.map((g, gi) => (
            <div key={gi} className={gi > 0 ? 'pt-3' : ''}>
              {g.label && (
                <div className={`px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/35 ${navOpen ? 'block' : 'hidden group-hover/sb:block'}`}>
                  {g.label}
                </div>
              )}
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  title={it.label}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      navOpen ? 'justify-start' : 'justify-center group-hover/sb:justify-start'
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
                      <span className={`truncate whitespace-nowrap ${navOpen ? 'inline' : 'hidden group-hover/sb:inline'}`}>{it.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* rodapé — só quando expandido (fixado ou hover) */}
        <div className={`shrink-0 border-t border-white/10 p-3 text-[11px] text-white/45 ${navOpen ? 'block' : 'hidden group-hover/sb:block'}`}>
          <div className="truncate">{user?.email}</div>
          <div className="mt-0.5 text-white/30">{isAdmin ? 'Administrador' : 'Vendedor'}</div>
        </div>
      </aside>

      {/* ===== COLUNA PRINCIPAL — empurrada só quando a sidebar está FIXADA (hover é sobreposto) ===== */}
      <div className={`flex h-full min-w-0 flex-col transition-[padding] duration-200 ${navOpen ? 'pl-60' : 'pl-16'}`}>
        {/* topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-base-200 px-6" style={{ background: 'var(--surface)' }}>
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={toggleNav}
              title={navOpen ? 'Desafixar menu (volta a abrir no hover)' : 'Fixar menu aberto'}
              aria-label={navOpen ? 'Desafixar menu' : 'Fixar menu'}
              className="-ml-1 shrink-0 rounded-md p-1.5 text-base-content/60 outline-none transition-colors hover:bg-base-200 hover:text-base-content focus-visible:ring-2 focus-visible:ring-brand-500/30"
            >
              <Icon name={navOpen ? 'chevronLeft' : 'chevronRight'} className="h-5 w-5" />
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-base-content/60 transition-colors hover:bg-base-200"
            >
              <Icon name={dark ? 'sun' : 'moon'} className="h-[18px] w-[18px]" />
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
