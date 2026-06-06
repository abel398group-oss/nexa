import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const items = [
  { to: '/inbox', label: 'Inbox', icon: '💬' },
  { to: '/contacts', label: 'CRM', icon: '👥' },
  { to: '/knowledge', label: 'KB', icon: '📚' },
];

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="flex h-full">
      {/* nav rail */}
      <nav className="flex w-16 flex-col items-center gap-1 border-r border-slate-200 bg-slate-900 py-4">
        <div className="mb-4 text-lg font-bold text-emerald-400">N</div>
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              `flex w-12 flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] ${
                isActive ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'
              }`
            }
          >
            <span className="text-base">{it.icon}</span>
            {it.label}
          </NavLink>
        ))}
        <button
          onClick={logout}
          title={user?.email}
          className="mt-auto flex w-12 flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] text-slate-400 hover:bg-slate-800"
        >
          <span className="text-base">⏻</span>
          sair
        </button>
      </nav>
      {/* conteúdo */}
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
