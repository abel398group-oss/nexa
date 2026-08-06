import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/shared/lib/api';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { Button, Card, Input, Textarea, Breadcrumb, Icon } from '@/shared/ui';

interface Version { id: string; version: number; approved: boolean; reviewer?: string; }
interface KB {
  id: string;
  topic: string;
  category: string;
  title: string;
  content: string;
  productCode?: string;
  /** F11: rascunho gerado pelo TicketIntelligenceService ainda não revisado por humano. */
  approved?: boolean;
  versions?: Version[];
}

const PAGE = 50;

export function KnowledgePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sel, setSel] = useState<KB | null>(null);
  const [msg, setMsg] = useState('');
  // form de criação rápida
  const [creating, setCreating] = useState(() => !!searchParams.get('title'));
  const [newTitle, setNewTitle] = useState(() => searchParams.get('title') ?? '');
  const [newCategory, setNewCategory] = useState(() => searchParams.get('category') ?? 'suporte');
  const [newTopic, setNewTopic] = useState('suporte-cliente');
  // F8: produto/parceiro a que o artigo pertence. Vazio = genérico, aparece
  // para todos os produtos (ex.: horário de atendimento).
  const [newProduct, setNewProduct] = useState('');
  const [newContent, setNewContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eContent, setEContent] = useState('');
  // busca + filtro + paginação + seleção em lote (padrão Contatos/Campanhas)
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  // debounce da busca (250ms) → alimenta a queryKey
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // React Query: lista paginada (busca/categoria/página entram na queryKey)
  const { data, isLoading: loading } = useQuery({
    queryKey: ['knowledge', debouncedSearch, category, page],
    queryFn: () =>
      api
        .get('/knowledge', { params: { limit: PAGE, offset: page * PAGE, search: debouncedSearch || undefined, category: category || undefined } })
        .then((r) => r.data as { items: KB[]; total: number }),
  });

  // F8: produtos que já têm conhecimento — alimenta a sugestão do campo.
  // Digitar livremente convida ao erro silencioso: um typo não casa com nada e
  // a Lia atende sem conhecimento, sem nada parecer errado.
  const { data: productCodes = [] } = useQuery({
    queryKey: ['knowledge-product-codes'],
    queryFn: () => api.get('/knowledge/product-codes').then((r) => r.data as { productCode: string; artigos: number }[]),
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['knowledge'] });

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];

  function toggleSel(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((s) => (s.size === items.length ? new Set() : new Set(items.map((k) => k.id))));
  }
  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    const ok = await confirm({
      title: 'Excluir conhecimento',
      message: `Excluir ${ids.length} item(ns)? A Lia deixa de usar essas informações.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await api.post('/knowledge/bulk-delete', { ids });
      toast.success(`${ids.length} item(ns) excluído(s).`);
      if (sel && ids.includes(sel.id)) setSel(null);
      setSelected(new Set());
      await invalidate();
    } catch {
      toast.error('Erro ao excluir em lote.');
    }
  }

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
      await invalidate();
      const r = await api.get(`/knowledge/${sel.id}`);
      setSel(r.data);
    } catch {
      toast.error('Erro ao salvar.');
    } finally {
      setBusy(false);
    }
  }
  async function approve() {
    if (!sel?.versions?.length) return;
    setBusy(true);
    try {
      // versions vem ordenado desc (findOne) — [0] é a versão mais recente
      await api.post(`/knowledge/versions/${sel.versions[0].id}/approve`);
      toast.success('Artigo aprovado! A Lia já pode usar este conhecimento.');
      await invalidate();
      const r = await api.get(`/knowledge/${sel.id}`);
      setSel(r.data);
    } catch {
      toast.error('Erro ao aprovar.');
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
      await invalidate();
    } catch {
      toast.error('Erro ao excluir.');
    }
  }

  async function createArticle() {
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error('Título e conteúdo são obrigatórios.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/knowledge', {
        title: newTitle.trim(),
        content: newContent.trim(),
        category: newCategory || 'suporte',
        topic: newTopic || 'suporte-cliente',
        // F8: era 'hipertms' fixo — todo artigo novo caía no produto principal,
        // mesmo sendo de um parceiro. Vazio = genérico (vale para todos).
        productCode: newProduct.trim() || undefined,
        tags: [],
      });
      toast.success('Artigo criado! A Lia já pode usar este conhecimento após o próximo reindex.');
      setCreating(false);
      setNewTitle('');
      setNewContent('');
      setSearchParams({});
      await invalidate();
    } catch {
      toast.error('Erro ao criar artigo.');
    } finally {
      setBusy(false);
    }
  }

  async function importTms() {
    setBusy(true);
    setMsg('');
    try {
      const r = await api.post('/knowledge/import/hipertms');
      setMsg(`Import: ${r.data.created} novos, ${r.data.updated} atualizados (${r.data.received} recebidos)`);
      await invalidate();
    } finally {
      setBusy(false);
    }
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
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => { setCreating(true); setSel(null); }}>
              <Icon name="plus" className="h-4 w-4" /> Novo
            </Button>
            <Button onClick={importTms} loading={busy} size="sm">
              {!busy && <Icon name="download" className="h-4 w-4" />}
              {busy ? 'Importando...' : 'Importar TMS'}
            </Button>
          </div>
        </div>
        {msg && <div className="border-b bg-emerald-50 px-5 py-2 text-xs text-emerald-700" style={{ borderColor: 'var(--border)' }}>{msg}</div>}

        {/* busca + filtro por categoria */}
        <div className="space-y-2 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <Input
            placeholder="Buscar título, conteúdo, tópico…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="text-sm"
          />
          {categories.length > 0 && (
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(0); }}
              className="input w-full text-sm"
            >
              <option value="">Todas as categorias</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {/* barra de seleção em lote */}
        {items.length > 0 && (
          <div className="flex items-center gap-2 border-b px-4 py-2 text-xs" style={{ borderColor: 'var(--border)' }}>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-base-content/70">
              <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} className="h-4 w-4 accent-brand-500" />
              Todos
            </label>
            {selected.size > 0 && (
              <>
                <span className="text-base-content/50">{selected.size} selecionado(s)</span>
                <Button size="sm" variant="outline" onClick={deleteSelected} className="ml-auto text-red-500 hover:bg-red-50">
                  <Icon name="trash" className="h-4 w-4" /> Excluir
                </Button>
              </>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-5 text-sm text-base-content/40">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="p-5 text-sm text-base-content/40">{search || category ? 'Nada encontrado.' : 'Vazio. Clique em "Importar TMS".'}</p>
          ) : (
            items.map((k) => (
              <div
                key={k.id}
                className={`flex items-start gap-2 border-b px-4 py-3 transition-colors hover:bg-base-100 ${sel?.id === k.id ? 'bg-base-200' : ''}`}
                style={{ borderColor: 'var(--border)' }}
              >
                <input type="checkbox" checked={selected.has(k.id)} onChange={() => toggleSel(k.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500" />
                <button onClick={() => open(k)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5 truncate text-sm font-medium text-base-content">
                    {k.approved === false && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700" title="Rascunho gerado pela IA — ainda não revisado">
                        Rascunho
                      </span>
                    )}
                    <span className="truncate">{k.title}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-base-content/50">{k.category} · {k.topic}</div>
                </button>
              </div>
            ))
          )}
        </div>

        {/* paginação */}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-base-content/60" style={{ borderColor: 'var(--border)' }}>
            <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-md px-2 py-1 hover:bg-base-200 disabled:opacity-40">‹ Anterior</button>
            <span>{page + 1} / {pages}</span>
            <button disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} className="rounded-md px-2 py-1 hover:bg-base-200 disabled:opacity-40">Próxima ›</button>
          </div>
        )}
      </div>

      {/* detalhe */}
      <div className="flex-1 overflow-y-auto p-8">
        {creating ? (
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-6 text-xl font-bold text-base-content">Novo artigo de conhecimento</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-base-content/60">Título</label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex: Como emitir boleto para o cliente" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/60">Categoria</label>
                  <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="suporte" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/60">Tópico</label>
                  <Input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="suporte-cliente" />
                </div>
              </div>
              {/* F8: separa o conhecimento por produto/parceiro */}
              <div>
                <label className="mb-1 block text-xs font-medium text-base-content/60">
                  Produto / parceiro <span className="font-normal text-base-content/40">(opcional)</span>
                </label>
                <Input
                  list="kb-product-codes"
                  value={newProduct}
                  onChange={(e) => setNewProduct(e.target.value)}
                  placeholder="Deixe vazio para valer em todos os produtos"
                />
                <datalist id="kb-product-codes">
                  {productCodes.map((p) => <option key={p.productCode} value={p.productCode} />)}
                </datalist>
                <p className="mt-1 text-xs text-base-content/40">
                  A Lia só usa este artigo em conversas do produto escolhido. Vazio = vale para todos
                  (ex.: horário de atendimento).
                  {productCodes.length > 0 && (
                    <> Em uso: {productCodes.map((p) => `${p.productCode} (${p.artigos})`).join(' · ')}.</>
                  )}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-base-content/60">Conteúdo (o que a Lia vai ler)</label>
                <Textarea
                  className="h-64 leading-relaxed"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Descreva o procedimento passo a passo. Inclua termos que o cliente usaria ao perguntar..."
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={createArticle} loading={busy}>{busy ? 'Salvando...' : 'Criar artigo'}</Button>
                <Button variant="ghost" onClick={() => { setCreating(false); setSearchParams({}); }}>Cancelar</Button>
              </div>
            </div>
          </div>
        ) : !sel ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-base-content/40">
            <Icon name="knowledge" className="h-10 w-10" />
            <span className="text-sm">Selecione um item ou crie um novo artigo</span>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase text-base-content/40">{sel.category} · {sel.topic}</div>
              {!editing && (
                <div className="flex gap-1">
                  {sel.approved === false && (
                    <Button size="sm" onClick={approve} loading={busy} className="bg-amber-600 hover:bg-amber-700">
                      {!busy && <Icon name="check" className="h-4 w-4" />} Aprovar
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={startEdit} title="Editar"><Icon name="edit" className="h-4 w-4" /> Editar</Button>
                  <button onClick={del} title="Excluir" className="inline-flex h-8 items-center gap-1 rounded-md px-2 py-1 text-sm text-red-500 hover:bg-red-50"><Icon name="trash" className="h-4 w-4" /> Excluir</button>
                </div>
              )}
            </div>
            {sel.approved === false && (
              <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Icon name="knowledge" className="h-3.5 w-3.5 shrink-0" />
                Rascunho gerado automaticamente a partir de um chamado resolvido — a Lia só vai usar este
                conteúdo depois que você aprovar.
              </div>
            )}

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
            {sel.versions && sel.versions.length > 1 && (
              <p className="text-xs text-base-content/40">{sel.versions.length} versões · atualizado automaticamente via TMS</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
