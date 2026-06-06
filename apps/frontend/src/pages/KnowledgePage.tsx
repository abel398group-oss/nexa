import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Version { id: string; version: number; approved: boolean; reviewer?: string; }
interface KB {
  id: string;
  topic: string;
  category: string;
  title: string;
  content: string;
  productCode?: string;
  versions?: Version[];
}

export function KnowledgePage() {
  const [items, setItems] = useState<KB[]>([]);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<KB | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api.get('/knowledge', { params: { limit: 100 } });
    setItems(r.data.items);
    setTotal(r.data.total);
  }
  useEffect(() => { load(); }, []);

  async function open(k: KB) {
    const r = await api.get(`/knowledge/${k.id}`);
    setSel(r.data);
  }

  async function importTms() {
    setBusy(true);
    setMsg('');
    try {
      const r = await api.post('/knowledge/import/hipertms');
      setMsg(`Import: ${r.data.created} novos, ${r.data.updated} atualizados (${r.data.received} recebidos)`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function approve(versionId: string) {
    await api.post(`/knowledge/versions/${versionId}/approve`, { reviewer: 'admin' });
    if (sel) await open(sel);
  }

  return (
    <div className="flex h-full bg-slate-50">
      {/* lista */}
      <div className="flex w-96 flex-col border-r bg-white">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h1 className="font-bold text-slate-800">Conhecimento</h1>
            <p className="text-xs text-slate-400">{total} itens · alimenta a Lia</p>
          </div>
          <button
            onClick={importTms}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? 'Importando...' : '↓ Importar TMS'}
          </button>
        </div>
        {msg && <div className="border-b bg-emerald-50 px-5 py-2 text-xs text-emerald-700">{msg}</div>}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 && <p className="p-5 text-sm text-slate-400">Vazio. Clique em "Importar TMS".</p>}
          {items.map((k) => (
            <button
              key={k.id}
              onClick={() => open(k)}
              className={`block w-full border-b px-5 py-3 text-left hover:bg-slate-50 ${sel?.id === k.id ? 'bg-slate-100' : ''}`}
            >
              <div className="text-sm font-medium text-slate-700">{k.title}</div>
              <div className="mt-0.5 text-xs text-slate-400">{k.category} · {k.topic}</div>
            </button>
          ))}
        </div>
      </div>

      {/* detalhe */}
      <div className="flex-1 overflow-y-auto p-8">
        {!sel ? (
          <div className="flex h-full items-center justify-center text-slate-400">Selecione um item</div>
        ) : (
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 text-xs uppercase text-slate-400">{sel.category} · {sel.topic}</div>
            <h2 className="mb-4 text-2xl font-bold text-slate-800">{sel.title}</h2>
            <div className="mb-6 rounded-xl bg-white p-6 text-sm leading-relaxed text-slate-700 shadow-sm">
              {sel.content}
            </div>
            <h3 className="mb-2 text-sm font-semibold text-slate-600">Versões (curadoria)</h3>
            <div className="space-y-2">
              {sel.versions?.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-lg bg-white px-4 py-2 text-sm shadow-sm">
                  <span className="text-slate-600">v{v.version}</span>
                  {v.approved ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                      ✓ aprovada {v.reviewer && `· ${v.reviewer}`}
                    </span>
                  ) : (
                    <button
                      onClick={() => approve(v.id)}
                      className="rounded-lg bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700"
                    >
                      Aprovar
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
