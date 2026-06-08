import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';

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
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eContent, setEContent] = useState('');
  const toast = useToast();
  const confirm = useConfirm();

  async function load() {
    const r = await api.get('/knowledge', { params: { limit: 100 } });
    setItems(r.data.items);
    setTotal(r.data.total);
  }
  useEffect(() => { load(); }, []);

  async function open(k: KB) {
    const r = await api.get(`/knowledge/${k.id}`);
    setSel(r.data);
    setEditing(false);
  }

  function startEdit() {
    if (!sel) return;
    setETitle(sel.title);
    setEContent(sel.content);
    setEditing(true);
  }
  async function saveEdit() {
    if (!sel) return;
    setBusy(true);
    try {
      await api.patch(`/knowledge/${sel.id}`, { title: eTitle, content: eContent });
      toast.success('Conhecimento atualizado! A Lia já usa o novo texto.');
      setEditing(false);
      await load();
      const r = await api.get(`/knowledge/${sel.id}`);
      setSel(r.data);
    } catch {
      toast.error('Erro ao salvar.');
    } finally {
      setBusy(false);
    }
  }
  async function del() {
    if (!sel) return;
    const ok = await confirm({
      title: 'Excluir conhecimento',
      message: `Excluir "${sel.title}"? A Lia deixa de usar essa informação.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await api.delete(`/knowledge/${sel.id}`);
      toast.success('Conhecimento excluído.');
      setSel(null);
      await load();
    } catch {
      toast.error('Erro ao excluir.');
    }
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
    <div className="flex h-full bg-zinc-50">
      {/* lista */}
      <div className="flex w-96 flex-col border-r bg-white">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h1 className="font-bold text-zinc-800">Conhecimento</h1>
            <p className="text-xs text-zinc-400">{total} itens · alimenta a Lia</p>
          </div>
          <button
            onClick={importTms}
            disabled={busy}
            className="rounded-lg bg-brand-600 px-3 py-2 text-xs text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {busy ? 'Importando...' : '↓ Importar TMS'}
          </button>
        </div>
        {msg && <div className="border-b bg-emerald-50 px-5 py-2 text-xs text-emerald-700">{msg}</div>}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 && <p className="p-5 text-sm text-zinc-400">Vazio. Clique em "Importar TMS".</p>}
          {items.map((k) => (
            <button
              key={k.id}
              onClick={() => open(k)}
              className={`block w-full border-b px-5 py-3 text-left hover:bg-zinc-50 ${sel?.id === k.id ? 'bg-zinc-100' : ''}`}
            >
              <div className="text-sm font-medium text-zinc-700">{k.title}</div>
              <div className="mt-0.5 text-xs text-zinc-400">{k.category} · {k.topic}</div>
            </button>
          ))}
        </div>
      </div>

      {/* detalhe */}
      <div className="flex-1 overflow-y-auto p-8">
        {!sel ? (
          <div className="flex h-full items-center justify-center text-zinc-400">Selecione um item</div>
        ) : (
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase text-zinc-400">{sel.category} · {sel.topic}</div>
              {!editing && (
                <div className="flex gap-1">
                  <button onClick={startEdit} title="Editar" className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100">✏️ Editar</button>
                  <button onClick={del} title="Excluir" className="rounded-md px-2 py-1 text-sm text-red-500 hover:bg-red-50">🗑️ Excluir</button>
                </div>
              )}
            </div>

            {editing ? (
              <div className="mb-6 space-y-3">
                <input className="input w-full text-lg font-bold" value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder="Título" />
                <textarea className="input h-56 w-full py-2 text-sm leading-relaxed" value={eContent} onChange={(e) => setEContent(e.target.value)} placeholder="Conteúdo que a Lia usa..." />
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50">{busy ? 'Salvando...' : 'Salvar'}</button>
                  <button onClick={() => setEditing(false)} className="rounded-lg px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100">Cancelar</button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="mb-4 text-2xl font-bold text-zinc-800">{sel.title}</h2>
                <div className="mb-6 whitespace-pre-line rounded-xl bg-white p-6 text-sm leading-relaxed text-zinc-700 shadow-sm">
                  {sel.content}
                </div>
              </>
            )}
            <h3 className="mb-2 text-sm font-semibold text-zinc-600">Versões (curadoria)</h3>
            <div className="space-y-2">
              {sel.versions?.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-lg bg-white px-4 py-2 text-sm shadow-sm">
                  <span className="text-zinc-600">v{v.version}</span>
                  {v.approved ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                      ✓ aprovada {v.reviewer && `· ${v.reviewer}`}
                    </span>
                  ) : (
                    <button
                      onClick={() => approve(v.id)}
                      className="rounded-lg bg-brand-600 px-3 py-1 text-xs text-white hover:bg-brand-700"
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
