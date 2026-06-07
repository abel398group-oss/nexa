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
  const [showImport, setShowImport] = useState(false);
  const [csv, setCsv] = useState('');
  const [importMsg, setImportMsg] = useState('');

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

  async function doImport(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setImportMsg('');
    try {
      // formato por linha: telefone[,nome[,empresa]]
      const contacts = csv
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [phone, name, company] = l.split(/[,;\t]/).map((x) => x?.trim());
          return { phone: (phone || '').replace(/\D/g, ''), name: name || undefined, company: company || undefined, source: 'import' };
        })
        .filter((c) => c.phone.length >= 12);
      if (contacts.length === 0) { setImportMsg('Nenhum telefone válido (use 55+DDD+número).'); return; }
      const r = await api.post('/contacts/import', { contacts });
      setImportMsg(`✅ ${r.data.imported} contatos importados.`);
      setCsv('');
      await load();
    } catch (e: any) {
      setImportMsg('Erro ao importar.');
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
    return map[s ?? ''] || 'bg-zinc-100 text-zinc-500';
  };

  return (
    <div className="flex h-full flex-col bg-zinc-50">
      {/* header */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-zinc-800">Contatos</h1>
          <p className="text-xs text-zinc-400">{total} cadastrados</p>
        </div>
        <div className="flex gap-2">
          <input
            className="w-64 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Buscar nome, telefone, empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <button onClick={load} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50">
            Buscar
          </button>
          <button
            onClick={() => { setShowImport(true); setImportMsg(''); }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50"
          >
            ↑ Importar
          </button>
          <button
            onClick={() => { setShowForm(true); setErr(''); }}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"
          >
            + Novo
          </button>
        </div>
      </div>

      {/* tabela */}
      <div className="flex-1 overflow-auto p-6">
        <table className="w-full overflow-hidden rounded-xl bg-white text-sm shadow-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-400">
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
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">Nenhum contato.</td></tr>
            )}
            {items.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-zinc-50">
                <td className="px-4 py-3 font-medium text-zinc-700">{c.name || '—'}</td>
                <td className="px-4 py-3 text-zinc-600">{c.phone}</td>
                <td className="px-4 py-3 text-zinc-600">{c.company || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${badge(c.leadStatus)}`}>
                    {c.leadStatus || 'novo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-400">{c.source || '—'}</td>
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
            <h2 className="mb-4 text-lg font-bold text-zinc-800">Novo contato</h2>
            {[
              { k: 'phone', label: 'Telefone (55DDDxxxxxxxx)', ph: '5511999998888' },
              { k: 'name', label: 'Nome', ph: 'João Silva' },
              { k: 'company', label: 'Empresa', ph: 'Transportadora X' },
              { k: 'email', label: 'Email', ph: 'joao@empresa.com' },
            ].map((f) => (
              <div key={f.k} className="mb-3">
                <label className="mb-1 block text-xs text-zinc-500">{f.label}</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  placeholder={f.ph}
                  value={(form as any)[f.k]}
                  onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                />
              </div>
            ))}
            {err && <p className="mb-3 text-sm text-red-500">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm text-zinc-500">
                Cancelar
              </button>
              <button disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50">
                {busy ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* modal importar */}
      {showImport && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30" onClick={() => setShowImport(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={doImport} className="w-[30rem] rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold text-zinc-800">Importar contatos</h2>
            <p className="mb-3 text-xs text-zinc-500">Cole um por linha: <code>telefone,nome,empresa</code> (ex: 5511999998888,João,Transp X). Só o telefone é obrigatório.</p>
            <textarea
              className="mb-3 h-40 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs"
              placeholder={"5511999998888,João Silva,Transportadora X\n5511988887777,Maria"}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
            />
            {importMsg && <p className="mb-3 text-sm text-zinc-600">{importMsg}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowImport(false)} className="rounded-lg px-4 py-2 text-sm text-zinc-500">Fechar</button>
              <button disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50">{busy ? 'Importando...' : 'Importar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
