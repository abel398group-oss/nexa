import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui';
import {
  type Contact,
  type ImportContactInput,
  listContacts,
  createContact,
  updateContact,
  reactivateContact,
  deleteContact,
  importContacts,
} from '@/features/contact';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

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
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'optout'>('todos');
  const toast = useToast();
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    try {
      const r = await listContacts({ search, limit: 100 });
      setItems(r.items);
      setTotal(r.total);
    } finally {
      setLoading(false);
    }
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
      if (editId) {
        // edição (não reenvia source)
        await updateContact(editId, form);
        toast.success('Contato atualizado!');
      } else {
        await createContact(form);
        toast.success('Contato salvo!');
      }
      setForm(empty);
      setEditId(null);
      setShowForm(false);
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setErr(Array.isArray(msg) ? msg.join(', ') : msg || 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  }

  function openEdit(c: Contact) {
    setEditId(c.id);
    setForm({ phone: c.phone, name: c.name || '', company: c.company || '', email: c.email || '' });
    setErr('');
    setShowForm(true);
  }

  async function reactivate(c: Contact) {
    const ok = await confirm({
      title: 'Reativar contato',
      message: `Reativar ${c.name || c.phone}? ⚠️ Só faça isso se a pessoa CONSENTIU em voltar a receber mensagens (LGPD).`,
      variant: 'warning',
      confirmLabel: 'Reativar',
    });
    if (!ok) return;
    try {
      await reactivateContact(c.id);
      toast.success('Contato reativado.');
      await load();
    } catch {
      toast.error('Erro ao reativar.');
    }
  }

  async function del(c: Contact) {
    const ok = await confirm({
      title: 'Excluir contato',
      message: `Excluir ${c.name || c.phone}? Esta ação não pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await deleteContact(c.id);
      toast.success('Contato excluído.');
      await load();
    } catch {
      toast.error('Erro ao excluir.');
    }
  }

  async function doImport(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setImportMsg('');
    try {
      // formato por linha: telefone[,nome[,empresa]]
      const contacts: ImportContactInput[] = csv
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [phone, name, company] = l.split(/[,;\t]/).map((x) => x?.trim());
          return { phone: (phone || '').replace(/\D/g, ''), name: name || undefined, company: company || undefined, source: 'import' };
        })
        .filter((c) => c.phone.length >= 12);
      if (contacts.length === 0) { toast.error('Nenhum telefone válido (use 55+DDD+número).'); setBusy(false); return; }
      const r = await importContacts(contacts);
      toast.success(`${r.imported} contatos importados.`);
      setCsv('');
      setShowImport(false);
      await load();
    } catch (e: any) {
      toast.error('Erro ao importar contatos.');
    } finally {
      setBusy(false);
    }
  }

  // lê arquivo .csv/.txt escolhido e joga o conteúdo na caixa
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ''));
    reader.readAsText(f, 'utf-8');
  }

  // baixa um arquivo-modelo de exemplo
  function baixarModelo() {
    const exemplo =
      'telefone,nome,empresa\n' +
      '5511999998888,João Silva,Transportadora Silva\n' +
      '5511988887777,Maria Souza,Souza Logística\n' +
      '5511977776666,,';
    const blob = new Blob([exemplo], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_contatos.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const badge = (s?: string) => {
    const map: Record<string, string> = {
      hot: 'bg-red-100 text-red-700',
      warm: 'bg-amber-100 text-amber-700',
      cold: 'bg-sky-100 text-sky-700',
    };
    return map[s ?? ''] || 'bg-base-200 text-base-content/60';
  };

  const optOutCount = items.filter((c) => c.status === 'opted_out').length;
  const shown = items.filter((c) =>
    filtro === 'todos' ? true : filtro === 'ativos' ? c.status !== 'opted_out' : c.status === 'opted_out',
  );

  return (
    <div className="flex h-full flex-col bg-base-100">
      {/* header */}
      <div className="flex items-center justify-between border-b border-base-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-base-content">Contatos</h1>
          <p className="text-xs text-base-content/50">{total} cadastrados{optOutCount > 0 && ` · ${optOutCount} descadastrado(s)`}</p>
        </div>
        <div className="flex gap-2">
          <select
            className="input w-auto"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as any)}
            title="Filtrar por situação"
          >
            <option value="todos">Todos</option>
            <option value="ativos">Só ativos</option>
            <option value="optout">Só descadastrados</option>
          </select>
          <input
            className="input w-64"
            placeholder="Buscar nome, telefone, empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <Button variant="outline" onClick={load}>Buscar</Button>
          <Button variant="outline" onClick={() => { setShowImport(true); setImportMsg(''); }}>↑ Importar</Button>
          <Button onClick={() => { setEditId(null); setForm(empty); setShowForm(true); setErr(''); }}>+ Novo</Button>
        </div>
      </div>

      {/* tabela */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <SkeletonList rows={6} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon="👥"
            title={search || filtro !== 'todos' ? 'Nenhum contato encontrado' : 'Nenhum contato ainda'}
            description={search || filtro !== 'todos' ? 'Tente outro filtro ou termo de busca.' : 'Importe sua lista ou cadastre o primeiro contato.'}
            action={
              <button onClick={() => { setShowImport(true); setImportMsg(''); }} className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">
                ↑ Importar contatos
              </button>
            }
          />
        ) : (
        <table className="w-full overflow-hidden rounded-xl text-sm" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-card)' }}>
          <thead className="border-b text-left text-xs uppercase" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className={`border-b last:border-0 hover:bg-base-100 ${c.status === 'opted_out' ? 'opacity-60' : ''}`} style={{ borderColor: 'var(--border)' }}>
                <td className="px-4 py-3 font-medium text-base-content">
                  {c.name || '—'}
                  {c.status === 'opted_out' && (
                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">🚫 descadastrado</span>
                  )}
                </td>
                <td className="px-4 py-3 text-base-content/80">{c.phone}</td>
                <td className="px-4 py-3 text-base-content/80">{c.company || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${badge(c.leadStatus)}`}>
                    {c.leadStatus || 'novo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-base-content/50">{c.source || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {c.status === 'opted_out' && (
                      <button onClick={() => reactivate(c)} title="Reativar (com consentimento)" className="rounded-md px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-100">↩️ Reativar</button>
                    )}
                    <button onClick={() => openEdit(c)} title="Editar" className="rounded-md px-2 py-1 text-base-content/50 hover:bg-base-200">✏️</button>
                    <button onClick={() => del(c)} title="Excluir" className="rounded-md px-2 py-1 text-red-500 hover:bg-red-100">🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {/* modal novo contato */}
      {showForm && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30" onClick={() => setShowForm(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
            className="w-96 rounded-xl p-6 shadow-xl"
            style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}
          >
            <h2 className="mb-4 text-lg font-bold text-base-content">{editId ? 'Editar contato' : 'Novo contato'}</h2>
            {[
              { k: 'phone', label: 'Telefone (55DDDxxxxxxxx)', ph: '5511999998888' },
              { k: 'name', label: 'Nome', ph: 'João Silva' },
              { k: 'company', label: 'Empresa', ph: 'Transportadora X' },
              { k: 'email', label: 'Email', ph: 'joao@empresa.com' },
            ].map((f) => (
              <div key={f.k} className="mb-3">
                <label className="mb-1 block text-xs text-base-content/50">{f.label}</label>
                <input
                  className="input w-full"
                  placeholder={f.ph}
                  value={(form as any)[f.k]}
                  onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                />
              </div>
            ))}
            {err && <p className="mb-3 text-sm text-red-500">{err}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button loading={busy}>
                {busy ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* modal importar */}
      {showImport && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30" onClick={() => setShowImport(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={doImport}
            className="w-[30rem] rounded-xl p-6 shadow-elevated"
            style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)' }}
          >
            <h2 className="mb-1 text-lg font-bold text-base-content">Importar contatos</h2>
            <p className="mb-3 text-xs text-base-content/50">
              Formato: <code>telefone,nome,empresa</code> (ex: 5511999998888,João,Transp X). Só o <strong>telefone</strong> é obrigatório (55+DDD+número).
            </p>

            {/* opção: subir arquivo .csv/.txt + baixar modelo */}
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
              <label className="btn-primary cursor-pointer text-xs">
                📎 Escolher arquivo (.csv ou .txt)
                <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={onPickFile} />
              </label>
              <Button type="button" variant="outline" size="sm" onClick={baixarModelo}>
                ⬇️ Baixar modelo
              </Button>
              <span className="text-[11px] text-base-content/40">ou cole abaixo 👇</span>
            </div>

            <textarea
              className="input mb-3 h-40 w-full py-2 font-mono text-xs"
              placeholder={"5511999998888,João Silva,Transportadora X\n5511988887777,Maria"}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
            />
            {importMsg && <p className="mb-3 text-sm text-base-content/70">{importMsg}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowImport(false)}>Fechar</Button>
              <Button loading={busy}>{busy ? 'Importando...' : 'Importar'}</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
