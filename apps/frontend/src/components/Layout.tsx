import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { HelpDrawer, HELP } from '@/components/HelpDrawer';
import { GuidedTour, TourStep } from '@/components/GuidedTour';

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
  { to: '/contacts', label: 'Contatos', icon: '👥', perm: 'contacts' },
  { to: '/knowledge', label: 'Conhecimento', icon: '📚', perm: 'knowledge' },
  { to: '/sellers', label: 'Vendedores', icon: '🧑‍💼', perm: 'sellers' },
  { to: '/campaigns', label: 'Disparo', icon: '📣', perm: 'campaigns' },
  { to: '/users', label: 'Usuários', icon: '🔐', perm: 'users' },
];

const titles: Record<string, string> = {
  '/dashboard': 'Painel',
  '/inbox': 'Inbox',
  '/contacts': 'Contatos',
  '/knowledge': 'Base de Conhecimento',
  '/sellers': 'Vendedores',
  '/campaigns': 'Disparo de Leads',
  '/users': 'Usuários & Acessos',
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

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';
  const perms = user?.permissions ?? [];
  const visibleItems = items.filter((it) => isAdmin || perms.includes(it.perm));
  const pageTitle = titles[location.pathname] ?? 'Nexa';
  const [helpOpen, setHelpOpen] = useState(false);
  const hasHelp = !!HELP[location.pathname];
  const [tourOpen, setTourOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('nexa_theme', isDark ? 'dark' : 'light');
    setDark(isDark);
  }

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
    <div className="flex h-full">
      {/* ===== SIDEBAR larga (midnight enterprise) ===== */}
      <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-white/90">
        <div className="flex h-14 items-center gap-2 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">N</span>
          <span className="text-base font-semibold tracking-tight text-white">Nexa</span>
        </div>
        <div className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">Menu</div>
        <nav className="flex-1 space-y-0.5 px-2">
          {visibleItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
                  <span className="truncate">{it.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3 text-[11px] text-white/45">
          {user?.email}
          <div className="mt-0.5 text-white/30">{isAdmin ? 'Administrador' : 'Vendedor'}</div>
        </div>
      </aside>

      {/* ===== COLUNA PRINCIPAL ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-base-200 bg-white px-6">
          <h1 className="text-base font-semibold text-base-content">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              title="Alternar tema claro/escuro"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-200"
            >
              {dark ? '☀️ Claro' : '🌙 Escuro'}
            </button>
            <button
              onClick={() => setTourOpen(true)}
              title="Refazer o tour de apresentação"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-200"
            >
              🎓 Tour
            </button>
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
            {(isAdmin || perms.includes('ai_control')) && <KillSwitch />}
            <button
              onClick={logout}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-200"
            >
              ⏻ Sair
            </button>
          </div>
        </header>
        {/* conteúdo */}
        <div className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>

      {helpOpen && <HelpDrawer pathname={location.pathname} onClose={() => setHelpOpen(false)} />}
      {tourOpen && <GuidedTour steps={TOUR_STEPS} onClose={closeTour} />}
    </div>
  );
}
