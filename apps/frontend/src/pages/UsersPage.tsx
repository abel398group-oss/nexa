import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card } from '@/shared/ui';

interface User {
  id: string; email: string; name?: string; role: string;
  permissions: string[]; isActive: boolean;
}

// rótulos amigáveis das áreas
const AREA_LABEL: Record<string, string> = {
  dashboard: 'Painel', inbox: 'Inbox', contacts: 'Contatos', knowledge: 'Conhecimento',
  sellers: 'Vendedores', campaigns: 'Disparo', ai_control: 'Controle da IA', users: 'Usuários',
};
const ALL_AREAS = ['dashboard', 'inbox', 'contacts', 'knowledge', 'sellers', 'campaigns', 'ai_control', 'users'];

export function UsersPage() {
  const [items, setItems] = useState<User[]>([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'operacional', permissions: ['dashboard', 'inbox'] as string[] });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() { setItems((await api.get('/users')).data); }
  useEffect(() => { load(); }, []);

  function togglePerm(set: string[], p: string) {
    return set.includes(p) ? set.filter((x) => x !== p) : [...set, p];
  }

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await api.post('/users', form);
      setShow(false);
      setForm({ name: '', email: '', password: '', role: 'operacional', permissions: ['dashboard', 'inbox'] });
      await load();
    } catch (e: any) {
      const m = e?.response?.data?.message; setErr(Array.isArray(m) ? m.join(', ') : m || 'Erro');
    } finally { setBusy(false); }
  }

  // salva permissões direto na linha (toggle inline)
  async function savePerms(u: User, perms: string[]) {
    setItems((prev) => prev.map((x) => x.id === u.id ? { ...x, permissions: perms } : x));
    await api.patch(`/users/${u.id}`, { permissions: perms });
  }
  async function toggleActive(u: User) {
    await api.patch(`/users/${u.id}/active`, { active: !u.isActive });
    await load();
  }

  return (
    <div className="h-full overflow-auto bg-base-100 p-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-base-content">Usuários & Acessos</h1>
          <p className="text-xs text-base-content/50">Crie logins e marque quais áreas cada um pode acessar. Admin acessa tudo.</p>
        </div>
        <Button onClick={() => { setShow(true); setErr(''); }}>+ Novo usuário</Button>
      </div>

      <div className="space-y-3">
        {items.map((u) => (
          <Card key={u.id} className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="font-semibold text-base-content">{u.name || u.email}</span>
                <span className="ml-2 text-xs text-base-content/50">{u.email}</span>
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${u.role === 'admin' ? 'bg-brand-100 text-brand-700' : 'bg-base-200 text-base-content/70'}`}>{u.role}</span>
                {!u.isActive && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700">inativo</span>}
              </div>
              <button onClick={() => toggleActive(u)} className="rounded-md border border-base-300 px-3 py-1 text-xs hover:bg-base-100">
                {u.isActive ? 'Desativar' : 'Ativar'}
              </button>
            </div>
            {u.role === 'admin' ? (
              <p className="text-xs text-base-content/50">🔓 Acesso total (administrador)</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ALL_AREAS.map((a) => {
                  const on = u.permissions.includes(a);
                  return (
                    <button
                      key={a}
                      onClick={() => savePerms(u, togglePerm(u.permissions, a))}
                      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-base-300 text-base-content/50'}`}
                      style={!on ? { background: 'var(--surface)' } : undefined}
                    >
                      {on ? '✓ ' : ''}{AREA_LABEL[a]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {show && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30" onClick={() => setShow(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={create} className="w-[26rem] rounded-xl p-6 shadow-xl" style={{ background: 'var(--surface)' }}>
            <h2 className="mb-4 text-lg font-bold text-base-content">Novo usuário</h2>
            <input className="input mb-2" placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input mb-2" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input type="password" className="input mb-2" placeholder="Senha (mín. 6)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <label className="mb-1 block text-xs text-base-content/60">Papel</label>
            <select className="input mb-3" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="operacional">Operacional</option>
              <option value="gestor">Gestor</option>
              <option value="vendedor">Vendedor</option>
              <option value="admin">Administrador (acesso total)</option>
            </select>
            {form.role !== 'admin' && (
              <>
                <label className="mb-1 block text-xs text-base-content/60">Áreas liberadas</label>
                <div className="mb-3 flex flex-wrap gap-2">
                  {ALL_AREAS.map((a) => {
                    const on = form.permissions.includes(a);
                    return (
                      <button type="button" key={a} onClick={() => setForm({ ...form, permissions: togglePerm(form.permissions, a) })}
                        className={`rounded-md border px-2.5 py-1 text-xs ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-base-300 bg-white text-base-content/50'}`}>
                        {on ? '✓ ' : ''}{AREA_LABEL[a]}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {err && <p className="mb-3 text-sm text-red-500">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShow(false)} className="rounded-md px-4 py-2 text-sm text-base-content/60">Cancelar</button>
              <button disabled={busy} className="btn-primary">{busy ? 'Criando...' : 'Criar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
