import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/shared/lib/api';
import { Icon } from '@/components/ui/icons';

interface Notif { id: string; type: string; title: string; body: string; link?: string | null; read: boolean; createdAt: string }

function notifIcon(type: string): string {
  switch (type) {
    case 'escalation':   return '🔴';
    case 'hot_lead':     return '🔥';
    case 'complaint':    return '⚠️';
    case 'opt_out':      return '🚫';
    // Intelligence loop (ADR 019)
    case 'recurrence':   return '🔁';
    case 'bug_probable': return '🐛';
    case 'kb_candidate': return '📝';
    default:             return '•';
  }
}

function ago(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  async function load() {
    try {
      const r = await api.get('/notifications');
      setItems(r.data.items);
      setUnread(r.data.unread);
    } catch {
      /* silencioso */
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // atualiza a cada 30s
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function openMenu() {
    setOpen((o) => !o);
  }
  async function markAll() {
    await api.post('/notifications/read-all');
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }
  async function clickItem(n: Notif) {
    if (!n.read) { await api.patch(`/notifications/${n.id}/read`).catch(() => {}); setUnread((u) => Math.max(0, u - 1)); }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={openMenu}
        title="Notificações"
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-base-content/70 transition-colors hover:bg-base-200"
      >
        <Icon name="bell" className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-base-200 bg-white shadow-elevated dark:bg-sidebar">
          <div className="flex items-center justify-between border-b border-base-200 px-4 py-2.5">
            <span className="text-sm font-semibold text-base-content">Notificações</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-[11px] text-brand-600 hover:underline">Marcar todas lidas</button>
            )}
          </div>
          <div className="max-h-96 overflow-auto">
            {items.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-base-content/40">Nenhuma notificação</div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => clickItem(n)}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-base-100 px-4 py-2.5 text-left transition-colors hover:bg-base-100 ${
                  n.read ? '' : 'bg-sky-50'
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-medium text-base-content">
                    <span className="mr-1">{notifIcon(n.type)}</span>{n.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-base-content/40">{ago(n.createdAt)}</span>
                </div>
                {n.body && <span className="text-xs text-base-content/60">{n.body}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
