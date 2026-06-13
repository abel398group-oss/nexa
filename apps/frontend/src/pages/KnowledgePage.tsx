import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button, Card, Input, Textarea, Breadcrumb } from '@/shared/ui';

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
    <div className="flex h-full bg-base-100">
      {/* lista */}
      <div className="flex w-96 flex-col border-r" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <div>
            <Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Conhecimento' }]} />
            <h1 className="text-lg font-bold text-base-content">Conhecimento</h1>
            <p className="text-xs text-base-content/50">{total} itens · alimenta a Lia</p>
          </div>
          <Button onClick={importTms} loading={busy} size="sm">
            {busy ? 'Importando...' : '↓ Importar TMS'}
          </Button>
        </div>
        {msg && <div className="border-b bg-emerald-50 px-5 py-2 text-xs text-emerald-700" style={{ borderColor: 'var(--border)' }}>{msg}</div>}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 && <p className="p-5 text-sm text-base-content/40">Vazio. Clique em "Importar TMS".</p>}
          {items.map((k) => (
            <button
              key={k.id}
              onClick={() => open(k)}
              className={`block w-full border-b px-5 py-3 text-left transition-colors hover:bg-base-100 ${sel?.id === k.id ? 'bg-base-200' : ''}`}
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="text-sm font-medium text-base-content">{k.title}</div>
              <div className="mt-0.5 text-xs text-base-content/50">{k.category} · {k.topic}</div>
            </button>
          ))}
        </div>
      </div>

      {/* detalhe */}
      <div className="flex-1 overflow-y-auto p-8">
        {!sel ? (
          <div className="flex h-full items-center justify-center text-base-content/40">Selecione um item</div>
        ) : (
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase text-base-content/40">{sel.category} · {sel.topic}</div>
              {!editing && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={startEdit} title="Editar">✏️ Editar</Button>
                  <button onClick={del} title="Excluir" className="h-8 rounded-md px-2 py-1 text-sm text-red-500 hover:bg-red-50">🗑️ Excluir</button>
                </div>
              )}
            </div>

            {editing ? (
              <div className="mb-6 space-y-3">
                <Input className="text-lg font-bold" value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder="Título" />
                <Textarea className="h-56 leading-relaxed" value={eContent} onChange={(e) => setEContent(e.target.value)} placeholder="Conteúdo que a Lia usa..." />
                <div className="flex gap-2">
                  <Button onClick={saveEdit} loading={busy}>{busy ? 'Salvando...' : 'Salvar'}</Button>
                  <Button variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="mb-4 text-2xl font-bold text-base-content">{sel.title}</h2>
                <Card className="mb-6 whitespace-pre-line p-6 text-sm leading-relaxed text-base-content/80">
                  {sel.content}
                </Card>
              </>
            )}
            <h3 className="mb-2 text-sm font-semibold text-base-content/70">Versões (curadoria)</h3>
            <div className="space-y-2">
              {sel.versions?.map((v) => (
                <Card key={v.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-base-content/70">v{v.version}</span>
                  {v.approved ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                      ✓ aprovada {v.reviewer && `· ${v.reviewer}`}
                    </span>
                  ) : (
                    <Button onClick={() => approve(v.id)} size="sm">
                      Aprovar
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
