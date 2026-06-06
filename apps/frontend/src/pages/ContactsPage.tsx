import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Contact {
  id: string;
  phone: string;
  name?: string;
  company?: string;
  email?: string;
  leadStatus?: string;
  source?: string;
  createdAt: string;
}

const empty = { phone: '', name: '', company: '', email: '' };

export function ContactsPage() {
  const [items, setItems] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api.get('/contacts', { params: { search: search || undefined, limit: 100 } });
    setItems(r.data.items);
    setTotal(r.data.total);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.post('/contacts', {
        phone: form.phone.trim(),
        name: form.name || undefined,
        company: form.company || undefined,
        email: form.email || undefined,
        source: 'manual',
      });
      setForm(empty);
      setShowForm(false);
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setErr(Array.isArray(msg) ? msg.join(', ') : msg || 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  }

  const badge = (s?: string) => {
    const map: Record<string, string> = {
      hot: 'bg-red-100 text-red-700',
      warm: 'bg-amber-100 text-amber-700',
      cold: 'bg-sky-100 text-sky-700',
    };
    return map[s ?? ''] || 'bg-slate-100 text-slate-500';
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* header */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Contatos</h1>
          <p className="text-xs text-slate-400">{total} cadastrados</p>
        </div>
        <div className="flex gap-2">
          <input
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Buscar nome, telefone, empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <button onClick={load} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Buscar
          </button>
          <button
            onClick={() => { setShowForm(true); setErr(''); }}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            + Novo
          </button>
        </div>
      </div>

      {/* tabela */}
      <div className="flex-1 overflow-auto p-6">
        <table className="w-full overflow-hidden rounded-xl bg-white text-sm shadow-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Origem</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nenhum contato.</td></tr>
            )}
            {items.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-700">{c.name || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                <td className="px-4 py-3 text-slate-600">{c.company || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${badge(c.leadStatus)}`}>
                    {c.leadStatus || 'novo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{c.source || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* modal novo contato */}
      {showForm && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30" onClick={() => setShowForm(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
            className="w-96 rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 className="mb-4 text-lg font-bold text-slate-800">Novo contato</h2>
            {[
              { k: 'phone', label: 'Telefone (55DDDxxxxxxxx)', ph: '5511999998888' },
              { k: 'name', label: 'Nome', ph: 'João Silva' },
              { k: 'company', label: 'Empresa', ph: 'Transportadora X' },
              { k: 'email', label: 'Email', ph: 'joao@empresa.com' },
            ].map((f) => (
              <div key={f.k} className="mb-3">
                <label className="mb-1 block text-xs text-slate-500">{f.label}</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder={f.ph}
                  value={(form as any)[f.k]}
                  onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                />
              </div>
            ))}
            {err && <p className="mb-3 text-sm text-red-500">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm text-slate-500">
                Cancelar
              </button>
              <button disabled={busy} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
                {busy ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
